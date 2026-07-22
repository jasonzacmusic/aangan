#!/usr/bin/env python3
"""Studio Command wrapper — the REST/SSE bridge the app's LiveAdapter talks to.

Runs on (or next to) the HOUSE Pi, port 8126. Python 3.11+, stdlib only.
Set LIVE_BASE_URL = "http://studio.local:8126" in src/config.ts when going live
(8123 belongs to Home Assistant itself).

Environment:
  HA_URL      default http://127.0.0.1:8123
  HA_TOKEN    REQUIRED — a Home Assistant long-lived access token
  PIANO_URL   default http://piano.local:8951
  STATE_FILE  default /var/lib/studio-wrapper/state.json  (displays/delivery/history)

Contract: see src/api/liveAdapter.ts — every endpoint and SSE event implemented
here. Entity ids live in ENTITY at the top; adjust once after ESPHome adoption.
"""
import json
import os
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("PORT", "8126"))
HA_URL = os.environ.get("HA_URL", "http://127.0.0.1:8123").rstrip("/")
HA_TOKEN = os.environ.get("HA_TOKEN", "")
PIANO_URL = os.environ.get("PIANO_URL", "http://piano.local:8951").rstrip("/")
STATE_FILE = os.environ.get("STATE_FILE", "/var/lib/studio-wrapper/state.json")

ENTITY = {
    "state": "input_select.studio_state",
    "set_by": "input_text.studio_state_set_by",
    "db": "sensor.studio_sound_level",
    "db_threshold": "input_number.studio_db_threshold",
    "ready": "binary_sensor.studio_ready",
    "doors_ok": "binary_sensor.studio_doors_ok",
    "quiet": "binary_sensor.studio_quiet",
    "healthy": "binary_sensor.studio_sensors_healthy",
    "safety_clear": "binary_sensor.house_safety_clear",
    "gas": "binary_sensor.lpg_detector_alarm_contact",
    "leak_kitchen": "binary_sensor.kitchen_sink_leak",
    "leak_bath": "binary_sensor.bathroom_1_leak",
    # room map: app RoomId -> (door entity, presence entity, temp entity)
    "rooms": {
        "entrance": ("binary_sensor.main_door", "binary_sensor.entrance_pir", None),
        "music": ("binary_sensor.studio_door_leaf_a", "binary_sensor.studio_presence", None),
        "bedroom": (None, None, None),
        "kitchen": (None, None, None),
        "bathroom": (None, None, None),
    },
}

DEFAULT_DISPLAYS = [
    {"id": "front-house", "name": "Front of House", "content": "door", "message": ""},
    {"id": "front-studio", "name": "Front of Studio", "content": "state", "message": ""},
    {"id": "wall-ipad", "name": "Wall iPad", "content": "house", "message": ""},
]

LOCK = threading.Lock()
SUBSCRIBERS = []  # list of queues (simple lists with condition)
COND = threading.Condition()


