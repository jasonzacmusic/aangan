import { USE_MOCK, LIVE_BASE_URL } from "../config";
import { MockAdapter } from "./mockAdapter";
import { LiveAdapter } from "./liveAdapter";
import type { ApiAdapter } from "./types";

/**
 * The single door to the house.
 *
 * Every page talks to `api` and only `api`. Flip USE_MOCK in
 * src/config.ts and the exact same app drives the real apartment
 * through the LAN server (or a later Home Assistant hub).
 */
export const api: ApiAdapter = USE_MOCK ? new MockAdapter() : new LiveAdapter(LIVE_BASE_URL);

export const DATA_SOURCE: "mock" | "live" = USE_MOCK ? "mock" : "live";
