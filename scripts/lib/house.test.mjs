import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  combineLeaves,
  computePreflight,
  emptyReadings,
  entityUrl,
  parseNumber,
  parseOn,
  pollHouse,
  recordingOpenDoors,
  snapshotFromReadings,
} from "./house.mjs";

describe("ESPHome payload parsing", () => {
  it("reads a live dBA number and rejects nan", () => {
    assert.equal(parseNumber({ state: "46.6 dBA", value: 46.6 }), 46.6);
    assert.equal(parseNumber({ state: "nan", value: NaN }), null);
    assert.equal(parseNumber(null), null);
  });

  it("treats a door ON as open", () => {
    assert.equal(parseOn({ state: "ON", value: true }), true);
    assert.equal(parseOn({ state: "OFF", value: false }), false);
    assert.equal(parseOn(null), null);
  });

  it("encodes entity names with spaces the way ESPHome 2026.7 expects", () => {
    assert.equal(
      entityUrl("192.168.0.250", "binary_sensor", "Studio door leaf A"),
      "http://192.168.0.250/binary_sensor/Studio%20door%20leaf%20A",
    );
  });
});

describe("recording gate", () => {
  it("fail-safes a silent studio board as not ready", () => {
    const readings = emptyReadings();
    const snap = snapshotFromReadings(readings, { dbThreshold: 45 });
    assert.equal(snap.preflight.ready, false);
    assert.equal(snap.preflight.sensorsHealthy, false);
    assert.equal(snap.preflight.doorsClosed, false);
    assert.ok(snap.preflight.openDoorNames.includes("Studio doors (board silent)"));
    assert.equal(snap.rooms.find((r) => r.id === "studio")?.dbLevel, undefined);
    assert.equal(snap.utilities.water.online, false);
    assert.equal(snap.air.rooms.length, 0);
  });

  it("names the exact open studio leaf", () => {
    const readings = emptyReadings();
    readings.studio.online = true;
    readings.studio.doorA = true;
    readings.studio.doorB = false;
    readings.studio.dba = 38;
    readings.music.online = true;
    readings.music.doorA = false;
    readings.music.doorB = false;
    for (const id of ["bath-a", "bath-b", "kitchen", "hall"]) readings[id].online = true;
    const snap = snapshotFromReadings(readings, { dbThreshold: 45 });
    assert.equal(snap.preflight.ready, false);
    assert.deepEqual(snap.preflight.openDoorNames, ["Studio door · leaf A"]);
    assert.equal(snap.preflight.quietEnough, true);
    assert.equal(snap.preflight.sensorsHealthy, true);
  });

  it("blocks on a loud room even with every door shut", () => {
    const readings = emptyReadings();
    readings.studio.online = true;
    readings.studio.doorA = false;
    readings.studio.doorB = false;
    readings.studio.dba = 52;
    readings.music.online = true;
    readings.music.doorA = false;
    readings.music.doorB = false;
    for (const id of ["bath-a", "bath-b", "kitchen", "hall"]) readings[id].online = true;
    const snap = snapshotFromReadings(readings, { dbThreshold: 45 });
    assert.equal(snap.preflight.quietEnough, false);
    assert.equal(snap.preflight.doorsClosed, true);
    assert.equal(snap.preflight.ready, false);
  });

  it("goes green when doors, quiet, nodes and safety all pass", () => {
    const readings = emptyReadings();
    readings.studio.online = true;
    readings.studio.doorA = false;
    readings.studio.doorB = false;
    readings.studio.dba = 38.2;
    readings.studio.presence = true;
    readings.music.online = true;
    readings.music.doorA = false;
    readings.music.doorB = false;
    for (const id of ["bath-a", "bath-b", "kitchen", "hall"]) readings[id].online = true;
    const snap = snapshotFromReadings(readings, { dbThreshold: 45 });
    assert.equal(snap.preflight.ready, true);
    assert.equal(snap.rooms.find((r) => r.id === "studio")?.dbLevel, 38.2);
    assert.equal(snap.fleet.filter((d) => d.online).length, 6);
  });

  it("a kitchen leak drops safety and the recording verdict", () => {
    const readings = emptyReadings();
    readings.studio.online = true;
    readings.studio.doorA = false;
    readings.studio.doorB = false;
    readings.studio.dba = 36;
    readings.music.online = true;
    readings.music.doorA = false;
    readings.music.doorB = false;
    for (const id of ["bath-a", "bath-b", "kitchen", "hall"]) readings[id].online = true;
    readings.kitchen.leak = true;
    const snap = snapshotFromReadings(readings);
    assert.equal(snap.safety.leakKitchen, true);
    assert.equal(snap.preflight.safetyClear, false);
    assert.equal(snap.preflight.ready, false);
  });

  it("does not invent a quiet room from a missing sound meter", () => {
    const preflight = computePreflight({
      openDoorNames: [],
      dbLevel: null,
      dbThreshold: 45,
      sensorsHealthy: true,
      safety: {
        fire: false,
        gas: false,
        panic: false,
        leakKitchen: false,
        leakBath: false,
        leakGeyser: false,
        perimeter: false,
      },
    });
    assert.equal(preflight.quietEnough, false);
    assert.equal(preflight.ready, false);
  });
});

describe("leaf combining", () => {
  it("treats a silent leaf as open so recording cannot sneak through", () => {
    const result = combineLeaves([
      { name: "leaf A", open: false },
      { name: "leaf B", open: null },
    ]);
    assert.equal(result.open, true);
    assert.equal(result.unknown, true);
  });
});

describe("pollHouse", () => {
  it("maps ESPHome REST payloads onto studio readings", async () => {
    const payloads = {
      "http://192.168.0.250/binary_sensor/Studio%20door%20leaf%20A": { state: "OFF", value: false },
      "http://192.168.0.250/binary_sensor/Studio%20door%20leaf%20B": { state: "ON", value: true },
      "http://192.168.0.250/sensor/Studio%20sound%20level": { state: "46.6 dBA", value: 46.6 },
    };
    const fetchFn = async (url) => {
      const body = payloads[url];
      if (!body) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => body };
    };
    const readings = await pollHouse(fetchFn);
    assert.equal(readings.studio.online, true);
    assert.equal(readings.studio.doorA, false);
    assert.equal(readings.studio.doorB, true);
    assert.equal(readings.studio.dba, 46.6);
    assert.deepEqual(recordingOpenDoors(readings).filter((n) => n.startsWith("Studio")), ["Studio door · leaf B"]);
  });
});
