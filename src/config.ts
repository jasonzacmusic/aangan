/**
 * One build-time switch keeps page code independent from the data source.
 *
 * Local/demo build (the safe default):
 *   VITE_DATA_SOURCE=mock
 *
 * House app build (served by the bridge, same origin):
 *   VITE_DATA_SOURCE=live VITE_LIVE_BASE_URL=""
 *
 * Separate web host on the home LAN:
 *   VITE_DATA_SOURCE=live VITE_LIVE_BASE_URL=http://homeassistant.local:8126
 */
const requestedSource = String(import.meta.env.VITE_DATA_SOURCE ?? "mock").toLowerCase();

export const USE_MOCK = requestedSource !== "live";

// Port 8123 is Home Assistant. Aangan Bridge listens on 8126.
// An empty value intentionally means "use this page's origin".
export const LIVE_BASE_URL = String(
  import.meta.env.VITE_LIVE_BASE_URL ?? "http://homeassistant.local:8126",
).replace(/\/$/, "");
