#!/usr/bin/env node
/**
 * Aangan LAN server — no Raspberry Pi.
 *
 * Serves the Studio Command PWA and the live REST/SSE contract by reading
 * the six ESP32 boards directly. Phones, iPads and laptops on the school
 * Wi-Fi open this address over HTTP, which is what lets the app see the
 * boards (HTTPS Vercel cannot).
 *
 *   npm run lan          build the live app, then serve it
 *   npm run lan:serve    serve dist/ as it stands
 */

import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";
import { emptyReadings, NODES, pollHouse, snapshotFromReadings } from "./lib/house.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DIST = resolve(process.env.AANGAN_DIST || join(ROOT, "dist"));
const DATA_DIR = resolve(process.env.AANGAN_DATA || join(ROOT, "data"));
const STATE_FILE = join(DATA_DIR, "aangan-lan.json");
const PORT = Number(process.env.PORT || 8126);
const POLL_MS = Number(process.env.AANGAN_POLL_MS || 1500);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon",
};

function loadPersisted() {
  try {
    return JSON.parse(readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function savePersisted(house) {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(
      STATE_FILE,
      JSON.stringify(
        {
          state: house.state,
          displays: house.displays,
          delivery: house.delivery,
          sos: house.sos,
          dbThreshold: house.dbThreshold,
          history: house.history.slice(0, 40),
        },
        null,
        2,
      ),
    );
  } catch {
    // Persistence is helpful, not required.
  }
}

function defaultDisplays() {
  return [
    { id: "front-house", name: "Front of House", content: "door", message: "" },
    { id: "front-studio", name: "Front of Studio", content: "state", message: "" },
    { id: "wall-ipad", name: "Wall iPad", content: "house", message: "" },
  ];
}

export function createHouseState({ fetchFn = fetch, now = () => Date.now(), persist = savePersisted, saved } = {}) {
  const restored = saved === undefined ? loadPersisted() : saved;
  const house = {
    state: restored?.state ?? { state: "available", setBy: "Aangan", since: now() },
    displays: restored?.displays?.length ? restored.displays : defaultDisplays(),
    delivery: restored?.delivery?.active && restored.delivery.expiresAt > now() ? restored.delivery : null,
    sos: restored?.sos?.active ? restored.sos : null,
    dbThreshold: restored?.dbThreshold ?? 45,
    history: restored?.history ?? [
      {
        id: "lan-boot",
        type: "system",
        title: "LAN house online",
        detail: "Reading the six ESP32 boards directly — no Raspberry Pi",
        ts: now(),
        severity: "success",
      },
    ],
    readings: emptyReadings(),
    prep: { active: false, status: "idle", mutedDoorbell: false, acOff: false, fanOff: false },
    listeners: new Set(),
    seq: 0,
  };

  const emit = (event, data) => {
    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const listener of house.listeners) listener(frame);
  };

  const remember = (event) => {
    house.seq += 1;
    const next = { id: `lan-${now()}-${house.seq}`, ts: now(), ...event };
    house.history = [next, ...house.history].slice(0, 40);
    emit("history", next);
  };

  const snapshot = () =>
    snapshotFromReadings(house.readings, {
      studioState: house.state.state,
      dbThreshold: house.dbThreshold,
      now: now(),
    });

  const publish = () => {
    const snap = snapshot();
    emit("state", house.state);
    emit("rooms", snap.rooms);
    emit("safety", snap.safety);
    emit("preflight", { preflight: snap.preflight, prep: house.prep });
    emit("fleet", snap.fleet);
    emit("utilities", snap.utilities);
    emit("air", snap.air);
    emit("piano", snap.piano);
    emit("delivery", house.delivery);
    emit("displays", house.displays);
    emit("sos", house.sos);
    emit("doorbell", snap.doorbell);
  };

  const setState = (state, setBy) => {
    house.state = { state, setBy, since: now() };
    if (state !== "emergency" && house.sos) house.sos = null;
    remember({
      type: "state",
      title: `Studio → ${state}`,
      detail: `${setBy} conducted the house`,
      severity: state === "emergency" ? "critical" : "info",
    });
    persist(house);
    publish();
    return house.state;
  };

  const refresh = async () => {
    house.readings = await pollHouse(fetchFn);
    if (house.delivery && now() > house.delivery.expiresAt) {
      house.delivery = null;
      remember({
        type: "system",
        title: "Delivery OTP expired",
        detail: "The door display returned to its usual content",
        severity: "info",
      });
      persist(house);
    }
    publish();
    return snapshot();
  };

  return {
    house,
    snapshot,
    refresh,
    publish,
    setState,
    remember,
    persist: () => persist(house),
  };
}

function send(res, status, body, headers = {}) {
  const payload = typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store",
    ...headers,
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendJson(res, body, status = 200) {
  send(res, status, JSON.stringify(body), { "Content-Type": "application/json; charset=utf-8" });
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return {};
  }
}

function lanAddresses() {
  const nets = os.networkInterfaces();
  const out = [];
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      if (net.family === "IPv4" && !net.internal) out.push(net.address);
    }
  }
  return out;
}

