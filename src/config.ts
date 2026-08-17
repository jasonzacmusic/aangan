/**
 * One build-time switch keeps page code independent from the data source.
 *
 * Local/demo build (the safe default, also Vercel):
 *   VITE_DATA_SOURCE=mock
 *
 * Live house, no Raspberry Pi — serve this build from the Mac on the school
 * Wi-Fi so phones talk to the same origin as the ESP32 aggregator:
 *   VITE_DATA_SOURCE=live VITE_LIVE_BASE_URL=
 *   npm run lan
 *
 * Optional later, if a Home Assistant hub is ever added:
 *   VITE_DATA_SOURCE=live VITE_LIVE_BASE_URL=http://homeassistant.local:8126
 */
const requestedSource = String(import.meta.env.VITE_DATA_SOURCE ?? "mock").toLowerCase();

export const USE_MOCK = requestedSource !== "live";

// An empty value intentionally means "use this page's origin".
export const LIVE_BASE_URL = String(import.meta.env.VITE_LIVE_BASE_URL ?? "").replace(/\/$/, "");

export const HOUSE_UNREACHABLE = "House unreachable — Studio Command is reconnecting.";
