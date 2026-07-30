/** The six studio states that drive the whole apartment. */
export type StudioState =
  | "available"
  | "class"
  | "meeting"
  | "audio_rec"
  | "video_rec"
  | "emergency";

export interface StudioStateInfo {
  state: StudioState;
  setBy: string;
  since: number; // epoch ms
}

export type RoomId = "entrance" | "music" | "bedroom" | "kitchen" | "bathroom";

export interface Room {
  id: RoomId;
  name: string;
  doorOpen: boolean;
  presence: boolean;
  tempC: number;
  signColor: string; // hex the WS2812B sign is showing
  dbLevel?: number; // music room only
}

export interface Preflight {
  doorsClosed: boolean;
  quietEnough: boolean;
  /** Every ESP32 sensor node has reported recently. */
  sensorsHealthy: boolean;
  /** No fire / gas / leak / panic is active. */
  safetyClear: boolean;
  /** The one authoritative studio_ready verdict — all four checks green. */
  ready: boolean;
  openDoors: RoomId[]; // which doors are the problem
  dbLevel: number;
  dbThreshold: number;
}

export interface Safety {
  gas: boolean; // true = ALERT
  leakKitchen: boolean;
  leakBath: boolean;
}

/** A family SOS raised from any phone on the house Wi-Fi (the #/sos page). */
export interface Sos {
  active: boolean;
  who: string;
  message: string;
  since: number; // epoch ms
}

export const SOS_PEOPLE = ["Amma", "Jason", "Brother", "Guest"];

export const SOS_MESSAGES = [
  "I need help right now",
  "I'm feeling unwell",
  "Please come home",
  "Come to the kitchen",
  "Call a doctor",
];

export type SafetyAlertKind = keyof Safety | "clear";

export interface Doorbell {
  snapshotUrl: string;
  ts: number;
}

export type ActivityEventType = "state" | "safety" | "doorbell" | "preflight" | "utility" | "system";
export type ActivitySeverity = "info" | "success" | "warning" | "critical";

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  title: string;
  detail: string;
  ts: number;
  severity: ActivitySeverity;
}

export type PreflightPrepStatus = "idle" | "preparing" | "ready" | "restoring";

export interface PreflightPrep {
  active: boolean;
  status: PreflightPrepStatus;
  mutedDoorbell: boolean;
  acOff: boolean;
  fanOff: boolean;
  startedAt?: number;
}

export interface Utilities {
  water: {
    sumpPct: number;
    overheadPct: number;
    pumpRunning: boolean;
    dryRunProtected: boolean;
    lastFillTs: number;
  };
  power: {
    mainsOnline: boolean;
    voltage: number;
    inverterPct: number;
    estimatedMinutes: number;
    surgeProtected: boolean;
  };
  lpg: {
    remainingPct: number;
    estimatedDays: number;
  };
  air: {
    aqi: number;
    pm25: number;
    tempC: number;
    humidityPct: number;
    purifierOn: boolean;
  };
}

export type UtilityAction = "water_pump_toggle" | "purifier_toggle";
export type ConnectionState = "online" | "reconnecting" | "offline";

/**
 * One air node — ESP32 + PMS5003 (dust) + SCD41 (true CO₂) + SGP41 (VOC/odour)
 * + SHT45 (climate). The studio's readings may instead come from the Dyson,
 * which measures the same things to a better standard.
 */
export interface AirRoomReading {
  id: string;
  name: string;
  online: boolean;
  pm25: number; // µg/m³
  co2: number; // ppm — measured, never estimated from VOCs
  vocIndex: number; // Sensirion index · 100 = typical air, higher = staler/smellier
  tempC: number;
  humidityPct: number;
}

export type PurifierMode = "off" | "silent" | "auto" | "max";

export interface Purifier {
  id: string;
  name: string;
  brand: string;
  roomId: string;
  online: boolean;
  mode: PurifierMode;
  filterPct: number;
}

export interface AirState {
  rooms: AirRoomReading[];
  purifiers: Purifier[];
  /** Purifiers hushed because a take is rolling — they are fans, so they are noise. */
  hushed: boolean;
  /** Pre-class / pre-take purge runs until this timestamp. */
  purgeUntil: number | null;
}

export const PURIFIER_MODE_META: Record<PurifierMode, { label: string; hint: string }> = {
  off: { label: "Off", hint: "Not running" },
  silent: { label: "Silent", hint: "Lowest speed — safe during a take" },
  auto: { label: "Auto", hint: "Follows the room's dust level" },
  max: { label: "Max", hint: "Full speed — for purging between takes" },
};

