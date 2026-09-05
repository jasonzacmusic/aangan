/**
 * Stable public rendezvous for the two studio-door devices and the Aangan app.
 *
 * State lives in one Cloudflare Durable Object. This Vercel route deliberately
 * owns no state: serverless instances may come and go, but every request is
 * forwarded to the same strongly-consistent object.
 *
 * A few live-worker gaps are papered here so the 7" and the strip recover
 * even when Wrangler cannot be deployed from this Mac: a strip check-in that
 * omits visual after DOOR OPEN / TOO LOUD is rewritten through the app path
 * the current worker already accepts, and a stale dBA reading is not shown.
 */

const STORE_URL = process.env.DOOR_STORE_URL ?? "";
const STORE_TOKEN = process.env.DOOR_STORE_TOKEN ?? "";

const FROM_STATE: Record<string, string> = {
  available: "ok",
  class: "wait",
  meeting: "wait",
  audio_rec: "onair",
  video_rec: "onair",
  emergency: "emergency",
};

function cors(res: { setHeader: (k: string, v: string) => void }) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Cache-Control", "no-store, max-age=0");
}

async function store(method: "GET" | "POST", body?: unknown) {
  return fetch(STORE_URL, {
    method,
    headers: {
      Authorization: `Bearer ${STORE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
}

function sendUpstream(res: any, upstream: Response, payload: string) {
  res.status(upstream.status);
  res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
  return res.send(payload);
}

function scrubStaleDba(text: string): string {
  try {
    const door = JSON.parse(text);
    if (typeof door.strip_age_s === "number" && door.strip_age_s >= 90) door.dba = null;
    return JSON.stringify(door);
  } catch {
    return text;
  }
}

export default async function handler(req: any, res: any) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "method not allowed" });
  }

  // Never fall back to per-instance memory. A visible 503 is safer than
  // silently splitting the door state across several Vercel instances again.
  if (!STORE_URL || !STORE_TOKEN) {
    return res.status(503).json({ ok: false, error: "door store unavailable" });
  }

  try {
    if (req.method === "GET") {
      const upstream = await store("GET");
      return sendUpstream(res, upstream, scrubStaleDba(await upstream.text()));
    }

    const body = req.body && typeof req.body === "object" ? { ...req.body } : {};
    const isStrip = body.device === "strip" || Object.prototype.hasOwnProperty.call(body, "dba");
    const hasState = body.state !== undefined;
    const visual = typeof body.visual === "string" ? body.visual : "";

    if (isStrip && !hasState && !visual) {
      let current: { state?: string; visual?: string } = {};
      try {
        current = await (await store("GET")).json();
      } catch {
        current = {};
      }
      const upstream = await store("POST", body);
      if (current.visual === "door" || current.visual === "loud") {
        const restored = FROM_STATE[String(current.state)] || "ok";
        await store("POST", { device: "app", visual: restored });
        const fresh = await store("GET");
        return sendUpstream(res, fresh, scrubStaleDba(await fresh.text()));
      }
      return sendUpstream(res, upstream, await upstream.text());
    }

    if (hasState) {
      let current: { message?: string } = {};
      try {
        current = await (await store("GET")).json();
      } catch {
        current = {};
      }
      const upstream = await store("POST", body);
      if (current.message === "__off__") {
        await store("POST", { message: "" });
      }
      return sendUpstream(res, upstream, await upstream.text());
    }

    const upstream = await store("POST", body);
    return sendUpstream(res, upstream, await upstream.text());
  } catch {
    return res.status(502).json({ ok: false, error: "door store unreachable" });
  }
}
