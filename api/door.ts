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
 *   POST /api/door  { "state": "audio_rec" }   ← the app, on every change
 *   GET  /api/door                             ← ledESP, every couple of seconds
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

/** Survives between invocations on a warm instance; lost on a cold start. */
let memory: { state: string; at: number } = { state: "available", at: 0 };

async function kv(path: string): Promise<unknown> {
  const res = await fetch(`${KV_URL}/${path}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`kv ${res.status}`);
  return (await res.json())?.result ?? null;
}

async function readState() {
  if (!kvReady) return memory;
  try {
    const raw = await kv(`get/${KEY}`);
    if (typeof raw === "string" && raw.length) return JSON.parse(raw);
  } catch {
    // KV blipped. Fall through to memory rather than 500 — a door light going
    // stale is far better than the board getting an error it cannot act on.
  }
  return memory;
}

async function writeState(state: string) {
  memory = { state, at: Date.now() };
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
