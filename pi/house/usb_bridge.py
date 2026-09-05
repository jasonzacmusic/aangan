#!/usr/bin/env python3
"""USB bench bridge: Board 1 sensors + door ESP32 → Studio Command API.

The house mesh still hides ESP32s from each other and from this Mac, so Wi-Fi
cannot carry live readings. Both chips are on USB. This process:

  * reads SOUND / DOOR / LEAK lines from Board 1
  * serves the same /api contract as aangan_bridge (port 8126)
  * writes COLOR / STATE / DBA / TEXT / DOOR to the door ESP32 (the bulb)

Run, then start the app with VITE_DATA_SOURCE=live pointing at 127.0.0.1:8126.
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlparse

import serial
import urllib.parse
import urllib.request

BOARD1 = os.environ.get("AANGAN_BOARD1", "/dev/cu.usbserial-0001")
# ledESP: the studio-door light board. Lives on Wi-Fi, not USB, so state is
# pushed to it over ESPHome's REST API rather than down a serial cable.
LEDESP = os.environ.get("AANGAN_LEDESP", "http://192.168.0.248")
BOARD2 = os.environ.get("AANGAN_BOARD2", "/dev/cu.usbserial-5")
PORT = int(os.environ.get("PORT", "8126"))
ANSI = re.compile(r"\x1b\[[0-9;]*m")

# Measured rest with studio AC on (Aangan live, 19 Aug 2026). Not a warning.
STUDIO_REST_DBA_AC_ON = 42.0
# Hall warning: 10 dB above rest so the compressor cannot trip the outside pair.
DEFAULT_DOOR_WARN_DBA = STUDIO_REST_DBA_AC_ON + 10.0
DOOR_WARN_HOLD_S = 8.0

STATE_COLORS = {
    "available": "#2FBF71",
    "class": "#F5A623",
    "meeting": "#F5A623",
    "audio_rec": "#E5484D",
    "video_rec": "#D93036",
    "emergency": "#7C3AED",
}

PRESET = {
    "ok": {"id": "ok", "mark": "OK", "color": "#2FBF71", "image": "/door/ok.svg",
           "tickers": ["Knock if you need me — the studio is open", "Come in. Don't lurk in the hall."]},
    "wait": {"id": "wait", "mark": "WAIT", "color": "#F5A623", "image": "/door/wait.svg",
             "tickers": ["Lesson on. Come in at your own peril", "A student is playing — enter softly or wait"]},
    "loud": {"id": "loud", "mark": "WAIT", "color": "#F5A623", "image": "/door/loud.svg",
             "tickers": ["The room is live. Hold the door.", "Someone is making a noise in here — wait"]},
    "dnd": {"id": "dnd", "mark": "DND", "color": "#E5484D", "image": "/door/dnd.svg",
            "tickers": ["Recording — do not open this door", "Absolute silence. Do not ring."]},
    "onair": {"id": "onair", "mark": "ON AIR", "color": "#D93036", "image": "/door/onair.svg",
              "tickers": ["On air. Do not cross the frame", "Cameras rolling. Wait outside."]},
    "sos": {"id": "sos", "mark": "SOS", "color": "#7C3AED", "image": "/door/sos.svg",
            "tickers": ["Emergency. Call the family before you enter", "Don't come in. Phone first."]},
}


_loud_timer: threading.Timer | None = None


def latch_loud() -> None:
    # One re-armed timer, not one per loud line — sustained loudness was
    # spawning tens of concurrent timer threads.
    global _loud_timer
    state["loud_until"] = time.time() + DOOR_WARN_HOLD_S
    if _loud_timer is not None:
        _loud_timer.cancel()
    _loud_timer = threading.Timer(DOOR_WARN_HOLD_S + 0.15, _loud_expired)
    _loud_timer.daemon = True
    _loud_timer.start()


def _loud_expired() -> None:
    publish_live()
    push_door(force=True)


def acoustic_loud() -> bool:
    if time.time() < float(state["loud_until"]):
        return True
    db = state["sound"]
    warn = float(state["door_warn_db"])
    return db is not None and float(db) >= warn


def door_preset() -> dict[str, Any]:
    st = state["studio_state"]
    door_open = state["door_g1"] == "OPEN" or state["door_g2"] == "OPEN"
    if st == "emergency":
        p = dict(PRESET["sos"])
    elif st == "video_rec":
        p = dict(PRESET["onair"])
        tickers = list(p["tickers"])
        if door_open:
            tickers = ["The studio door is open — shut it", *tickers]
        p["tickers"] = tickers
    elif st == "audio_rec":
        p = dict(PRESET["dnd"])
        tickers = list(p["tickers"])
        if door_open:
            tickers = ["The studio door is open — shut it", *tickers]
        p["tickers"] = tickers
    elif st == "class":
        p = dict(PRESET["wait"])
    elif st == "meeting":
        p = dict(PRESET["wait"])
        p["tickers"] = ["On a call. Knock, then wait", "Don't walk in mid-sentence"]
    elif acoustic_loud():
        p = dict(PRESET["loud"])
    else:
        p = dict(PRESET["ok"])
    p["tickers"] = list(p["tickers"])
    return p

lock = threading.Lock()
board2_lock = threading.Lock()
sse_lock = threading.Lock()
sse_queues: list[list[tuple[str, Any]]] = []

state: dict[str, Any] = {
    "studio_state": "available",
    "set_by": "USB bridge",
    "since": int(time.time() * 1000),
    "sound": None,
    "door_g1": None,
    "door_g2": None,
    "leak": None,
    "board1_seen": 0.0,
    "board2_ok": False,
    "db_threshold": 40.0,
    "door_warn_db": DEFAULT_DOOR_WARN_DBA,
    "loud_until": 0.0,
    "history": [],
    "displays": [
        {"id": "front-house", "name": "Front of House", "content": "door", "message": ""},
        {"id": "front-studio", "name": "Front of Studio", "content": "studio_door", "message": ""},
        {"id": "wall-ipad", "name": "Wall iPad", "content": "house", "message": ""},
    ],
}

board2: serial.Serial | None = None
last_door_push = 0.0
last_door_payload = ""


def now_ms() -> int:
    return int(time.time() * 1000)


def add_history(title: str, detail: str, severity: str = "info", kind: str = "system") -> None:
    event = {
        "id": uuid.uuid4().hex[:12],
        "type": kind,
        "title": title,
        "detail": detail,
        "ts": now_ms(),
        "severity": severity,
    }
    state["history"] = [event, *state["history"]][:40]
    emit("history", event)


def emit(name: str, payload: Any) -> None:
    with sse_lock:
        dead = []
        for q in sse_queues:
            q.append((name, payload))
            if len(q) > 200:
                dead.append(q)
        for q in dead:
            sse_queues.remove(q)


def open_serial(path: str) -> serial.Serial:
    ser = serial.Serial()
    ser.port = path
    ser.baudrate = 115200
    ser.timeout = 0.2
    ser.dtr = False
    ser.rts = False
    ser.open()
    return ser


def rooms_payload() -> list[dict[str, Any]]:
    preset = door_preset()
    color = preset["color"]
    visual = preset["id"]
    g1, g2 = state["door_g1"], state["door_g2"]
    door_open = g1 == "OPEN" or g2 == "OPEN"
    studio: dict[str, Any] = {
        "id": "music",
        "name": "Studio",
        "doorOpen": door_open,
        "presence": False,
        "tempC": None,
        "dbLevel": state["sound"],
        "signColor": color,
        "signVisual": visual,
    }
    others = [
        {"id": "entrance", "name": "Entrance", "doorOpen": False, "presence": False, "tempC": None, "signColor": color},
        {"id": "bedroom", "name": "Bedroom", "doorOpen": False, "presence": False, "tempC": None, "signColor": color},
        {"id": "kitchen", "name": "Kitchen", "doorOpen": False, "presence": False, "tempC": None, "signColor": color},
        {"id": "bathroom", "name": "Bathroom", "doorOpen": False, "presence": False, "tempC": None, "signColor": color},
    ]
    return [studio, *others]


def safety_payload() -> dict[str, bool]:
    return {
        "fire": False,
        "gas": False,
        "panic": False,
        "leakKitchen": False,
        "leakBath": False,
        "leakGeyser": False,
        "perimeter": False,
    }


def preflight_payload() -> dict[str, Any]:
    g1, g2 = state["door_g1"], state["door_g2"]
    names = []
    if g1 == "OPEN":
        names.append("Studio door · G1")
    if g2 == "OPEN":
        names.append("Studio door · G2")
    if g1 is None:
        names.append("Studio door · G1 (waiting for magnet)")
    if g2 is None:
        names.append("Studio door · G2 (waiting for magnet)")
    doors_closed = g1 == "SHUT" and g2 == "SHUT"
    db = float(state["sound"]) if state["sound"] is not None else None
    quiet = db is not None and db < float(state["db_threshold"])
    healthy = (time.time() - float(state["board1_seen"])) < 3 if state["board1_seen"] else False
    leak_ok = state["leak"] != "WET"
    ready = doors_closed and quiet and healthy and leak_ok
    return {
        "doorsClosed": doors_closed,
        "quietEnough": quiet,
        "sensorsHealthy": healthy,
        "safetyClear": leak_ok,
        "ready": ready,
        "openDoors": ["music"] if names else [],
        "openDoorNames": names,
        "dbLevel": db,
        "dbThreshold": float(state["db_threshold"]),
    }


def prep_payload() -> dict[str, Any]:
    return {"active": False, "status": "idle", "mutedDoorbell": False, "acOff": False, "fanOff": False}


def studio_state_payload() -> dict[str, Any]:
    return {"state": state["studio_state"], "setBy": state["set_by"], "since": state["since"]}


def fleet_payload() -> list[dict[str, Any]]:
    t = now_ms()
    b1 = (time.time() - float(state["board1_seen"])) < 3 if state["board1_seen"] else False
    sound = state["sound"]
    detail1 = f"USB · {sound:.1f} dBA" if sound is not None else "USB · waiting for sound"
    return [
        {"id": "this-mac", "name": "Studio Mac", "kind": "mac", "online": True, "lastSeen": t, "detail": "USB bridge · Studio Command"},
        {"id": "board-1", "name": "Studio Board 1", "kind": "other", "online": b1, "lastSeen": t, "detail": detail1},
        {
            "id": "board-door",
            "name": "Studio door bulb",
            "kind": "panel",
            "online": bool(state["board2_ok"]),
            "lastSeen": t,
            "detail": "USB · onboard LED + WS2812 puck on GPIO4",
        },
    ]


def utilities_payload() -> dict[str, Any]:
    return {
        "water": {"online": False, "sumpPct": 0, "overheadPct": 0, "pumpRunning": False, "dryRunProtected": False, "lastFillTs": 0},
        "power": {"online": False, "mainsOnline": True, "voltage": 0, "inverterPct": 0, "estimatedMinutes": 0, "surgeProtected": False},
        "lpg": {"online": False, "remainingPct": 0, "estimatedDays": 0},
        "air": {"online": False, "aqi": 0, "pm25": 0, "tempC": 0, "humidityPct": 0, "purifierOn": False},
    }


def air_payload() -> dict[str, Any]:
    return {"rooms": [], "purifiers": [], "hushed": False, "purgeUntil": None}


def piano_payload() -> dict[str, Any]:
    return {
        "online": False,
        "preset": "—",
        "cpuPct": 0,
        "tempC": 0,
        "audioDevice": "Piano Pi is not on this USB bench",
        "sampleRate": 48000,
        "bufferFrames": 0,
        "latencyMs": 0,
        "lastSeen": now_ms(),
    }


def door_lines() -> str:
    preset = door_preset()
    color = str(preset["color"]).lstrip("#")
    dba = state["sound"]
    dba_s = f"{dba:.1f}" if dba is not None else "--"
    door = "OPEN" if state["door_g1"] == "OPEN" or state["door_g2"] == "OPEN" else "SHUT"
    text = "  ·  ".join(preset["tickers"])
    return (
        f"COLOR {color}\n"
        f"STATE {state['studio_state']}\n"
        f"VISUAL {preset['id']}\n"
        f"MARK {preset['mark']}\n"
        f"DBA {dba_s}\n"
        f"TEXT {text}\n"
        f"DOOR {door}\n"
    )


_ledesp_last: str | None = None
_ledesp_ok = False


def push_ledesp(force: bool = False) -> None:
    """Send the studio state to the Wi-Fi light board.

    Best effort on purpose: the board may be unplugged or the mesh may be
    isolating clients. A failure here must never stop the bridge serving the
    app, so everything is swallowed and just flagged for /api/fleet.
    """
    global _ledesp_last, _ledesp_ok
    if not LEDESP:
        return
    want = str(state["studio_state"])
    if not force and want == _ledesp_last:
        return
    url = f"{LEDESP}/select/studio_state/set?" + urllib.parse.urlencode({"option": want})
    try:
        req = urllib.request.Request(url, method="POST")
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            _ledesp_ok = 200 <= resp.status < 300
        if _ledesp_ok:
            _ledesp_last = want
    except Exception:
        _ledesp_ok = False


def push_door(force: bool = False) -> None:
    global last_door_push, last_door_payload
    payload = door_lines()
    now = time.time()
    if not force and payload == last_door_payload and now - last_door_push < 0.25:
        return
    last_door_payload = payload
    last_door_push = now
    ser = board2
    if ser is None or not ser.is_open:
        return
    try:
        with board2_lock:
            ser.write(payload.encode("utf-8"))
        with lock:
            state["board2_ok"] = True
    except Exception:
        with lock:
            state["board2_ok"] = False


def publish_live() -> None:
    emit("rooms", rooms_payload())
    emit("preflight", {"preflight": preflight_payload(), "prep": prep_payload()})
    emit("fleet", fleet_payload())


def board1_reader() -> None:
    # This thread is the house's only sensor input. It must survive the board
    # being absent at launch AND a mid-run USB unplug/glitch — either used to
    # kill it permanently, freezing doors/sound/leak until a process restart.
    ser: serial.Serial | None = None
    buf = ""
    last_rooms = 0.0
    while True:
        if ser is None or not ser.is_open:
            try:
                ser = open_serial(BOARD1)
                buf = ""
                add_history("USB bridge", "Board 1 serial connected", "success")
            except Exception:
                time.sleep(5)
                continue
        try:
            chunk = ser.read(4096)
        except Exception:
            try:
                ser.close()
            except Exception:
                pass
            ser = None
            add_history("USB bridge", "Board 1 serial lost — retrying", "warning")
            time.sleep(2)
            continue
        if not chunk:
            continue
        buf += chunk.decode("utf-8", "replace")
        while "\n" in buf:
            raw, buf = buf.split("\n", 1)
            line = ANSI.sub("", raw).strip()
            if not line:
                continue
            changed = False
            with lock:
                state["board1_seen"] = time.time()
                m = re.search(r"SOUND ([0-9.]+) dBA", line)
                if m:
                    state["sound"] = float(m.group(1))
                    if state["sound"] >= float(state["door_warn_db"]):
                        latch_loud()
                    changed = True
                m = re.search(r"DOOR G1 (OPEN|SHUT)", line)
                if m and state["door_g1"] != m.group(1):
                    state["door_g1"] = m.group(1)
                    changed = True
                    add_history("Studio door G1", m.group(1), "warning" if m.group(1) == "OPEN" else "success")
                m = re.search(r"DOOR G2 (OPEN|SHUT)", line)
                if m and state["door_g2"] != m.group(1):
                    state["door_g2"] = m.group(1)
                    changed = True
                    add_history("Studio door G2", m.group(1), "warning" if m.group(1) == "OPEN" else "success")
                m = re.search(r"LEAK (WET|DRY)", line)
                if m and state["leak"] != m.group(1):
                    state["leak"] = m.group(1)
                    changed = True
                    add_history("Studio sink", m.group(1), "critical" if m.group(1) == "WET" else "success", "safety")
            if changed:
                now = time.time()
                if now - last_rooms >= 0.08:
                    last_rooms = now
                    publish_live()
                    push_door()


def set_studio_state(name: str, set_by: str) -> None:
    if name not in STATE_COLORS:
        raise ValueError(name)
    with lock:
        state["studio_state"] = name
        state["set_by"] = set_by
        state["since"] = now_ms()
        add_history(f"Studio → {name}", f"{set_by} set the house", "critical" if name == "emergency" else "info", "state")
    emit("state", studio_state_payload())
    publish_live()
    push_door(force=True)
    threading.Thread(target=push_ledesp, kwargs={"force": True}, daemon=True).start()


class Handler(BaseHTTPRequestHandler):
    # An idle or half-dead connection frees its thread after this instead of
    # holding it for the life of the process.
    timeout = 75

    def log_message(self, fmt: str, *args: Any) -> None:
        return

    def _cors(self) -> None:
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def _json(self, code: int, body: Any) -> None:
        raw = b"" if body is None and code == 204 else json.dumps(body).encode()
        self.send_response(code)
        self._cors()
        if code != 204:
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        if code != 204:
            self.wfile.write(raw)

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0:
            return {}
        return json.loads(self.rfile.read(length).decode() or "{}")

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802
        path = urlparse(self.path).path
        with lock:
            snapshot = {
                "state": studio_state_payload(),
                "rooms": rooms_payload(),
                "safety": safety_payload(),
                "preflight": preflight_payload(),
                "prep": prep_payload(),
                "history": list(state["history"]),
                "displays": list(state["displays"]),
                "fleet": fleet_payload(),
                "utilities": utilities_payload(),
                "air": air_payload(),
                "piano": piano_payload(),
                "board2": bool(state["board2_ok"]),
                "doorSign": door_preset(),
            }
        mapping = {
            "/api/health": {"ok": True, **{k: snapshot[k] for k in ("board2",)}, "board1": snapshot["preflight"]["sensorsHealthy"]},
            "/api/state": snapshot["state"],
            "/api/rooms": snapshot["rooms"],
            "/api/safety": snapshot["safety"],
            "/api/preflight": snapshot["preflight"],
            "/api/preflight/status": snapshot["prep"],
            "/api/history": snapshot["history"],
            "/api/displays": snapshot["displays"],
            "/api/fleet": snapshot["fleet"],
            "/api/utilities": snapshot["utilities"],
            "/api/air": snapshot["air"],
            "/api/piano": snapshot["piano"],
            "/api/sos": None,
            "/api/delivery": None,
            "/api/door-sign": snapshot["doorSign"],
        }
        if path == "/api/stream":
            self._sse()
            return
        if path in ("/api/doorbell",):
            self.send_response(404)
            self._cors()
            self.end_headers()
            return
        if path in mapping:
            self._json(200, mapping[path])
            return
        self._json(404, {"error": path})

    def do_POST(self) -> None:  # noqa: N802
        try:
            self._do_post()
        except (BrokenPipeError, ConnectionResetError):
            return
        except (ValueError, KeyError, TypeError) as exc:
            # Malformed JSON or an unknown state must be a 400, not a
            # connection reset with a stderr traceback.
            self._json(400, {"error": str(exc) or exc.__class__.__name__})
        except Exception as exc:
            self._json(500, {"error": exc.__class__.__name__})

    def _do_post(self) -> None:
        path = urlparse(self.path).path
        body = self._read_json()
        if path == "/api/state":
            set_studio_state(str(body.get("state")), "Jason Zac")
            self._json(200, studio_state_payload())
            return
        if path == "/api/scene":
            set_studio_state(str(body.get("state")), str(body.get("name") or "scene"))
            self._json(200, studio_state_payload())
            return
        if path == "/api/panic":
            set_studio_state("emergency", "panic")
            self._json(200, {"ok": True})
            return
        if path == "/api/tone":
            self._json(200, {"ok": True})
            return
        if path == "/api/settings/db-threshold":
            with lock:
                state["db_threshold"] = float(body.get("value", 40))
            publish_live()
            self._json(200, {"ok": True})
            return
        if path == "/api/settings/door-warn-db":
            with lock:
                state["door_warn_db"] = float(body.get("value", DEFAULT_DOOR_WARN_DBA))
            publish_live()
            push_door(force=True)
            self._json(200, {"ok": True})
            return
        if path == "/api/door-warn-test":
            with lock:
                latch_loud()
            publish_live()
            push_door(force=True)
            self._json(200, {"ok": True, "holdSeconds": DOOR_WARN_HOLD_S, "preset": door_preset()["id"]})
            return
        if path == "/api/displays/update":
            patch = body.get("patch") or {}
            ident = body.get("id")
            with lock:
                for d in state["displays"]:
                    if d["id"] == ident:
                        d.update({k: patch[k] for k in ("content", "message", "name") if k in patch})
                displays = list(state["displays"])
            emit("displays", displays)
            self._json(200, displays)
            return
        if path == "/api/displays/add":
            ident = f"panel-{uuid.uuid4().hex[:6]}"
            with lock:
                state["displays"].append({"id": ident, "name": str(body.get("name") or "New display"), "content": "door", "message": ""})
                displays = list(state["displays"])
            emit("displays", displays)
            self._json(200, displays)
            return
        if path == "/api/displays/remove":
            ident = body.get("id")
            with lock:
                state["displays"] = [d for d in state["displays"] if d["id"] != ident]
                displays = list(state["displays"])
            emit("displays", displays)
            self._json(200, displays)
            return
        if path in ("/api/sos/clear", "/api/delivery/clear", "/api/preflight/prepare", "/api/preflight/restore"):
            self._json(200, {"ok": True} if "clear" in path else prep_payload())
            return
        self._json(404, {"error": path})

    def _sse(self) -> None:
        q: list[tuple[str, Any]] = []
        with sse_lock:
            sse_queues.append(q)
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.end_headers()
        with lock:
            hello = [
                ("state", studio_state_payload()),
                ("rooms", rooms_payload()),
                ("safety", safety_payload()),
                ("preflight", {"preflight": preflight_payload(), "prep": prep_payload()}),
                ("displays", list(state["displays"])),
                ("fleet", fleet_payload()),
            ]
        try:
            for name, payload in hello:
                self._sse_write(name, payload)
            last_beat = time.monotonic()
            while True:
                time.sleep(0.05)
                batch: list[tuple[str, Any]] = []
                with sse_lock:
                    # emit() drops a backed-up queue; without this check the
                    # orphaned loop spun at 20 Hz forever with no way to
                    # notice the client was gone.
                    if q not in sse_queues:
                        break
                    if q:
                        batch, q[:] = q[:], []
                for name, payload in batch:
                    self._sse_write(name, payload)
                if time.monotonic() - last_beat > 15:
                    # Keepalive doubles as dead-client detection: writing to a
                    # closed socket raises and ends this thread.
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
                    last_beat = time.monotonic()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with sse_lock:
                if q in sse_queues:
                    sse_queues.remove(q)

    def _sse_write(self, name: str, payload: Any) -> None:
        data = json.dumps(payload)
        self.wfile.write(f"event: {name}\ndata: {data}\n\n".encode())
        self.wfile.flush()


def device_resync() -> None:
    """Every 30 s: retry a failed ledESP push (forced every 5 min so a rebooted
    bulb re-learns the state) and reopen the door ESP32 serial if it dropped —
    an unplug/replug used to need a full process restart."""
    global board2
    beat = 0
    while True:
        time.sleep(30)
        beat += 1
        try:
            push_ledesp(force=(beat % 10 == 0))
        except Exception:
            pass
        if board2 is None or not board2.is_open or not state["board2_ok"]:
            try:
                if board2 is not None:
                    try:
                        board2.close()
                    except Exception:
                        pass
                board2 = open_serial(BOARD2)
                with lock:
                    state["board2_ok"] = True
                add_history("USB bridge", "Door ESP32 USB reconnected", "success")
                time.sleep(1.2)
                push_door(force=True)
            except Exception:
                pass


def main() -> None:
    global board2
    print(f"Board 1 {BOARD1}", flush=True)
    print(f"Door    {BOARD2}", flush=True)
    threading.Thread(target=board1_reader, daemon=True).start()
    threading.Thread(target=device_resync, daemon=True).start()
    try:
        board2 = open_serial(BOARD2)
        state["board2_ok"] = True
        print("Door ESP32 USB open", flush=True)
        time.sleep(1.2)
        push_door(force=True)
    except Exception as exc:
        print(f"Door ESP32 USB not open yet: {exc}", flush=True)
    add_history("USB bridge", "Board 1 live into Studio Command", "success")
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    print(f"Studio Command API http://127.0.0.1:{PORT}/api/state", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
