/**
 * Direct Wi-Fi link from the app to ledESP — the studio-door light board.
 *
 * Why this exists: the light should follow the app even when the Mac and its
 * bridge are switched off. ledESP runs its own web server on the house Wi-Fi,
 * and ESPHome sends `Access-Control-Allow-Origin: *`, so the browser is
 * allowed to talk to it straight from the page.
 *
 * The one hard constraint: the page must itself be served over http. A page
 * served over https (the Vercel build) is blocked from reading an http device
 * by every browser, and no code here can change that. So this only fires when
 * VITE_LEDESP_URL is set, which is the local/LAN build.
 *
 * Everything here is best effort and never throws. The light is an output, not
 * a source of truth — if the board is unplugged the app must carry on exactly
 * as before.
 */

const RAW = String(import.meta.env.VITE_LEDESP_URL ?? "").replace(/\/$/, "");

/** Empty when the app is not allowed, or not configured, to talk to the board. */
export const LEDESP_URL = RAW;
export const ledespEnabled = RAW.length > 0;

let lastPushed: string | null = null;

/**
 * Tell the door light which state the studio is in.
 * Safe to call on every state change; repeats are dropped.
 */
export async function pushLedEspState(state: string): Promise<boolean> {
  if (!ledespEnabled || !state) return false;
  if (state === lastPushed) return true;

  const url = `${LEDESP_URL}/select/studio_state/set?option=${encodeURIComponent(state)}`;
  const ctrl = new AbortController();
  const bail = setTimeout(() => ctrl.abort(), 1500);
  try {
    const res = await fetch(url, { method: "POST", signal: ctrl.signal, mode: "cors" });
    if (res.ok) {
      lastPushed = state;
      return true;
    }
    return false;
  } catch {
    // Unplugged, asleep, or the mesh is isolating clients. Not the app's problem.
    return false;
  } finally {
    clearTimeout(bail);
  }
}

/** Is the board answering? Used for an honest "connected" dot, not for logic. */
export async function ledespReachable(): Promise<boolean> {
  if (!ledespEnabled) return false;
  const ctrl = new AbortController();
  const bail = setTimeout(() => ctrl.abort(), 1200);
  try {
    const res = await fetch(`${LEDESP_URL}/`, { signal: ctrl.signal, mode: "cors" });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(bail);
  }
}
