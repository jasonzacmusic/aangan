/**
 * Door-light rendezvous.
 *
 * Why this exists at all: the deployed app is served over https and the light
 * board is a plain http device on the house Wi-Fi. Browsers refuse https →
 * http outright, so the page can never call the board. The fix is to turn the
 * arrow around — the app writes the state here, and the board polls here. A
 * board making an outbound https call is unaffected by mixed content, by mesh
 * client isolation, and by whether the Mac is even switched on.
 *
 *   POST /api/door  { "state": "audio_rec" }        ← the app, on every change
 *   POST /api/door  { "message": "Back at 4" }      ← a note for the door sign
 *   POST /api/door  { "visual": "door", "dba": 61 }  ← the board, every 3s
 *   GET  /api/door                                   ← the door sign / anyone
 *
 * The board's poll is a POST rather than a GET so that one call does both jobs:
 * it reports what the board can see (door open, room too loud — facts that
 * arrive over ESP-NOW and exist nowhere else) and receives the studio state in
 * the reply. Splitting that into a read and a write would double the serverless
 * invocations for no gain.
 *
 * Storage is Vercel KV over its REST API, called with plain fetch so this file
 * needs no dependency. If KV is not configured the route still answers from
 * module memory, and says so in the payload.
 *
 * Memory has one failure mode worth naming: several instances can be warm at
 * once, and a freshly started one begins blank. The board must not be told
 * "available" by an instance that has simply never been written to. So every
 * answer carries `at`, the moment the value was set, and the board ignores
 * anything not newer than what it already applied. A blank instance reports
 * at: 0 and is therefore never believed. This costs nothing and removes the
 * need for a paid store.
 */

const KEY = "aangan:door:state";

const STATES = new Set([
  "available",
  "class",
  "meeting",
  "audio_rec",
  "video_rec",
  "emergency",
]);

const KV_URL = process.env.KV_REST_API_URL ?? "";
const KV_TOKEN = process.env.KV_REST_API_TOKEN ?? "";
const kvReady = KV_URL.length > 0 && KV_TOKEN.length > 0;

const VISUALS = new Set(["ok", "loud", "door"]);

type Door = {
  /** What the studio is doing. Only the app sets this. */
  state: string;
  /** Epoch ms of the last state write. 0 = this instance knows nothing. */
  at: number;
  /** What the board can see. Only the board sets this. */
  visual: string;
  dba: number | null;
  /** A free-text note for the sign. Empty means "use the state's own words". */
  message: string;
  /** Epoch ms of the last note write, tracked separately from `at`.
   *  The note needs its own stamp: a state change must not make an instance
   *  that has never seen the note look like the freshest source of it. */
  mat: number;
};

/** Survives between invocations on a warm instance; lost on a cold start. */
let memory: Door = { state: "available", at: 0, visual: "ok", dba: null, message: "", mat: 0 };

/** Long enough for "Back at 4, please wait downstairs", short enough to read
 *  across a hall. A sign nobody can read from the door is not a sign. */
const MESSAGE_MAX = 80;

async function kv(path: string): Promise<unknown> {
  const res = await fetch(`${KV_URL}/${path}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  return (await res.json())?.result ?? null;
}

async function readState(): Promise<Door> {
  if (!kvReady) return memory;
  try {
    const raw = await kv(`get/${KEY}`);
    if (typeof raw === "string" && raw.length) return { ...memory, ...JSON.parse(raw) };
  } catch {
    // KV blipped. Fall through to memory rather than 500 — a door light going
    // stale is far better than the board getting an error it cannot act on.
  }
  return memory;
}

async function writeState(state: string) {
  memory = { ...memory, state, at: Date.now() };
  if (!kvReady) return;
  try {
    await kv(`set/${KEY}/${encodeURIComponent(JSON.stringify(memory))}`);
  } catch {
    /* memory already updated; the warm instance keeps serving */
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  // The board polls this constantly; a cached answer would freeze the light.
  res.setHeader("Cache-Control", "no-store, max-age=0");

  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "POST") {
    const body = typeof req.body === "string" ? safeParse(req.body) : req.body;

    // A note for the sign, on its own or alongside a state change.
    const hasMessage = body && typeof body.message === "string";
    if (hasMessage) {
      memory.message = body.message.replace(/\s+/g, " ").trim().slice(0, MESSAGE_MAX);
      memory.mat = Date.now();
    }
    // A note with no state is a complete request. Answer it here, before the
    // board branch, so it is never mistaken for a board report.
    if (hasMessage && body.state === undefined) {
      return res.status(200).json({ ok: true, message: memory.message, mat: memory.mat });
    }

    // A board report. Never touches `state` or `at` — the board is not allowed
    // to decide what the studio is doing, only to say what it can see.
    if (body && body.state === undefined) {
      const visual = String(body.visual ?? "");
      if (VISUALS.has(visual)) memory.visual = visual;
      const dba = Number(body.dba);
      if (Number.isFinite(dba)) memory.dba = Math.round(dba * 10) / 10;
      const now = await readState();
      return res.status(200).json({
        state: now.state, at: now.at, visual: memory.visual, dba: memory.dba,
      });
    }

    const state = String(body?.state ?? "");
    if (!STATES.has(state)) {
      return res.status(400).json({ ok: false, error: "unknown state", got: state });
    }
    await writeState(state);
    return res.status(200).json({ ok: true, state, at: memory.at, store: kvReady ? "kv" : "memory" });
  }

  const current = await readState();
  return res.status(200).json({
    state: current.state,
    // Epoch ms of the last write. 0 means this instance has never been
    // written to, which the board reads as "I know nothing, ignore me".
    at: current.at,
    // What the board can see. The sign needs these to show the door-open and
    // too-loud rules; they live nowhere else, since they arrive on ESP-NOW.
    visual: memory.visual,
    dba: memory.dba,
    message: memory.message,
    mat: memory.mat,
    age_s: current.at ? Math.round((Date.now() - current.at) / 1000) : null,
    store: kvReady ? "kv" : "memory",
  });
}

function safeParse(s: string) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
