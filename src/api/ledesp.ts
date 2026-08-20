/**
 * Getting the studio state onto the door light.
 *
 * There are two roads to the board and the app takes both, because each one
 * fails in a situation where the other works:
 *
 *  1. DIRECT — the browser calls the board's own web server on the house
 *     Wi-Fi. Instant, needs nothing else running. But it only works when the
 *     page itself is served over http (a LAN build): an https page is barred
 *     from reading an http device by the browser, and no code can lift that.
 *     It also needs the network to actually pass client-to-client traffic — a
 *     VPN with LAN access switched off will silently swallow every request.
 *
 *  2. RELAY — the app POSTs to its own /api/door, and the board polls that
 *     over https. Slower by a second or two, and it needs the board to be
 *     online, but it is immune to mixed content, to client isolation, and to
 *     whether the Mac is switched on. This is the one that works from a phone
 *     on mobile data.
 *
 * Both are best effort and neither ever throws. The light is an output, not a
 * source of truth — if it is unplugged, the app carries on exactly as before.
 */

const RAW = String(import.meta.env.VITE_LEDESP_URL ?? "").replace(/\/$/, "");

/** The board's address on the house Wi-Fi. Empty on an https build. */
export const LEDESP_URL = RAW;
/** Whether the direct road is even worth attempting. */
export const ledespEnabled = RAW.length > 0;

/** The relay is same-origin, so it is available on every build. */
const RELAY = "/api/door";

let lastPushed: string | null = null;

async function post(url: string, init: RequestInit, ms: number): Promise<boolean> {
  const ctrl = new AbortController();
  const bail = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(bail);
  }
}

/**
 * Tell the door light which state the studio is in.
 * Safe to call on every change; unchanged repeats are dropped.
 * Resolves true if either road got through.
 */
export async function pushLedEspState(state: string): Promise<boolean> {
  if (!state || state === lastPushed) return true;

  const roads: Promise<boolean>[] = [
    post(RELAY, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ state }),
    }, 4000),
  ];

  if (ledespEnabled) {
    const direct = `${LEDESP_URL}/select/studio_state/set?option=${encodeURIComponent(state)}`;
    roads.push(post(direct, { method: "POST", mode: "cors" }, 1500));
  }

  const results = await Promise.all(roads);
  const ok = results.some(Boolean);
  // Only remember it as sent if something actually accepted it, so a failed
  // push is retried on the next change instead of being deduplicated away.
  if (ok) lastPushed = state;
  return ok;
}

export type LinkStatus = "direct" | "relay" | "down";

/**
 * Which road is currently open. Drives the on-screen badge, nothing else —
 * the app must never gate a house action on the state of a lamp.
 */
export async function ledespLink(): Promise<LinkStatus> {
  if (ledespEnabled) {
    const ctrl = new AbortController();
    const bail = setTimeout(() => ctrl.abort(), 1200);
    try {
      const res = await fetch(`${LEDESP_URL}/`, { signal: ctrl.signal, mode: "cors" });
      if (res.ok) return "direct";
    } catch {
      /* fall through to the relay */
    } finally {
      clearTimeout(bail);
    }
  }

  const ctrl = new AbortController();
  const bail = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(RELAY, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return "down";
    const body = await res.json();
    // A board that is polling keeps the record fresh. A stale record means the
    // relay is up but nothing is listening at the door.
    return body?.age_s === null || body?.age_s < 120 ? "relay" : "down";
  } catch {
    return "down";
  } finally {
    clearTimeout(bail);
  }
}