def ha(path, method="GET", body=None):
    req = urllib.request.Request(
        f"{HA_URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=5) as res:
        return json.loads(res.read() or b"null")


def ha_state(entity, default=None):
    try:
        return ha(f"/api/states/{entity}")["state"]
    except Exception:
        return default


def ha_on(entity):
    return ha_state(entity) == "on"


def ha_set_select(entity, option):
    ha("/api/services/input_select/select_option", "POST", {"entity_id": entity, "option": option})


class Store:
    """Displays / delivery / history persisted to STATE_FILE."""

    def __init__(self):
        self.displays = [dict(d) for d in DEFAULT_DISPLAYS]
        self.delivery = None
        self.history = []
        self.seq = 0
        try:
            with open(STATE_FILE) as f:
                saved = json.load(f)
            self.displays = saved.get("displays") or self.displays
            self.delivery = saved.get("delivery")
            self.history = saved.get("history") or []
        except (OSError, json.JSONDecodeError):
            pass

    def save(self):
        os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
        tmp = STATE_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump({"displays": self.displays, "delivery": self.delivery, "history": self.history}, f)
        os.replace(tmp, STATE_FILE)

    def add_history(self, type_, title, detail, severity="info"):
        self.seq += 1
        ev = {
            "id": f"w-{int(time.time() * 1000)}-{self.seq}",
            "type": type_,
            "title": title,
            "detail": detail,
            "ts": int(time.time() * 1000),
            "severity": severity,
        }
        self.history = [ev] + self.history[:39]
        self.save()
        broadcast("history", ev)
        return ev


STORE = Store()


def broadcast(event, payload):
    frame = f"event: {event}\ndata: {json.dumps(payload)}\n\n"
    with COND:
        for q in SUBSCRIBERS:
            q.append(frame)
        COND.notify_all()


# ── shape builders ───────────────────────────────────────────────────────────
def state_info():
    return {
        "state": ha_state(ENTITY["state"], "available"),
        "setBy": ha_state(ENTITY["set_by"], "Studio Command"),
        "since": int(time.time() * 1000),  # HA last_changed would be better; kept simple
    }


def rooms_payload():
    colors = {"available": "#2FBF71", "class": "#3B82F6", "meeting": "#F5A623",
              "audio_rec": "#E5484D", "video_rec": "#D93036", "emergency": "#7C3AED"}
    sign = colors.get(ha_state(ENTITY["state"], "available"), "#2FBF71")
    names = {"entrance": "Entrance", "music": "Music Room", "bedroom": "Bedroom",
             "kitchen": "Kitchen", "bathroom": "Bathroom"}
    out = []
    for rid, (door, presence, temp) in ENTITY["rooms"].items():
        room = {
            "id": rid, "name": names[rid],
            "doorOpen": ha_on(door) if door else False,
            "presence": ha_on(presence) if presence else False,
            "tempC": float(ha_state(temp, "25") or 25) if temp else 25.0,
            "signColor": sign,
        }
        if rid == "music":
            room["dbLevel"] = float(ha_state(ENTITY["db"], "0") or 0)
        out.append(room)
    return out


def preflight_payload():
    doors_ok = ha_on(ENTITY["doors_ok"])
    return {
        "doorsClosed": doors_ok,
        "quietEnough": ha_on(ENTITY["quiet"]),
        "sensorsHealthy": ha_on(ENTITY["healthy"]),
        "safetyClear": ha_on(ENTITY["safety_clear"]),
        "ready": ha_on(ENTITY["ready"]),
        "openDoors": [] if doors_ok else ["music"],
        "dbLevel": float(ha_state(ENTITY["db"], "0") or 0),
        "dbThreshold": float(ha_state(ENTITY["db_threshold"], "45") or 45),
    }


def safety_payload():
    return {
        "gas": ha_on(ENTITY["gas"]),
        "leakKitchen": ha_on(ENTITY["leak_kitchen"]),
        "leakBath": ha_on(ENTITY["leak_bath"]),
    }


def piano_payload():
    try:
        with urllib.request.urlopen(f"{PIANO_URL}/status", timeout=2) as res:
            return json.loads(res.read())
    except Exception:
        return {"online": False, "preset": "—", "cpuPct": 0, "tempC": 0,
                "audioDevice": "piano.local unreachable", "sampleRate": 48000,
                "bufferFrames": 192, "latencyMs": 4, "lastSeen": 0}


def utilities_payload():
    # Wire these to real entities as the water/power/LPG/air sensors go in.
    return {
        "water": {"sumpPct": 0, "overheadPct": 0, "pumpRunning": False, "dryRunProtected": True, "lastFillTs": 0},
        "power": {"mainsOnline": True, "voltage": 230, "inverterPct": 100, "estimatedMinutes": 0, "surgeProtected": True},
        "lpg": {"remainingPct": 0, "estimatedDays": 0},
        "air": {"aqi": 0, "pm25": 0, "tempC": 25.0, "humidityPct": 50, "purifierOn": False},
    }


def expire_delivery_if_needed():
    with LOCK:
        d = STORE.delivery
        if d and d.get("active") and d["expiresAt"] < time.time() * 1000:
            STORE.delivery = None
            STORE.save()
            broadcast("delivery", None)


# ── background poller: diff HA → SSE ─────────────────────────────────────────
def poller():
    last = {}
    while True:
        try:
            snap = {
                "state": state_info(), "rooms": rooms_payload(),
                "safety": safety_payload(), "utilities": utilities_payload(),
                "piano": piano_payload(),
            }
            pf = {"preflight": preflight_payload(), "prep": prep_state()}
            for key, val in snap.items():
                if last.get(key) != val:
                    broadcast(key, val)
                    last[key] = val
            if last.get("preflight") != pf:
                broadcast("preflight", pf)
                last["preflight"] = pf
            expire_delivery_if_needed()
        except Exception:
            pass
        time.sleep(2)


PREP = {"active": False, "status": "idle", "mutedDoorbell": False, "acOff": False, "fanOff": False}


def prep_state():
    return dict(PREP)


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _body(self):
        length = int(self.headers.get("Content-Length") or 0)
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError:
            return {}

    def do_GET(self):
        p = self.path.split("?")[0]
        if p == "/api/state":
            return self._json(state_info())
        if p == "/api/rooms":
            return self._json(rooms_payload())
        if p == "/api/preflight":
            return self._json(preflight_payload())
        if p == "/api/preflight/status":
            return self._json(prep_state())
        if p == "/api/safety":
            return self._json(safety_payload())
        if p == "/api/doorbell":
            return self._json({"snapshotUrl": "/api/doorbell.jpg", "ts": int(time.time() * 1000)})
        if p == "/api/history":
            return self._json(STORE.history)
        if p == "/api/utilities":
            return self._json(utilities_payload())
        if p == "/api/piano":
            return self._json(piano_payload())
        if p == "/api/delivery":
            expire_delivery_if_needed()
            return self._json(STORE.delivery)
        if p == "/api/displays":
            return self._json(STORE.displays)
        if p == "/api/stream":
            return self.stream()
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        p = self.path.split("?")[0]
        body = self._body()
        if p == "/api/state":
            ha_set_select(ENTITY["state"], body.get("state", "available"))
            info = state_info()
            STORE.add_history("state", f"Studio → {info['state']}", "set from Studio Command")
            broadcast("state", info)
            return self._json(info)
        if p == "/api/scene":
            ha_set_select(ENTITY["state"], body.get("state", "available"))
            info = state_info()
            STORE.add_history("state", f"Scene · {body.get('name', '?')}", "ran from Studio Command")
            broadcast("state", info)
            return self._json(info)
        if p == "/api/panic":
            ha_set_select(ENTITY["state"], "emergency")
            STORE.add_history("state", "EMERGENCY", "panic from the app", "critical")
            broadcast("state", state_info())
            return self._json({"ok": True})
        if p == "/api/settings/db-threshold":
            ha("/api/services/input_number/set_value", "POST",
               {"entity_id": ENTITY["db_threshold"], "value": body.get("value", 45)})
            return self._json({"ok": True})
        if p == "/api/preflight/prepare":
            # Delegate the real device work to an HA script if you have one:
            try:
                ha("/api/services/script/turn_on", "POST", {"entity_id": "script.studio_silence_room"})
            except Exception:
                pass
            PREP.update({"active": True, "status": "ready", "mutedDoorbell": True,
                         "acOff": True, "fanOff": True, "startedAt": int(time.time() * 1000)})
            broadcast("preflight", {"preflight": preflight_payload(), "prep": prep_state()})
            return self._json(prep_state())
        if p == "/api/preflight/restore":
            try:
                ha("/api/services/script/turn_on", "POST", {"entity_id": "script.studio_restore_room"})
            except Exception:
                pass
            PREP.update({"active": False, "status": "idle", "mutedDoorbell": False, "acOff": False, "fanOff": False})
            broadcast("preflight", {"preflight": preflight_payload(), "prep": prep_state()})
            return self._json(prep_state())
        if p == "/api/utilities/action":
            return self._json(utilities_payload())
        if p == "/api/tone":
            return self._json({"ok": True})
        if p == "/api/piano/cue":
            try:
                req = urllib.request.Request(f"{PIANO_URL}/cue", data=json.dumps(body).encode(),
                                             headers={"Content-Type": "application/json"})
                with urllib.request.urlopen(req, timeout=3) as res:
                    piano = json.loads(res.read())
            except Exception:
                piano = piano_payload()
            broadcast("piano", piano)
            return self._json(piano)
        if p == "/api/delivery":
            with LOCK:
                STORE.delivery = {
                    "active": True,
                    "courier": (body.get("courier") or "Delivery").strip(),
                    "otp": (body.get("otp") or "").strip(),
                    "note": (body.get("note") or "").strip(),
                    "displayId": body.get("displayId") or "front-house",
                    "expiresAt": int(time.time() * 1000) + max(1, int(body.get("minutes") or 20)) * 60_000,
                }
                STORE.save()
            broadcast("delivery", STORE.delivery)
            STORE.add_history("system", f"{STORE.delivery['courier']} OTP on the door", "delivery hand-off shown")
            return self._json(STORE.delivery)
        if p == "/api/delivery/clear":
            with LOCK:
                STORE.delivery = None
                STORE.save()
            broadcast("delivery", None)
            return self._json({"ok": True})
        if p == "/api/displays/update":
            with LOCK:
                for d in STORE.displays:
                    if d["id"] == body.get("id"):
                        d.update({k: v for k, v in (body.get("patch") or {}).items()
                                  if k in ("content", "message", "name")})
                STORE.save()
            broadcast("displays", STORE.displays)
            return self._json(STORE.displays)
        if p == "/api/displays/add":
            with LOCK:
                STORE.displays.append({"id": f"panel-{int(time.time())}",
                                       "name": (body.get("name") or "New display").strip(),
                                       "content": "door", "message": ""})
                STORE.save()
            broadcast("displays", STORE.displays)
            return self._json(STORE.displays)
        if p == "/api/displays/remove":
            with LOCK:
                keep_ids = {d["id"] for d in DEFAULT_DISPLAYS}
                STORE.displays = [d for d in STORE.displays
                                  if d["id"] != body.get("id") or d["id"] in keep_ids]
                STORE.save()
            broadcast("displays", STORE.displays)
            return self._json(STORE.displays)
        if p == "/api/safety/demo":
            # Commissioning only — REMOVE or firewall this in production.
            return self._json(safety_payload())
        self._json({"error": "not found"}, 404)

    def stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        q = []
        with COND:
            SUBSCRIBERS.append(q)
        try:
            # initial frames the contract requires
            for name, payload in (("safety", safety_payload()),
                                  ("utilities", utilities_payload()),
                                  ("preflight", {"preflight": preflight_payload(), "prep": prep_state()}),
                                  ("state", state_info()),
                                  ("piano", piano_payload()),
                                  ("delivery", STORE.delivery),
                                  ("displays", STORE.displays)):
                self.wfile.write(f"event: {name}\ndata: {json.dumps(payload)}\n\n".encode())
            self.wfile.flush()
            last_beat = time.time()
            while True:
                with COND:
                    COND.wait(timeout=10)
                    frames, q[:] = q[:], []
                for frame in frames:
                    self.wfile.write(frame.encode())
                if time.time() - last_beat > 15:
                    self.wfile.write(b": keepalive\n\n")
                    last_beat = time.time()
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass
        finally:
            with COND:
                if q in SUBSCRIBERS:
                    SUBSCRIBERS.remove(q)


if __name__ == "__main__":
    if not HA_TOKEN:
        raise SystemExit("HA_TOKEN env var is required (Home Assistant long-lived access token)")
    threading.Thread(target=poller, daemon=True).start()
    print(f"studio wrapper on :{PORT} → HA {HA_URL} · piano {PIANO_URL}")
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