/** Pianos, guitars and bows want this band. Outside it, for hours, is what warps them. */
export const INSTRUMENT_RH_MIN = 35;
export const INSTRUMENT_RH_MAX = 65;

/** The MIDI black-box: the rig silently saves every note ever played. */
export interface BlackboxInfo {
  recording: boolean;
  takesToday: number;
  lastTakeAt: number | null; // epoch ms
  lastTakeMinutes: number;
  lastTakeNotes: number;
}

/** The Pianoteq stage rig (the PIANO Pi) as seen over the network. */
export interface PianoRig {
  online: boolean;
  preset: string;
  cpuPct: number;
  tempC: number;
  audioDevice: string;
  sampleRate: number;
  bufferFrames: number;
  latencyMs: number;
  lastSeen: number; // epoch ms
  blackbox?: BlackboxInfo;
}

export type PianoCue = "recording_started" | "recording_stopped" | "next_preset" | "prev_preset" | "replay_last";

/** A delivery hand-off shown on a door display (Swiggy/Amazon OTP etc). */
export interface Delivery {
  active: boolean;
  courier: string;
  otp: string;
  note: string;
  displayId: string;
  expiresAt: number; // epoch ms
}

export interface DeliveryInput {
  courier: string;
  otp: string;
  note: string;
  displayId: string;
  minutes: number;
}

/**
 * What a wall/door display can show. "door" is the visitor-facing smart sign
 * whose wording follows the studio state. A targeted active Delivery always
 * takes over its display, whatever the assigned content.
 */
export type DisplayContent = "door" | "state" | "house" | "doorbell" | "message" | "clock";

export interface DisplayConfig {
  id: string;
  name: string;
  content: DisplayContent;
  message: string; // used by the "message" content
}

export const DISPLAY_CONTENT_META: Record<DisplayContent, { label: string; hint: string }> = {
  door: { label: "Door sign", hint: "Visitor wording follows the studio state" },
  state: { label: "Studio state", hint: "Big ON AIR style state card" },
  house: { label: "House board", hint: "Rooms, doors and house pulse" },
  doorbell: { label: "Doorbell cam", hint: "Latest entrance snapshot" },
  message: { label: "Custom message", hint: "Any text you type" },
  clock: { label: "Clock", hint: "A calm studio clock" },
};

export const DEFAULT_DISPLAYS: DisplayConfig[] = [
  { id: "front-house", name: "Front of House", content: "door", message: "" },
  { id: "front-studio", name: "Front of Studio", content: "state", message: "" },
  { id: "wall-ipad", name: "Wall iPad", content: "house", message: "" },
];

/** One machine in the school fleet — Macs, Pis, panels, network gear. */
export interface FleetDevice {
  id: string;
  name: string;
  kind: "mac" | "pi" | "panel" | "network" | "other";
  online: boolean;
  lastSeen: number; // epoch ms
  detail: string; // e.g. "Home Assistant · CPU 12%" or "last backup 03:00"
}

export type StreamEvent =
  | { type: "state"; state: StudioStateInfo }
  | { type: "rooms"; rooms: Room[] }
  | { type: "safety"; safety: Safety }
  | { type: "doorbell"; doorbell: Doorbell }
  | { type: "history"; event: ActivityEvent }
  | { type: "utilities"; utilities: Utilities }
  | { type: "preflight"; preflight: Preflight; prep: PreflightPrep }
  | { type: "piano"; piano: PianoRig }
  | { type: "delivery"; delivery: Delivery | null }
  | { type: "displays"; displays: DisplayConfig[] }
  | { type: "sos"; sos: Sos | null }
  | { type: "fleet"; fleet: FleetDevice[] }
  | { type: "air"; air: AirState }
  | { type: "connection"; status: ConnectionState };

export interface SceneDef {
  id: string;
  label: string;
  state: StudioState;
  icon: string; // emoji-ish glyph shown on the button
}

