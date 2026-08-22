/**
 * Stable public rendezvous for the two studio-door devices and the Aangan app.
 *
 * State lives in one Cloudflare Durable Object. This Vercel route deliberately
 * owns no state: serverless instances may come and go, but every request is
 * forwarded to the same strongly-consistent object.
 */

const STORE_URL = process.env.DOOR_STORE_URL ?? "";
const STORE_TOKEN = process.env.DOOR_STORE_TOKEN ?? "";

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "content-type");
  res.setHeader("Cache-Control", "no-store, max-age=0");

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
    const upstream = await fetch(STORE_URL, {
      method: req.method,
      headers: {
        Authorization: `Bearer ${STORE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: req.method === "POST" ? JSON.stringify(req.body ?? {}) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });

    const payload = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") ?? "application/json");
    return res.send(payload);
  } catch {
    return res.status(502).json({ ok: false, error: "door store unreachable" });
  }
}
