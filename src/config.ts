/**
 * ─────────────────────────────────────────────────────────────
 *  STUDIO COMMAND — data source switch
 *
 *  USE_MOCK = true   → fully simulated house (works anywhere)
 *  USE_MOCK = false  → talks to the Raspberry Pi wrapper at
 *                      LIVE_BASE_URL (http://studio.local:8123)
 *
 *  That one flag is the ONLY thing to change when the Pi
 *  wrapper goes live. Everything else stays identical.
 * ─────────────────────────────────────────────────────────────
 */
export const USE_MOCK = true;

export const LIVE_BASE_URL = "http://studio.local:8123";