/** Everything the app needs from the house, mock or live. */
export interface ApiAdapter {
  getState(): Promise<StudioStateInfo>;
  setState(state: StudioState): Promise<StudioStateInfo>;
  getRooms(): Promise<Room[]>;
  getPreflight(): Promise<Preflight>;
  getSafety(): Promise<Safety>;
  getDoorbell(): Promise<Doorbell>;
  getHistory(): Promise<ActivityEvent[]>;
  getUtilities(): Promise<Utilities>;
  getPreflightPrep(): Promise<PreflightPrep>;
  panic(): Promise<void>;
  scene(name: string, state: StudioState): Promise<StudioStateInfo>;
  preparePreflight(): Promise<PreflightPrep>;
  restorePreflight(): Promise<PreflightPrep>;
  runUtilityAction(action: UtilityAction): Promise<Utilities>;
  playTone(hz: number): Promise<void>;
  /** The Pianoteq rig (PIANO Pi). Cues are one-way and never touch its audio thread. */
  getPianoRig(): Promise<PianoRig>;
  pianoCue(cue: PianoCue): Promise<PianoRig>;
  /** Fleet health — every machine in the school, one glance. */
  getFleet(): Promise<FleetDevice[]>;
  /** Air, ventilation and the purifiers. */
  getAir(): Promise<AirState>;
  setPurifierMode(id: string, mode: PurifierMode): Promise<AirState>;
  /** Run every purifier flat out for N minutes, then return them to auto. */
  startAirPurge(minutes: number): Promise<AirState>;
  stopAirPurge(): Promise<AirState>;
  /** Family SOS — one tap from any phone raises the whole house. */
  getSos(): Promise<Sos | null>;
  triggerSos(who: string, message: string): Promise<Sos>;
  clearSos(): Promise<void>;
  /** Delivery OTP hand-off shown on a door display. */
  getDelivery(): Promise<Delivery | null>;
  setDelivery(input: DeliveryInput): Promise<Delivery>;
  clearDelivery(): Promise<void>;
  /** Per-display assignable content for the wall/door panels. */
  getDisplays(): Promise<DisplayConfig[]>;
  updateDisplay(id: string, patch: Partial<Pick<DisplayConfig, "content" | "message" | "name">>): Promise<DisplayConfig[]>;
  addDisplay(name: string): Promise<DisplayConfig[]>;
  removeDisplay(id: string): Promise<DisplayConfig[]>;
  /** Development/commissioning endpoint. The production UI exposes this only in mock mode. */
  triggerSafetyDemo(kind: SafetyAlertKind): Promise<Safety>;
  /** Subscribe to live updates (SSE on live, simulated ticker on mock). Returns unsubscribe. */
  subscribe(cb: (ev: StreamEvent) => void): () => void;
  /** Local recording-quiet threshold in dB (mock computes pre-flight with it). */
  setDbThreshold(v: number): void;
}

export interface StateMeta {
  label: string;
  short: string;
  color: string;
  rgb: string; // "r g b" for tailwind-style alpha usage
  needsConfirm: boolean;
  tagline: string;
  houseAction: string;
}

export const STATE_ORDER: StudioState[] = [
  "available",
  "class",
  "meeting",
  "audio_rec",
  "video_rec",
  "emergency",
];

export const STATE_META: Record<StudioState, StateMeta> = {
  available: {
    label: "Available",
    short: "AVAIL",
    color: "#2FBF71",
    rgb: "47 191 113",
    needsConfirm: false,
    tagline: "The house is open. Come on in.",
    houseAction: "Signs green · doorbell on · studio devices restored",
  },
  class: {
    label: "Class",
    short: "CLASS",
    color: "#3B82F6",
    rgb: "59 130 246",
    needsConfirm: false,
    tagline: "Lesson in progress — enter softly.",
    houseAction: "Signs blue · silent doorbell · warm lesson lights",
  },
  meeting: {
    label: "Meeting",
    short: "MEET",
    color: "#F5A623",
    rgb: "245 166 35",
    needsConfirm: false,
    tagline: "On a call. Knock before entering.",
    houseAction: "Signs amber · calls protected · family nudged",
  },
  audio_rec: {
    label: "Audio Rec",
    short: "AUDIO",
    color: "#E5484D",
    rgb: "229 72 77",
    needsConfirm: true,
    tagline: "Tape is rolling. Absolute silence.",
    houseAction: "Tally red · AC and fan off · take log armed",
  },
  video_rec: {
    label: "Video Rec",
    short: "VIDEO",
    color: "#D93036",
    rgb: "217 48 54",
    needsConfirm: true,
    tagline: "Cameras hot. Do not cross the frame.",
    houseAction: "On-Air red · doorbell muted · camera path clear",
  },
  emergency: {
    label: "Emergency",
    short: "SOS",
    color: "#7C3AED",
    rgb: "124 58 237",
    needsConfirm: true,
    tagline: "All family phones are ringing.",
    houseAction: "Signs flash violet · phones ring · snapshot shared",
  },
};

export const ROOM_NAMES: Record<RoomId, string> = {
  entrance: "Entrance",
  music: "Music Room",
  bedroom: "Bedroom",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
};

export const DEFAULT_SCENES: SceneDef[] = [
  { id: "youtube", label: "Start YouTube shoot", state: "video_rec", icon: "🎬" },
  { id: "classmode", label: "Class mode", state: "class", icon: "🎹" },
  { id: "winddown", label: "Wind down", state: "available", icon: "🌙" },
];
