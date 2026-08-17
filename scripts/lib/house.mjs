/**
 * Pi-free house model.
 *
 * Each ESP32 already serves ESPHome's REST API on port 80. This module polls
 * those pages, maps them onto Studio Command's rooms/safety/preflight shapes,
 * and never invents a healthy number for a sensor that did not answer.
 */

export const NODES = [
  {
    id: "studio",
    sticker: 1,
    name: "Studio",
    host: "192.168.0.250",
    mac: "8c:94:df:69:20:20",
    critical: true,
    roomId: "studio",
  },
  {
    id: "music",
    sticker: 2,
    name: "Music room",
    host: "192.168.0.251",
    mac: "00:70:07:a2:73:98",
    critical: true,
    roomId: "music",
  },
  {
    id: "bath-a",
    sticker: 3,
    name: "Bathrooms A",
    host: "192.168.0.252",
    mac: "00:70:07:a2:6f:04",
    critical: true,
    roomId: "bathroom",
  },
  {
    id: "bath-b",
    sticker: 4,
    name: "Bathrooms B",
    host: "192.168.0.253",
    mac: "00:70:07:a2:90:dc",
    critical: true,
    roomId: "bathroom",
  },
  {
    id: "kitchen",
    sticker: 5,
    name: "Kitchen",
    host: "192.168.0.254",
    mac: "88:f1:55:30:7f:84",
    critical: true,
    roomId: "kitchen",
  },
  {
    id: "hall",
    sticker: 6,
    name: "Hall",
    host: "192.168.0.249",
    mac: "8c:94:df:69:1e:5c",
    critical: true,
    roomId: "entrance",
  },
];

const STATE_COLORS = {
  available: "#2FBF71",
  class: "#3B82F6",
  meeting: "#F5A623",
  audio_rec: "#E5484D",
  video_rec: "#D93036",
  emergency: "#7C3AED",
};

const RECORDING_ROOM_IDS = new Set(["studio", "music"]);

export function entityUrl(host, domain, name) {
  return `http://${host}/${domain}/${encodeURIComponent(name)}`;
}