function safeFile(urlPath) {
  const cleaned = decodeURIComponent(urlPath.split("?")[0]);
  const relative = cleaned === "/" ? "/index.html" : cleaned;
  const resolved = resolve(DIST, normalize(relative).replace(/^\/+/, ""));
  if (!resolved.startsWith(DIST)) return null;
  return resolved;
}

function serveStatic(req, res) {
  if (!existsSync(DIST)) {
    send(
      res,
      200,
      `<!doctype html><meta charset="utf-8"><title>Aangan LAN</title>
       <body style="font-family:sans-serif;background:#111;color:#eee;padding:2rem">
       <h1>Aangan LAN is running</h1>
       <p>The API is live at <code>/api/state</code>. Build the phone app with <code>npm run build:lan</code> so this address also serves the screens.</p>
       </body>`,
      { "Content-Type": "text/html; charset=utf-8" },
    );
    return;
  }
  let file = safeFile(req.url || "/");
  if (!file || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(DIST, "index.html");
  }
  if (!existsSync(file)) {
    send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }
  const body = readFileSync(file);
  send(res, 200, body, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
}

export function createLanServer(options = {}) {
  const api = createHouseState(options);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    const path = url.pathname;
    if (req.method === "OPTIONS") {
      send(res, 204, "");
      return;
    }

    try {
      if (path === "/api/state" && req.method === "GET") return sendJson(res, api.house.state);
      if (path === "/api/state" && req.method === "POST") {
        const body = await readBody(req);
        if (!body.state) return sendJson(res, { error: "state required" }, 400);
        return sendJson(res, api.setState(body.state, "Jason Zac"));
      }
      if (path === "/api/rooms" && req.method === "GET") return sendJson(res, api.snapshot().rooms);
      if (path === "/api/preflight" && req.method === "GET") return sendJson(res, api.snapshot().preflight);
      if (path === "/api/preflight/status" && req.method === "GET") return sendJson(res, api.house.prep);
      if (path === "/api/preflight/prepare" && req.method === "POST") {
        api.house.prep = {
          active: true,
          status: "ready",
          mutedDoorbell: false,
          acOff: false,
          fanOff: false,
          startedAt: Date.now(),
        };
        api.remember({
          type: "preflight",
          title: "Silence the room",
          detail: "No AC, fan or doorbell to switch — those devices are not in this house yet. The live dB meter is the gate.",
          severity: "info",
        });
        api.persist();
        return sendJson(res, api.house.prep);
      }
      if (path === "/api/preflight/restore" && req.method === "POST") {
        api.house.prep = { active: false, status: "idle", mutedDoorbell: false, acOff: false, fanOff: false };
        api.persist();
        return sendJson(res, api.house.prep);
      }
      if (path === "/api/settings/db-threshold" && req.method === "POST") {
        const body = await readBody(req);
        if (Number.isFinite(body.value)) api.house.dbThreshold = body.value;
        api.persist();
        return sendJson(res, { ok: true });
      }
      if (path === "/api/safety" && req.method === "GET") return sendJson(res, api.snapshot().safety);
      if (path === "/api/doorbell" && req.method === "GET") return sendJson(res, api.snapshot().doorbell);
      if (path === "/api/history" && req.method === "GET") return sendJson(res, api.house.history);
      if (path === "/api/utilities" && req.method === "GET") return sendJson(res, api.snapshot().utilities);
      if (path === "/api/utilities/action" && req.method === "POST") return sendJson(res, api.snapshot().utilities);
      if (path === "/api/panic" && req.method === "POST") return sendJson(res, api.setState("emergency", "Emergency control"));
      if (path === "/api/scene" && req.method === "POST") {
        const body = await readBody(req);
        return sendJson(res, api.setState(body.state, `Scene · ${body.name || "untitled"}`));
      }
      if (path === "/api/tone" && req.method === "POST") return sendJson(res, { ok: true });
      if (path === "/api/piano" && req.method === "GET") return sendJson(res, api.snapshot().piano);
      if (path === "/api/piano/cue" && req.method === "POST") return sendJson(res, api.snapshot().piano);
      if (path === "/api/fleet" && req.method === "GET") return sendJson(res, api.snapshot().fleet);
      if (path === "/api/air" && req.method === "GET") return sendJson(res, api.snapshot().air);
      if (path === "/api/air/purifier" && req.method === "POST") return sendJson(res, api.snapshot().air);
      if (path === "/api/air/purge" && req.method === "POST") return sendJson(res, api.snapshot().air);
      if (path === "/api/air/purge/stop" && req.method === "POST") return sendJson(res, api.snapshot().air);
      if (path === "/api/sos" && req.method === "GET") return sendJson(res, api.house.sos);
      if (path === "/api/sos" && req.method === "POST") {
        const body = await readBody(req);
        api.house.sos = { active: true, who: body.who || "Family", message: body.message || "", since: Date.now() };
        api.setState("emergency", `SOS · ${api.house.sos.who}`);
        return sendJson(res, api.house.sos);
      }
      if (path === "/api/sos/clear" && req.method === "POST") {
        api.house.sos = null;
        api.persist();
        api.publish();
        return sendJson(res, { ok: true });
      }
      if (path === "/api/delivery" && req.method === "GET") return sendJson(res, api.house.delivery);
      if (path === "/api/delivery" && req.method === "POST") {
        const body = await readBody(req);
        const minutes = Number(body.minutes) || 20;
        api.house.delivery = {
          active: true,
          courier: body.courier || "Delivery",
          otp: String(body.otp || ""),
          note: body.note || "",
          displayId: body.displayId || "front-house",
          expiresAt: Date.now() + minutes * 60_000,
        };
        api.remember({
          type: "system",
          title: `${api.house.delivery.courier} OTP on the door`,
          detail: "Shown on the assigned display until it expires",
          severity: "info",
        });
        api.persist();
        api.publish();
        return sendJson(res, api.house.delivery);
      }
      if (path === "/api/delivery/clear" && req.method === "POST") {
        api.house.delivery = null;
        api.persist();
        api.publish();
        return sendJson(res, { ok: true });
      }
      if (path === "/api/displays" && req.method === "GET") return sendJson(res, api.house.displays);
      if (path === "/api/displays/update" && req.method === "POST") {
        const body = await readBody(req);
        api.house.displays = api.house.displays.map((d) => (d.id === body.id ? { ...d, ...body.patch } : d));
        api.persist();
        api.publish();
        return sendJson(res, api.house.displays);
      }
      if (path === "/api/displays/add" && req.method === "POST") {
        const body = await readBody(req);
        api.house.displays.push({
          id: `display-${Date.now()}`,
          name: body.name || "New display",
          content: "message",
          message: "",
        });
        api.persist();
        api.publish();
        return sendJson(res, api.house.displays);
      }
      if (path === "/api/displays/remove" && req.method === "POST") {
        const body = await readBody(req);
        api.house.displays = api.house.displays.filter((d) => d.id !== body.id);
        api.persist();
        api.publish();
        return sendJson(res, api.house.displays);
      }
      if (path === "/api/safety/demo" && req.method === "POST") {
        return sendJson(res, api.snapshot().safety);
      }
      if (path === "/api/nodes" && req.method === "GET") {
        const snap = api.snapshot();
        return sendJson(res, { nodes: NODES, fleet: snap.fleet, washerRunning: snap.washerRunning });
      }
      if (path === "/api/stream" && req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        const listener = (frame) => res.write(frame);
        api.house.listeners.add(listener);
        api.publish();
        const keepAlive = setInterval(() => res.write(": keepalive\n\n"), 15000);
        req.on("close", () => {
          clearInterval(keepAlive);
          api.house.listeners.delete(listener);
        });
        return;
      }

      if (path.startsWith("/api/")) return sendJson(res, { error: "not found" }, 404);
      serveStatic(req, res);
    } catch (error) {
      sendJson(res, { error: String(error?.message || error) }, 500);
    }
  });

  return { server, api };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { server, api } = createLanServer();
  server.listen(PORT, "0.0.0.0", async () => {
    const addresses = lanAddresses();
    console.log(`Aangan LAN on port ${PORT} — no Raspberry Pi`);
    for (const ip of addresses.length ? addresses : ["127.0.0.1"]) {
      console.log(`  Open on any phone:  http://${ip}:${PORT}`);
    }
    console.log("Boards:");
    for (const node of NODES) console.log(`  ${node.sticker} ${node.name.padEnd(14)} http://${node.host}`);
    await api.refresh();
    setInterval(() => {
      void api.refresh();
    }, POLL_MS);
  });
}
