import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createLanServer } from "./lan-server.mjs";
import { emptyReadings } from "./lib/house.mjs";

function liveStudioFetch() {
  const payloads = {
    "http://192.168.0.250/binary_sensor/Studio%20door%20leaf%20A": { state: "OFF", value: false },
    "http://192.168.0.250/binary_sensor/Studio%20door%20leaf%20B": { state: "OFF", value: false },
    "http://192.168.0.250/sensor/Studio%20sound%20level": { state: "38.0 dBA", value: 38 },
    "http://192.168.0.251/binary_sensor/Teaching%20door%20leaf%20A": { state: "OFF", value: false },
    "http://192.168.0.251/binary_sensor/Teaching%20door%20leaf%20B": { state: "OFF", value: false },
  };
  const alwaysOn = { state: "OFF", value: false };
  return async (url) => {
    if (payloads[url]) return { ok: true, status: 200, json: async () => payloads[url] };
    if (url.includes("192.168.0.")) return { ok: true, status: 200, json: async () => alwaysOn };
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

async function withServer(fetchFn, fn) {
  const { server, api } = createLanServer({ fetchFn, persist() {}, saved: null });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  try {
    await api.refresh();
    await fn(base, api);
  } finally {
    server.close();
  }
}

describe("LAN API contract", () => {
  it("boots without any ESP32 and never claims the house is ready", async () => {
    await withServer(async () => ({ ok: false, status: 500, json: async () => ({}) }), async (base) => {
      const preflight = await (await fetch(`${base}/api/preflight`)).json();
      const rooms = await (await fetch(`${base}/api/rooms`)).json();
      const fleet = await (await fetch(`${base}/api/fleet`)).json();
      assert.equal(preflight.ready, false);
      assert.equal(preflight.sensorsHealthy, false);
      assert.equal(rooms.find((r) => r.id === "studio").online, false);
      assert.equal(fleet.every((d) => d.kind === "esp32"), true);
      assert.equal(fleet.every((d) => d.online === false), true);
    });
  });

  it("reports ready when the six boards are quiet and the doors are shut", async () => {
    await withServer(liveStudioFetch(), async (base, api) => {
      // pollHouse marks a node online if ANY entity answers. The stub answers
      // every 192.168.0.* URL, so all six come up.
      assert.equal(api.house.readings.studio.dba, 38);
      const preflight = await (await fetch(`${base}/api/preflight`)).json();
      assert.equal(preflight.sensorsHealthy, true);
      assert.equal(preflight.quietEnough, true);
      assert.equal(preflight.doorsClosed, true);
      assert.equal(preflight.ready, true);
    });
  });

  it("keeps studio state, delivery OTP and SOS on the LAN without a Pi", async () => {
    await withServer(async () => ({ ok: false, status: 500, json: async () => ({}) }), async (base) => {
      const state = await (
        await fetch(`${base}/api/state`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ state: "class" }),
        })
      ).json();
      assert.equal(state.state, "class");

      const delivery = await (
        await fetch(`${base}/api/delivery`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courier: "Swiggy", otp: "4821", note: "Leave it at the door", displayId: "front-house", minutes: 10 }),
        })
      ).json();
      assert.equal(delivery.otp, "4821");
      assert.equal(delivery.courier, "Swiggy");

      const sos = await (
        await fetch(`${base}/api/sos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ who: "Amma", message: "I need help right now" }),
        })
      ).json();
      assert.equal(sos.who, "Amma");
      const after = await (await fetch(`${base}/api/state`)).json();
      assert.equal(after.state, "emergency");
    });
  });
});

void emptyReadings;
