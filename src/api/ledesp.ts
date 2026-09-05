/**
 * The app's link to the two devices at the studio door: the LED strip (driven
 * by ledESP) and the 7" screen. Neither is wired to the other; both simply read
 * /api/door, which is what stops them ever disagreeing.
 *
 * There are two roads to the strip and the app takes whichever is open:
 *
 *  1. DIRECT — the browser calls ledESP's own web server on the house Wi-Fi.
 *     Instant, but only possible when this page is itself served over http. An
 *     https page may not read an http device; that is a browser rule and no
 *     code changes it. So this is attempted only on a LAN build.
 *
 *  2. RELAY — the app writes to /api/door and the devices poll it. The screen
 *     polls every 3s and radio-pings the strip so they change together. The
 *     strip still HTTPS-polls as backup if the screen is off.
 *
 * Everything here is best effort and never throws. The door is an output, not a
 * source of truth — if it is unplugged the app carries on exactly as before.
 */

const RAW = String(import.meta.env.VITE_LEDESP_URL ?? "").replace(/\/$/, "");

/** ledESP's address on the house Wi-Fi. */
export const LEDESP_URL = RAW;

/**
 * Whether the direct road is worth attempting at all.
 *
 * On an https page it never is: the request is blocked before it leaves the
 * browser. Trying anyway just spends a timeout on every check and fills the
 * console with errors that look like a fault and are not one.
 */
export const ledespEnabled =
  RAW.length > 0 &&
  (typeof location === "undefined" || location.protocol !== "https:");

const RELAY = "/api/door";

let lastPushed: string | null = null;
let lastPushedAt = 0;

async function req(url: string, init: RequestInit, ms: number): Promise<Response | null> {
  const ctrl = new AbortController();
  const bail = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(bail);
  }
}

/**
 * Tell the door which state the studio is in. Drives the strip and the screen
 * together, because both read the value this writes.
 * Safe to call on every change; unchanged repeats are dropped.
 */
const STATE_VISUAL: Record<string, string> = {
  available: "ok",
  class: "wait",
  meeting: "wait",
  audio_rec: "onair",
  video_rec: "onair",
  emergency: "emergency",
};

export async function pushLedEspState(state: string, opts?: { force?: boolean }): Promise<boolean> {
  if (!state) return true;

  const visual = STATE_VISUAL[state];
  const key = visual ? `${state}|${visual}` : state;

  // The promised dedup, for real this time: the store's optimistic push and
  // the adapter's push both fire on one dial turn — the second within a few
  // seconds is pure duplicate traffic against the door relay.
  if (!opts?.force && lastPushed === key && Date.now() - lastPushedAt < 10_000) return true;

  // NOTE deliberately not cleared here: a state change must never wipe a
  // delivery OTP or door note off the screen (INVENTORY §door). Notes are
  // cleared only by pushDoorMessage("").

  const roads = [
    req(RELAY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(visual ? { state, visual } : { state }),
    }, 6000),
  ];

  if (ledespEnabled) {
    roads.push(req(
      `${LEDESP_URL}/select/studio_state/set?option=${encodeURIComponent(state)}`,
      { method: "POST", mode: "cors" }, 1500,
    ));
  }

  const ok = (await Promise.all(roads)).some((r) => r !== null && r.ok);
  // Live Cloudflare still ignores visual on a state POST, so a leftover SOS
  // never clears. A second write with no state is the strip-shaped report the
  // current worker does accept.
  if (ok && visual) {
    await req(RELAY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device: "app", visual }),
    }, 6000);
  }
  if (ok) {
    lastPushed = key;
    lastPushedAt = Date.now();
  }
  return ok;
}

/** Put an announcement on the door without changing studio state. */
export async function pushDoorVisual(visual: string): Promise<boolean> {
  lastPushed = null;
  const res = await req(RELAY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ device: "app", visual }),
  }, 6000);
  const extra = await req(RELAY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visual }),
  }, 6000);
  return (res !== null && res.ok) || (extra !== null && extra.ok);
}

