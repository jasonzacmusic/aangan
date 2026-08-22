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
 *  2. RELAY — the app writes to /api/door and the devices poll it. Slower by a
 *     few seconds, but immune to mixed content, to mesh client isolation, and
 *     to whether the Mac is switched on. This is the one that works from a
 *     phone on mobile data, and it is how the deployed app talks to the door.
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
export async function pushLedEspState(state: string): Promise<boolean> {
  if (!state || state === lastPushed) return true;

  const roads = [
    req(RELAY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state }),
    }, 6000),
  ];

  if (ledespEnabled) {
    roads.push(req(
      `${LEDESP_URL}/select/studio_state/set?option=${encodeURIComponent(state)}`,
      { method: "POST", mode: "cors" }, 1500,
    ));
  }

  const ok = (await Promise.all(roads)).some((r) => r !== null && r.ok);
  // Only remember it as sent if something accepted it, so a failed push is
  // retried on the next change rather than being deduplicated away.
  if (ok) lastPushed = state;
  return ok;
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
  /** Is the relay itself answering? */
  reachable: boolean;
  /** Each device, by when it last checked in. null = unknown, not faulty. */
  strip: boolean | null;
  screen: boolean | null;
  state: string | null;
  dba: number | null;
};

/**
 * A device counts as present if it has spoken recently. The strip polls every
 * 15s and the screen every 3s, so 45s is comfortably more than a missed turn
 * without being so long that a genuinely dead device looks alive for minutes.
 *
 * This replaces an earlier check that asked how long ago the STATE changed,
 * which reported "unreachable" about two perfectly healthy devices that simply
 * had nothing new to be told.
 */
const PRESENT_WITHIN_S = 45;

export async function doorStatus(): Promise<DoorStatus> {
  const res = await req(RELAY, { cache: "no-store" }, 6000);
  if (!res || !res.ok) {
    return { reachable: false, strip: null, screen: null, state: null, dba: null };
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
      dba: typeof b?.dba === "number" ? b.dba : null,
    };
  } catch {
    return { reachable: false, strip: null, screen: null, state: null, dba: null };
  }
}
