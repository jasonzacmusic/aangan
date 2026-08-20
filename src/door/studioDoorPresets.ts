import { StudioState } from "../api/types";

/**
 * G2 studio-door sign — one married state.
 * Visual plate, rolling ticker, and bulb colour are the same row.
 * Drop a photo over any plate later: keep the filename, swap the file.
 *
 * Two hall warnings, from the paper sketch: the puck colour, and this
 * two-zone plate. They must trip together. The mic stays inside.
 */
export type DoorVisualId = "ok" | "wait" | "loud" | "dnd" | "onair" | "sos";

/** Measured rest with the studio AC on (Aangan live, 19 Aug 2026). Not a warning. */
export const STUDIO_REST_DBA_AC_ON = 42;

/**
 * Hall warning line. 10 dB above rest is roughly twice as loud, so the AC
 * at 42 stays OK and a voice / clap / piano trips WAIT on bulb + sign.
 */
export const DEFAULT_DOOR_WARN_DBA = STUDIO_REST_DBA_AC_ON + 10;

/** Keep WAIT up after a spike so a clap is visible, not a one-frame flicker. */
export const DOOR_WARN_HOLD_MS = 8000;

export interface StudioDoorPreset {
  id: DoorVisualId;
  mark: string;
  color: string;
  image: string;
  tickers: string[];
}

export const STUDIO_DOOR_PRESETS: Record<DoorVisualId, StudioDoorPreset> = {
  ok: {
    id: "ok",
    mark: "OK",
    color: "#2FBF71",
    image: "/door/ok.svg",
    tickers: ["Knock if you need me — the studio is open", "Come in. Don't lurk in the hall."],
  },
  wait: {
    id: "wait",
    mark: "WAIT",
    color: "#F5A623",
    image: "/door/wait.svg",
    tickers: ["Lesson on. Come in at your own peril", "A student is playing — enter softly or wait"],
  },
  loud: {
    id: "loud",
    mark: "WAIT",
    color: "#F5A623",
    image: "/door/loud.svg",
    tickers: ["The room is live. Hold the door.", "Someone is making a noise in here — wait"],
  },
  dnd: {
    id: "dnd",
    mark: "DND",
    color: "#E5484D",
    image: "/door/dnd.svg",
    tickers: ["Recording — do not open this door", "Absolute silence. Do not ring."],
  },
  onair: {
    id: "onair",
    mark: "ON AIR",
    color: "#D93036",
    image: "/door/onair.svg",
    tickers: ["On air. Do not cross the frame", "Cameras rolling. Wait outside."],
  },
  sos: {
    id: "sos",
    mark: "SOS",
    color: "#7C3AED",
    image: "/door/sos.svg",
    tickers: ["Emergency. Call the family before you enter", "Don't come in. Phone first."],
  },
};

const MEETING_TICKERS = ["On a call. Knock, then wait", "Don't walk in mid-sentence"];

export function resolveStudioDoorPreset(input: {
  state: StudioState;
  dbLevel?: number | null;
  doorWarnDb: number;
  doorOpen: boolean;
  visualOverride?: DoorVisualId | null;
  acousticHold?: boolean;
}): StudioDoorPreset {
  const { state, dbLevel, doorWarnDb, doorOpen, visualOverride, acousticHold } = input;
  if (visualOverride && visualOverride in STUDIO_DOOR_PRESETS) {
    const p = { ...STUDIO_DOOR_PRESETS[visualOverride] };
    if ((visualOverride === "dnd" || visualOverride === "onair") && doorOpen) {
      p.tickers = ["The studio door is open — shut it", ...p.tickers];
    }
    if (visualOverride === "wait" && state === "class") p.color = "#3B82F6";
    if (visualOverride === "wait" && state === "meeting") p.tickers = MEETING_TICKERS;
    return p;
  }
  if (state === "emergency") return STUDIO_DOOR_PRESETS.sos;
  if (state === "video_rec") {
    const p = { ...STUDIO_DOOR_PRESETS.onair };
    if (doorOpen) p.tickers = ["The studio door is open — shut it", ...p.tickers];
    return p;
  }
  if (state === "audio_rec") {
    const p = { ...STUDIO_DOOR_PRESETS.dnd };
    if (doorOpen) p.tickers = ["The studio door is open — shut it", ...p.tickers];
    return p;
  }
  if (state === "class") {
    return { ...STUDIO_DOOR_PRESETS.wait, color: "#3B82F6" };
  }
  if (state === "meeting") {
    return { ...STUDIO_DOOR_PRESETS.wait, color: "#F5A623", tickers: MEETING_TICKERS };
  }
  const over = acousticHold || (dbLevel != null && dbLevel >= doorWarnDb);
  if (over) return STUDIO_DOOR_PRESETS.loud;
  return STUDIO_DOOR_PRESETS.ok;
}