/** Screen backlight off, strip off. Wi-Fi stays up so the dial can wake them. */
export async function pushDoorSleep(): Promise<boolean> {
  lastPushed = null;
  // Sleep is a visual, not a note. Storing "__off__" in the message field
  // meant the dial could not wake the boards without wiping a delivery OTP.
  const writes = await Promise.all([
    req(RELAY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ visual: "off" }),
    }, 6000),
    req(RELAY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device: "app", visual: "off" }),
    }, 6000),
  ]);
  return writes.some((r) => r !== null && r.ok);
}

/** Put a line of text on the door. Empty clears it. */
export async function pushDoorMessage(message: string): Promise<boolean> {
  const res = await req(RELAY, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  }, 6000);
  return res !== null && res.ok;
}

export type DoorStatus = {
  reachable: boolean;
  strip: boolean | null;
  screen: boolean | null;
  state: string | null;
  visual: string | null;
  message: string | null;
  dba: number | null;
};

/**
 * A device counts as present if it has spoken recently. The screen polls every
 * 3s and the strip every 15s (HTTPS backup; Command changes arrive over
 * ESP-NOW from the screen). 45s is comfortably more than a missed turn
 * without being so long that a genuinely dead device looks alive for minutes.
 *
 * This replaces an earlier check that asked how long ago the STATE changed,
 * which reported "unreachable" about two perfectly healthy devices that simply
 * had nothing new to be told.
 */
const PRESENT_WITHIN_S = 45;

/**
 * One shared door poll for the whole app. DoorCouple and LedEspBadge used to
 * poll /api/door separately (2.5 s + 6 s ≈ 34 requests/min per open client,
 * 24/7) — real money against the Cloudflare and Vercel free tiers. Everything
 * now shares a single 5-second poll that pauses while the tab is hidden.
 */
type DoorListener = (s: DoorStatus) => void;
const doorListeners = new Set<DoorListener>();
let doorTimer: ReturnType<typeof setInterval> | null = null;
let doorLast: DoorStatus | null = null;
let doorInFlight = false;

async function doorTick() {
  if (doorInFlight) return;
  doorInFlight = true;
  try {
    const next = await doorStatus();
    doorLast = next;
    doorListeners.forEach((cb) => cb(next));
  } finally {
    doorInFlight = false;
  }
}

function onVisible() {
  if (document.visibilityState === "visible") void doorTick();
}

function startDoorPolling() {
  if (doorTimer) return;
  doorTimer = setInterval(() => {
    if (typeof document === "undefined" || document.visibilityState === "visible") void doorTick();
  }, 5000);
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVisible);
  void doorTick();
}

function stopDoorPolling() {
  if (doorTimer) clearInterval(doorTimer);
  doorTimer = null;
  if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVisible);
}

export function subscribeDoorStatus(cb: DoorListener): () => void {
  doorListeners.add(cb);
  if (doorLast) cb(doorLast);
  startDoorPolling();
  return () => {
    doorListeners.delete(cb);
    if (doorListeners.size === 0) stopDoorPolling();
  };
}

/** Ask for a fresh door read soon (after a push or a dial turn). */
export function refreshDoorStatus() {
  void doorTick();
}

export async function doorStatus(): Promise<DoorStatus> {
  const res = await req(RELAY, { cache: "no-store" }, 6000);
  if (!res || !res.ok) {
    return { reachable: false, strip: null, screen: null, state: null, visual: null, message: null, dba: null };
  }
  try {
    const b = await res.json();
    const seen = (age: unknown) =>
      typeof age === "number" ? age < PRESENT_WITHIN_S : null;
    return {
      reachable: true,
      strip: seen(b?.strip_age_s),
      screen: seen(b?.screen_age_s),
      state: typeof b?.state === "string" ? b.state : null,
      visual: typeof b?.visual === "string" ? b.visual : null,
      message: typeof b?.message === "string" ? b.message : null,
      dba: typeof b?.dba === "number" ? b.dba : null,
    };
  } catch {
    return { reachable: false, strip: null, screen: null, state: null, visual: null, message: null, dba: null };
  }
}