export function parseNumber(payload) {
  if (!payload || payload.state === "nan" || payload.state === "unknown") return null;
  const value = payload.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function parseOn(payload) {
  if (!payload) return null;
  if (typeof payload.value === "boolean") return payload.value;
  if (payload.state === "ON" || payload.state === "on") return true;
  if (payload.state === "OFF" || payload.state === "off") return false;
  return null;
}

function emptySafety() {
  return {
    fire: false,
    gas: false,
    panic: false,
    leakKitchen: false,
    leakBath: false,
    leakGeyser: false,
    perimeter: false,
  };
}

function offlineUtilities() {
  return {
    water: {
      online: false,
      sumpPct: 0,
      overheadPct: 0,
      pumpRunning: false,
      dryRunProtected: false,
      lastFillTs: 0,
    },
    power: {
      online: false,
      mainsOnline: false,
      voltage: 0,
      inverterPct: 0,
      estimatedMinutes: 0,
      surgeProtected: false,
    },
    lpg: { online: false, remainingPct: 0, estimatedDays: 0 },
    air: { online: false, aqi: 0, pm25: 0, tempC: 0, humidityPct: 0, purifierOn: false },
  };
}

/**
 * @param {Array<{ name: string, open: boolean | null }>} leaves
 * @returns {{ open: boolean, unknown: boolean, names: string[] }}
 */
export function combineLeaves(leaves) {
  const known = leaves.filter((leaf) => leaf.open !== null);
  const unknown = known.length !== leaves.length || leaves.length === 0;
  const openNames = known.filter((leaf) => leaf.open).map((leaf) => leaf.name);
  // Unwired reeds with a pull-up read OPEN, which is fail-safe for recording.
  // A silent board cannot be treated as closed.
  const open = unknown || openNames.length > 0;
  return { open, unknown, names: unknown && openNames.length === 0 ? leaves.map((leaf) => leaf.name) : openNames };
}

export function computePreflight({
  openDoorNames,
  dbLevel,
  dbThreshold,
  sensorsHealthy,
  safety,
}) {
  const doorsClosed = openDoorNames.length === 0;
  const quietEnough = dbLevel != null && dbLevel < dbThreshold;
  const safetyClear =
    !safety.fire &&
    !safety.gas &&
    !safety.panic &&
    !safety.leakKitchen &&
    !safety.leakBath &&
    !safety.leakGeyser;
  return {
    doorsClosed,
    quietEnough,
    sensorsHealthy,
    safetyClear,
    ready: doorsClosed && quietEnough && sensorsHealthy && safetyClear,
    openDoors: [],
    openDoorNames,
    dbLevel: dbLevel ?? 0,
    dbThreshold,
  };
}

export function buildRooms({ readings, studioState, signColor }) {
  const color = signColor ?? STATE_COLORS[studioState] ?? STATE_COLORS.available;
  const studio = readings.studio;
  const music = readings.music;
  const hall = readings.hall;
  const kitchen = readings.kitchen;
  const bathA = readings["bath-a"];
  const bathB = readings["bath-b"];

  const studioLeaves = combineLeaves([
    { name: "Studio door · leaf A", open: studio.doorA },
    { name: "Studio door · leaf B", open: studio.doorB },
  ]);
  const musicLeaves = combineLeaves([
    { name: "Teaching door · leaf A", open: music.doorA },
    { name: "Teaching door · leaf B", open: music.doorB },
  ]);
  const mainDoor = combineLeaves([{ name: "Main door", open: hall.door }]);

  return [
    {
      id: "studio",
      name: "Studio",
      doorOpen: studioLeaves.open,
      presence: studio.presence === true,
      tempC: studio.tempC,
      humidityPct: studio.humidityPct,
      signColor: color,
      dbLevel: studio.dba ?? undefined,
      online: studio.online,
    },
    {
      id: "music",
      name: "Music Room",
      doorOpen: musicLeaves.open,
      presence: false,
      tempC: music.tempC,
      humidityPct: music.humidityPct,
      signColor: color,
      online: music.online,
    },
    {
      id: "entrance",
      name: "Entrance",
      doorOpen: mainDoor.open,
      presence: hall.motion === true,
      tempC: hall.tempC,
      humidityPct: hall.humidityPct,
      signColor: color,
      online: hall.online,
    },
    {
      id: "kitchen",
      name: "Kitchen",
      doorOpen: false,
      presence: kitchen.motion === true,
      tempC: kitchen.tempC,
      humidityPct: kitchen.humidityPct,
      signColor: color,
      online: kitchen.online,
    },
    {
      id: "bathroom",
      name: "Bathroom",
      doorOpen: false,
      presence: false,
      tempC: bathA.tempC ?? bathB.tempC,
      humidityPct: bathA.humidityPct ?? bathB.humidityPct,
      signColor: color,
      online: bathA.online || bathB.online,
    },
    {
      id: "bedroom",
      name: "Bedroom",
      doorOpen: false,
      presence: false,
      tempC: null,
      humidityPct: null,
      signColor: color,
      online: false,
    },
  ];
}

export function buildSafety(readings) {
  const safety = emptySafety();
  const studio = readings.studio;
  const music = readings.music;
  const kitchen = readings.kitchen;
  const hall = readings.hall;
  const bathA = readings["bath-a"];
  const bathB = readings["bath-b"];

  safety.fire = studio.flame === true || music.flame === true || kitchen.flame === true || hall.flame === true;
  safety.gas = kitchen.lpg === true;
  safety.leakKitchen = kitchen.leak === true || studio.leak === true || music.leak === true;
  safety.leakBath = bathA.leak1 === true || bathA.leak2 === true || bathB.leak1 === true || bathB.leak2 === true || bathB.washerLeak === true;
  safety.leakGeyser = bathA.geyser === true;
  safety.perimeter = hall.vibration === true;
  safety.panic = false;
  return safety;
}

export function recordingOpenDoors(readings) {
  const names = [];
  if (!readings.studio.online) {
    names.push("Studio doors (board silent)");
  } else {
    names.push(
      ...combineLeaves([
        { name: "Studio door · leaf A", open: readings.studio.doorA },
        { name: "Studio door · leaf B", open: readings.studio.doorB },
      ]).names,
    );
  }
  if (!readings.music.online) {
    names.push("Teaching doors (board silent)");
  } else {
    names.push(
      ...combineLeaves([
        { name: "Teaching door · leaf A", open: readings.music.doorA },
        { name: "Teaching door · leaf B", open: readings.music.doorB },
      ]).names,
    );
  }
  return names;
}

export function buildFleet(readings, now = Date.now()) {
  return NODES.map((node) => {
    const reading = readings[node.id];
    const online = !!reading?.online;
    return {
      id: node.id,
      name: `${node.sticker} · ${node.name}`,
      kind: "esp32",
      online,
      lastSeen: online ? now : reading?.lastSeen ?? 0,
      detail: online ? `http://${node.host}` : `silent · ${node.host}`,
    };
  });
}

function blankNode() {
  return {
    online: false,
    lastSeen: 0,
    doorA: null,
    doorB: null,
    door: null,
    leak: null,
    leak1: null,
    leak2: null,
    geyser: null,
    washerLeak: null,
    washerRunning: null,
    dba: null,
    presence: null,
    motion: null,
    flame: null,
    vibration: null,
    lpg: null,
    doorbell: null,
    tempC: null,
    humidityPct: null,
  };
}

export function emptyReadings() {
  return Object.fromEntries(NODES.map((node) => [node.id, blankNode()]));
}

async function readEntity(fetchFn, host, domain, name) {
  const url = entityUrl(host, domain, name);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const res = await fetchFn(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function probeNode(fetchFn, node) {
  const reading = blankNode();
  const bin = (name) => readEntity(fetchFn, node.host, "binary_sensor", name);
  const sen = (name) => readEntity(fetchFn, node.host, "sensor", name);

  if (node.id === "studio") {
    const [doorA, doorB, leak, presence, dba, temp, humidity] = await Promise.all([
      bin("Studio door leaf A"),
      bin("Studio door leaf B"),
      bin("Studio sink leak"),
      bin("Studio presence"),
      sen("Studio sound level"),
      sen("Studio temperature"),
      sen("Studio humidity"),
    ]);
    reading.online = [doorA, doorB, leak, presence, dba, temp, humidity].some(Boolean);
    reading.doorA = parseOn(doorA);
    reading.doorB = parseOn(doorB);
    reading.leak = parseOn(leak);
    reading.presence = parseOn(presence);
    reading.dba = parseNumber(dba);
    reading.tempC = parseNumber(temp);
    reading.humidityPct = parseNumber(humidity);
  } else if (node.id === "music") {
    const [doorA, doorB, leak, flame, temp, humidity] = await Promise.all([
      bin("Teaching door leaf A"),
      bin("Teaching door leaf B"),
      bin("Music room leak"),
      bin("Music room flame"),
      sen("Music room temperature"),
      sen("Music room humidity"),
    ]);
    reading.online = [doorA, doorB, leak, flame, temp, humidity].some(Boolean);
    reading.doorA = parseOn(doorA);
    reading.doorB = parseOn(doorB);
    reading.leak = parseOn(leak);
    reading.flame = parseOn(flame);
    reading.tempC = parseNumber(temp);
    reading.humidityPct = parseNumber(humidity);
  } else if (node.id === "bath-a") {
    const [leak1, leak2, geyser, temp, humidity] = await Promise.all([
      bin("Bathroom A1 leak"),
      bin("Bathroom A2 leak"),
      bin("Geyser overflow"),
      sen("Bathroom 3 temperature"),
      sen("Bathroom 3 humidity"),
    ]);
    reading.online = [leak1, leak2, geyser, temp, humidity].some(Boolean);
    reading.leak1 = parseOn(leak1);
    reading.leak2 = parseOn(leak2);
    reading.geyser = parseOn(geyser);
    reading.tempC = parseNumber(temp);
    reading.humidityPct = parseNumber(humidity);
  } else if (node.id === "bath-b") {
    const [leak1, leak2, washerLeak, washerRunning, temp, humidity] = await Promise.all([
      bin("Bathroom B1 leak"),
      bin("Bathroom B2 leak"),
      bin("Washing machine leak"),
      bin("Washing machine running"),
      sen("Bathroom 4 temperature"),
      sen("Bathroom 4 humidity"),
    ]);
    reading.online = [leak1, leak2, washerLeak, washerRunning, temp, humidity].some(Boolean);
    reading.leak1 = parseOn(leak1);
    reading.leak2 = parseOn(leak2);
    reading.washerLeak = parseOn(washerLeak);
    reading.washerRunning = parseOn(washerRunning);
    reading.tempC = parseNumber(temp);
    reading.humidityPct = parseNumber(humidity);
  } else if (node.id === "kitchen") {
    const [leak, flame, motion, lpg, temp, humidity] = await Promise.all([
      bin("Kitchen sink leak"),
      bin("Kitchen flame"),
      bin("Kitchen motion"),
      bin("LPG detector alarm contact"),
      sen("Kitchen temperature"),
      sen("Kitchen humidity"),
    ]);
    reading.online = [leak, flame, motion, lpg, temp, humidity].some(Boolean);
    reading.leak = parseOn(leak);
    reading.flame = parseOn(flame);
    reading.motion = parseOn(motion);
    reading.lpg = parseOn(lpg);
    reading.tempC = parseNumber(temp);
    reading.humidityPct = parseNumber(humidity);
  } else if (node.id === "hall") {
    const [door, doorbell, hallMotion, entranceMotion, flame, vibration, temp, humidity] = await Promise.all([
      bin("Main door"),
      bin("Doorbell pressed"),
      bin("Hall motion"),
      bin("Entrance motion"),
      bin("Hall flame"),
      bin("Main door disturbed"),
      sen("Hall temperature"),
      sen("Hall humidity"),
    ]);
    reading.online = [door, doorbell, hallMotion, entranceMotion, flame, vibration, temp, humidity].some(Boolean);
    reading.door = parseOn(door);
    reading.doorbell = parseOn(doorbell);
    reading.motion = parseOn(hallMotion) === true || parseOn(entranceMotion) === true;
    reading.flame = parseOn(flame);
    reading.vibration = parseOn(vibration);
    reading.tempC = parseNumber(temp);
    reading.humidityPct = parseNumber(humidity);
  }

  if (reading.online) reading.lastSeen = Date.now();
  return reading;
}

export async function pollHouse(fetchFn = fetch, nodes = NODES) {
  const entries = await Promise.all(
    nodes.map(async (node) => [node.id, await probeNode(fetchFn, node)]),
  );
  return Object.fromEntries(entries);
}

export function snapshotFromReadings(readings, { studioState = "available", dbThreshold = 45, now = Date.now() } = {}) {
  const rooms = buildRooms({ readings, studioState });
  const safety = buildSafety(readings);
  const sensorsHealthy = NODES.filter((node) => node.critical).every((node) => readings[node.id]?.online);
  const openDoorNames = recordingOpenDoors(readings).filter((name, index, list) => list.indexOf(name) === index);
  const preflight = computePreflight({
    openDoorNames,
    dbLevel: readings.studio.dba,
    dbThreshold,
    sensorsHealthy,
    safety,
  });
  // openDoors is a RoomId[] used by older UI; keep it aligned with recording rooms.
  preflight.openDoors = rooms.filter((room) => RECORDING_ROOM_IDS.has(room.id) && room.doorOpen).map((room) => room.id);
  const fleet = buildFleet(readings, now);
  const doorbellPressed = readings.hall.doorbell === true;
  return {
    rooms,
    safety,
    preflight,
    fleet,
    utilities: offlineUtilities(),
    air: { rooms: [], purifiers: [], hushed: false, purgeUntil: null },
    piano: {
      online: false,
      preset: "Not built",
      cpuPct: 0,
      tempC: 0,
      audioDevice: "Piano Pi was never bought",
      sampleRate: 0,
      bufferFrames: 0,
      latencyMs: 0,
      lastSeen: 0,
    },
    doorbell: doorbellPressed
      ? { snapshotUrl: "", ts: now }
      : { snapshotUrl: "", ts: 0 },
    washerRunning: readings["bath-b"].washerRunning === true,
  };
}

export { RECORDING_ROOM_IDS, STATE_COLORS };
