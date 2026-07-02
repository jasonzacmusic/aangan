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

export interface Doorbell {
  snapshotUrl: string;
  ts: number;
}

export type StreamEvent =
  | { type: "state"; state: StudioStateInfo }
  | { type: "rooms"; rooms: Room[] }
  | { type: "safety"; safety: Safety }
  | { type: "doorbell"; doorbell: Doorbell };

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
  panic(): Promise<void>;
  scene(name: string): Promise<StudioStateInfo>;
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
  },
  class: {
    label: "Class",
    short: "CLASS",
    color: "#3B82F6",
    rgb: "59 130 246",
    needsConfirm: false,
    tagline: "Lesson in progress — enter softly.",
  },
  meeting: {
    label: "Meeting",
    short: "MEET",
    color: "#F5A623",
    rgb: "245 166 35",
    needsConfirm: false,
    tagline: "On a call. Knock before entering.",
  },
  audio_rec: {
    label: "Audio Rec",
    short: "AUDIO",
    color: "#E5484D",
    rgb: "229 72 77",
    needsConfirm: true,
    tagline: "Tape is rolling. Absolute silence.",
  },
  video_rec: {
    label: "Video Rec",
    short: "VIDEO",
    color: "#D93036",
    rgb: "217 48 54",
    needsConfirm: true,
    tagline: "Cameras hot. Do not cross the frame.",
  },
  emergency: {
    label: "Emergency",
    short: "SOS",
    color: "#7C3AED",
    rgb: "124 58 237",
    needsConfirm: true,
    tagline: "All family phones are ringing.",
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
