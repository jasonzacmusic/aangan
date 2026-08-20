/**
 * One build-time switch keeps page code independent from the data source.
 *
 * Local/demo build (the safe default):
 *   VITE_DATA_SOURCE=mock
 *
 * USB bench / same-origin live (Vite proxies /api → the USB bridge):
 *   VITE_DATA_SOURCE=live
 *
 * House app build served by the bridge:
 *   VITE_DATA_SOURCE=live VITE_LIVE_BASE_URL=""
 *
 * Separate web host on the home LAN:
 *   VITE_DATA_SOURCE=live VITE_LIVE_BASE_URL=http://homeassistant.local:8126
 */
const requestedSource = String(import.meta.env.VITE_DATA_SOURCE ?? "mock").toLowerCase();

export const USE_MOCK = requestedSource !== "live";

// Empty means "use this page's origin". Vite's empty env vars are dropped, so
// treat missing the same as empty when we asked for live.
export const LIVE_BASE_URL = String(import.meta.env.VITE_LIVE_BASE_URL ?? "")
  .replace(/\/$/, "");
