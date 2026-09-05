#!/usr/bin/env python3
"""Aangan Bridge: Home Assistant REST/SSE adapter and PWA host.

The preferred deployment is the Home Assistant app in ``/aangan_bridge``. It
injects ``SUPERVISOR_TOKEN`` and serves the live PWA and API together on port
8126. The same file can run on ordinary Linux with ``HA_TOKEN``.

Environment:
  PORT                 HTTP port (default 8126)
  HA_URL               default http://127.0.0.1:8123
  HA_TOKEN             Home Assistant token (or SUPERVISOR_TOKEN in an app)
  PIANO_URL            default http://piano.local:8951
  STATE_FILE           persistent bridge state (default /data/aangan-state.json)
  WEB_ROOT             built PWA directory; empty disables static hosting
  ALLOWED_ORIGINS      comma-separated cross-origin web origins
  ALLOW_COMMISSIONING  true enables /api/safety/demo during supervised tests

The JSON contract is defined by ``src/api/types.ts`` and
``src/api/liveAdapter.ts``. Safety devices remain standalone; this bridge is a
monitoring and control overlay, never the primary alarm layer.
"""

from __future__ import annotations

import datetime as dt
import json
import mimetypes
import os
import posixpath
import socket
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any


PORT = int(os.environ.get("PORT", "8126"))
HA_URL = os.environ.get("HA_URL", "http://127.0.0.1:8123").rstrip("/")
HA_TOKEN = os.environ.get("HA_TOKEN") or os.environ.get("SUPERVISOR_TOKEN", "")
PIANO_URL = os.environ.get("PIANO_URL", "http://piano.local:8951").rstrip("/")
STATE_FILE = os.environ.get("STATE_FILE", "/data/aangan-state.json")
WEB_ROOT = Path(os.environ["WEB_ROOT"]).resolve() if os.environ.get("WEB_ROOT") else None
ALLOW_COMMISSIONING = os.environ.get("ALLOW_COMMISSIONING", "false").lower() in {"1", "true", "yes", "on"}
ALLOWED_ORIGINS = {item.strip() for item in os.environ.get("ALLOWED_ORIGINS", "").split(",") if item.strip()}

VALID_STATES = {"available", "class", "meeting", "audio_rec", "video_rec", "emergency"}

# Change entity IDs here after ESPHome adoption; page code never changes.
ENTITY: dict[str, Any] = {
    "state": "input_select.studio_state",
    "set_by": "input_text.studio_state_set_by",
    "db": "sensor.studio_sound_level",
    "db_threshold": "input_number.studio_db_threshold",
    "ready": "binary_sensor.studio_ready",
    "doors_ok": "binary_sensor.studio_doors_ok",
    "quiet": "binary_sensor.studio_quiet",
    "healthy": "binary_sensor.studio_sensors_healthy",
    "safety_clear": "binary_sensor.house_safety_clear",
    "camera": "camera.entrance",
    "silence": {
        "doorbell": "switch.doorbell_chime",
        "ac": "climate.studio_ac",
        "fan": "fan.studio_fan",
    },
    "doors": [
        ("Studio door · leaf A", "music", "binary_sensor.studio_door_leaf_a"),
        ("Studio door · leaf B", "music", "binary_sensor.studio_door_leaf_b"),
        ("Teaching door · leaf A", "music", "binary_sensor.teaching_door_leaf_a"),
        ("Teaching door · leaf B", "music", "binary_sensor.teaching_door_leaf_b"),
        ("Main entrance", "entrance", "binary_sensor.main_door"),
    ],
    "rooms": {
        "entrance": {
            "name": "Entrance",
            "doors": ["binary_sensor.main_door"],
            "presence": ["binary_sensor.entrance_pir"],
            "temp": None,
        },
        "music": {
            "name": "Music Room",
            "doors": ["binary_sensor.studio_door_leaf_a", "binary_sensor.studio_door_leaf_b"],
            "presence": ["binary_sensor.studio_presence"],
            "temp": "sensor.studio_air_temperature",
        },
        "bedroom": {
            "name": "Bedroom",
            "doors": [],
            "presence": ["binary_sensor.bedroom_pir"],
            "temp": "sensor.bedroom_air_temperature",
        },
        "kitchen": {
            "name": "Kitchen",
            "doors": [],
            "presence": ["binary_sensor.kitchen_pir"],
            "temp": "sensor.kitchen_air_temperature",
        },
        "bathroom": {
            "name": "Bathroom",
            "doors": [],
            "presence": ["binary_sensor.bathroom_pir"],
            "temp": "sensor.house_pulse_temperature",
        },
    },
    "safety": {
        "fire": ["binary_sensor.house_fire_any"],
        "gas": ["binary_sensor.lpg_detector_alarm_contact"],
        "panic": ["binary_sensor.panic_loop_broken"],
        "leakKitchen": ["binary_sensor.kitchen_sink_leak", "binary_sensor.house_sink_leak"],
        "leakBath": ["binary_sensor.bathroom_1_leak", "binary_sensor.bathroom_2_leak"],
        "leakGeyser": ["binary_sensor.geyser_overflow_leak"],
        "perimeter": [
            "binary_sensor.main_door_vibration",
            "binary_sensor.balcony_vibration",
            "binary_sensor.studio_window_vibration",
            "binary_sensor.house_window_vibration",
        ],
    },
    "utilities": {
        "sump": "sensor.sump_level",
        "overhead": "sensor.overhead_tank_level",
        "pump": "switch.water_pump",
        "dry_run": "binary_sensor.water_pump_dry_run_protected",
        "last_fill": "sensor.water_last_fill",
        "mains": "binary_sensor.mains_online",
        "voltage": "sensor.mains_voltage",
        "inverter": "sensor.inverter_battery",
        "runtime": "sensor.inverter_runtime",
        "surge": "binary_sensor.surge_protection",
        "lpg": "sensor.lpg_remaining",
        "lpg_days": "sensor.lpg_days_remaining",
        "aqi": "sensor.studio_air_quality_index",
        "pm25": "sensor.studio_air_pm2_5",
        "temp": "sensor.studio_air_temperature",
        "humidity": "sensor.studio_air_humidity",
        "purifier": "fan.dyson_purifier",
    },
    "air_rooms": {
        "studio": {
            "name": "Music Room",
            "pm25": "sensor.studio_air_pm2_5",
            "co2": "sensor.studio_air_co2",
            "voc": "sensor.studio_air_voc_index",
            "temp": "sensor.studio_air_temperature",
            "humidity": "sensor.studio_air_humidity",
            "status": "binary_sensor.studio_air_node_online",
        },
        "kitchen": {
            "name": "Kitchen",
            "pm25": "sensor.kitchen_air_pm2_5",
            "co2": "sensor.kitchen_air_co2",
            "voc": "sensor.kitchen_air_voc_index",
            "temp": "sensor.kitchen_air_temperature",
            "humidity": "sensor.kitchen_air_humidity",
            "status": "binary_sensor.kitchen_air_node_online",
        },
        "bedroom": {
            "name": "Bedroom",
            "pm25": "sensor.bedroom_air_pm2_5",
            "co2": "sensor.bedroom_air_co2",
            "voc": "sensor.bedroom_air_voc_index",
            "temp": "sensor.bedroom_air_temperature",
            "humidity": "sensor.bedroom_air_humidity",
            "status": "binary_sensor.bedroom_air_node_online",
        },
    },
    "purifiers": {
        "dyson-studio": {"name": "Studio purifier", "brand": "Dyson", "roomId": "studio", "entity": "fan.dyson_purifier", "filter": "sensor.dyson_purifier_filter_life"},
        "xiaomi-bedroom": {"name": "Bedroom purifier", "brand": "Xiaomi", "roomId": "bedroom", "entity": "fan.xiaomi_purifier", "filter": "sensor.xiaomi_purifier_filter_life"},
    },
}

DEFAULT_DISPLAYS = [
    {"id": "front-house", "name": "Front of House", "content": "door", "message": ""},
    {"id": "front-studio", "name": "Front of Studio", "content": "state", "message": ""},
    {"id": "wall-ipad", "name": "Wall iPad", "content": "house", "message": ""},
]

LOCK = threading.RLock()
COND = threading.Condition()
SUBSCRIBERS: list[list[str]] = []
CACHE_LOCK = threading.Lock()
HA_CACHE: dict[str, dict[str, Any]] = {}
HA_CACHE_AT = 0.0
PREP: dict[str, Any] = {"active": False, "status": "idle", "mutedDoorbell": False, "acOff": False, "fanOff": False}
PURGE_UNTIL: int | None = None


def ha(path: str, method: str = "GET", body: Any = None, *, raw: bool = False) -> Any:
    """Call Home Assistant; raise so callers never mistake failure for safety."""
    request = urllib.request.Request(
        f"{HA_URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        payload = response.read()
        if raw:
            return payload, response.headers.get("Content-Type", "application/octet-stream")
        return json.loads(payload or b"null")


def invalidate_cache() -> None:
    global HA_CACHE_AT
    HA_CACHE_AT = 0.0


def current_states(force: bool = False) -> dict[str, dict[str, Any]]:
    global HA_CACHE, HA_CACHE_AT
    with CACHE_LOCK:
        if not force and HA_CACHE and time.monotonic() - HA_CACHE_AT < 1.5:
            return HA_CACHE
        states = ha("/api/states")
        HA_CACHE = {item["entity_id"]: item for item in states}
        HA_CACHE_AT = time.monotonic()
        return HA_CACHE


def entity(states: dict[str, dict[str, Any]], entity_id: str | None) -> dict[str, Any] | None:
    return states.get(entity_id) if entity_id else None


def entity_state(states: dict[str, dict[str, Any]], entity_id: str | None, default: Any = None) -> Any:
    item = entity(states, entity_id)
    if not item or item.get("state") in {None, "unknown", "unavailable"}:
        return default
    return item.get("state", default)


def available(states: dict[str, dict[str, Any]], entity_id: str | None) -> bool:
    item = entity(states, entity_id)
    return bool(item and item.get("state") not in {None, "unknown", "unavailable"})


def is_on(states: dict[str, dict[str, Any]], entity_id: str | None) -> bool:
    return entity_state(states, entity_id) == "on"


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_int(value: Any, default: int = 0) -> int:
    return int(round(as_float(value, float(default))))


def sensor_float(states: dict[str, dict[str, Any]], entity_id: str | None) -> float | None:
    if not available(states, entity_id):
        return None
    raw = entity_state(states, entity_id)
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def epoch_ms(value: Any, default: int = 0) -> int:
    if isinstance(value, (int, float)):
        return int(value if value > 10_000_000_000 else value * 1000)
    if not value:
        return default
    try:
        parsed = dt.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return int(parsed.timestamp() * 1000)
    except ValueError:
        return default


def call_service(domain: str, service: str, data: dict[str, Any]) -> Any:
    result = ha(f"/api/services/{domain}/{service}", "POST", data)
    invalidate_cache()
    return result


class Store:
    """Small persisted bridge state not owned by Home Assistant."""

    def __init__(self, state_file: str = STATE_FILE):
        self.state_file = state_file
        self.displays = [dict(item) for item in DEFAULT_DISPLAYS]
        self.delivery: dict[str, Any] | None = None
        self.sos: dict[str, Any] | None = None
        self.history: list[dict[str, Any]] = []
        self.seq = 0
        try:
            with open(self.state_file, encoding="utf-8") as file:
                saved = json.load(file)
            self.displays = saved.get("displays") or self.displays
            self.delivery = saved.get("delivery")
            self.sos = saved.get("sos")
            self.history = saved.get("history") or []
        except (OSError, json.JSONDecodeError, TypeError):
            pass

    def save(self) -> None:
        directory = os.path.dirname(self.state_file) or "."
        os.makedirs(directory, exist_ok=True)
        temporary = self.state_file + ".tmp"
        with open(temporary, "w", encoding="utf-8") as file:
            json.dump({"displays": self.displays, "delivery": self.delivery, "sos": self.sos, "history": self.history}, file)
        os.replace(temporary, self.state_file)

    def add_history(self, type_: str, title: str, detail: str, severity: str = "info") -> dict[str, Any]:
        with LOCK:
            self.seq += 1
            event = {
                "id": f"bridge-{int(time.time() * 1000)}-{self.seq}",
                "type": type_,
                "title": title,
                "detail": detail,
                "ts": int(time.time() * 1000),
                "severity": severity,
            }
            self.history = [event] + self.history[:39]
            self.save()
        broadcast("history", event)
        return event


STORE = Store()


def broadcast(event: str, payload: Any) -> None:
    frame = f"event: {event}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n"
    with COND:
        for queue in SUBSCRIBERS:
            queue.append(frame)
            # A stalled client's queue must not grow without bound while its
            # socket times out; it will resync from REST on reconnect anyway.
            if len(queue) > 200:
                del queue[: len(queue) - 200]
        COND.notify_all()


def state_info(states: dict[str, dict[str, Any]]) -> dict[str, Any]:
    item = entity(states, ENTITY["state"])
    state = entity_state(states, ENTITY["state"], "available")
    if state not in VALID_STATES:
        state = "available"
    return {
        "state": state,
        "setBy": entity_state(states, ENTITY["set_by"], "Home Assistant"),
        "since": epoch_ms(item.get("last_changed") if item else None, int(time.time() * 1000)),
    }


def rooms_payload(states: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    colors = {"available": "#2FBF71", "class": "#F5A623", "meeting": "#F5A623", "audio_rec": "#E5484D", "video_rec": "#D93036", "emergency": "#7C3AED"}
    sign = colors.get(state_info(states)["state"], "#2FBF71")
    rooms = []
    for room_id, config in ENTITY["rooms"].items():
        temp_id = config["temp"]
        room = {
            "id": room_id,
            "name": config["name"],
            "doorOpen": any(is_on(states, item) for item in config["doors"]),
            "presence": any(is_on(states, item) for item in config["presence"]),
            "tempC": as_float(entity_state(states, temp_id)) if available(states, temp_id) else None,
            "signColor": sign,
        }
        if room_id == "music":
            room["dbLevel"] = sensor_float(states, ENTITY["db"])
        rooms.append(room)
    return rooms


def preflight_payload(states: dict[str, dict[str, Any]]) -> dict[str, Any]:
    open_inputs = [(name, room) for name, room, entity_id in ENTITY["doors"][:4] if is_on(states, entity_id)]
    open_rooms = list(dict.fromkeys(room for _, room in open_inputs))
    return {
        "doorsClosed": is_on(states, ENTITY["doors_ok"]),
        "quietEnough": is_on(states, ENTITY["quiet"]),
        "sensorsHealthy": is_on(states, ENTITY["healthy"]),
        "safetyClear": is_on(states, ENTITY["safety_clear"]),
        "ready": is_on(states, ENTITY["ready"]),
        "openDoors": open_rooms,
        "openDoorNames": [name for name, _ in open_inputs],
        "dbLevel": sensor_float(states, ENTITY["db"]),
        "dbThreshold": as_float(entity_state(states, ENTITY["db_threshold"]), 40),
    }


def safety_payload(states: dict[str, dict[str, Any]]) -> dict[str, bool]:
    return {key: any(is_on(states, item) for item in entity_ids) for key, entity_ids in ENTITY["safety"].items()}


def prep_state() -> dict[str, Any]:
    return dict(PREP)


def piano_payload() -> dict[str, Any]:
    try:
        with urllib.request.urlopen(f"{PIANO_URL}/status", timeout=2) as response:
            return json.loads(response.read())
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return {"online": False, "preset": "—", "cpuPct": 0, "tempC": 0, "audioDevice": "Piano Pi unavailable", "sampleRate": 48000, "bufferFrames": 192, "latencyMs": 4, "lastSeen": 0, "tally": False}


def utilities_payload(states: dict[str, dict[str, Any]]) -> dict[str, Any]:
    item = ENTITY["utilities"]
    water_online = available(states, item["sump"]) or available(states, item["overhead"])
    power_online = available(states, item["voltage"]) or available(states, item["inverter"])
    lpg_online = available(states, item["lpg"])
    air_online = available(states, item["pm25"]) or available(states, item["aqi"])
    return {
        "water": {
            "online": water_online,
            "sumpPct": as_float(entity_state(states, item["sump"]), 0),
            "overheadPct": as_float(entity_state(states, item["overhead"]), 0),
            "pumpRunning": is_on(states, item["pump"]),
            "dryRunProtected": is_on(states, item["dry_run"]),
            "lastFillTs": epoch_ms(entity_state(states, item["last_fill"]), 0),
        },
        "power": {
            "online": power_online,
            "mainsOnline": is_on(states, item["mains"]),
            "voltage": as_float(entity_state(states, item["voltage"]), 0),
            "inverterPct": as_float(entity_state(states, item["inverter"]), 0),
            "estimatedMinutes": as_int(entity_state(states, item["runtime"]), 0),
            "surgeProtected": is_on(states, item["surge"]),
        },
        "lpg": {
            "online": lpg_online,
            "remainingPct": as_float(entity_state(states, item["lpg"]), 0),
            "estimatedDays": as_int(entity_state(states, item["lpg_days"]), 0),
        },
        "air": {
            "online": air_online,
            "aqi": as_int(entity_state(states, item["aqi"]), 0),
            "pm25": as_float(entity_state(states, item["pm25"]), 0),
            "tempC": as_float(entity_state(states, item["temp"]), 0),
            "humidityPct": as_float(entity_state(states, item["humidity"]), 0),
            "purifierOn": is_on(states, item["purifier"]),
        },
    }


def purifier_mode(states: dict[str, dict[str, Any]], entity_id: str) -> str:
    item = entity(states, entity_id)
    if not item or item.get("state") in {"off", "unavailable", "unknown"}:
        return "off"
    preset = str(item.get("attributes", {}).get("preset_mode", "")).lower()
    percentage = as_float(item.get("attributes", {}).get("percentage"), 50)
    if "auto" in preset:
        return "auto"
    if percentage <= 30:
        return "silent"
    if percentage >= 80:
        return "max"
    return "auto"


def air_payload(states: dict[str, dict[str, Any]]) -> dict[str, Any]:
    rooms = []
    for room_id, config in ENTITY["air_rooms"].items():
        online = is_on(states, config["status"]) or available(states, config["co2"])
        rooms.append({
            "id": room_id,
            "name": config["name"],
            "online": online,
            "pm25": as_float(entity_state(states, config["pm25"]), 0),
            "co2": as_int(entity_state(states, config["co2"]), 0),
            "vocIndex": as_int(entity_state(states, config["voc"]), 0),
            "tempC": as_float(entity_state(states, config["temp"]), 0),
            "humidityPct": as_float(entity_state(states, config["humidity"]), 0),
        })
    purifiers = []
    for purifier_id, config in ENTITY["purifiers"].items():
        purifiers.append({
            "id": purifier_id,
            "name": config["name"],
            "brand": config["brand"],
            "roomId": config["roomId"],
            "online": available(states, config["entity"]),
            "mode": purifier_mode(states, config["entity"]),
            "filterPct": as_float(entity_state(states, config["filter"]), 0),
        })
    state = state_info(states)["state"]
    return {"rooms": rooms, "purifiers": purifiers, "hushed": state in {"audio_rec", "video_rec"}, "purgeUntil": PURGE_UNTIL}


def fleet_payload(states: dict[str, dict[str, Any]], piano: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    now = int(time.time() * 1000)
    piano = piano or piano_payload()
    items = [
        {"id": "house-pi", "name": "House Pi", "kind": "pi", "online": True, "lastSeen": now, "detail": "Aangan Bridge · Home Assistant connected"},
        {"id": "piano-pi", "name": "Piano Pi", "kind": "pi", "online": bool(piano.get("online")), "lastSeen": int(piano.get("lastSeen") or 0), "detail": piano.get("preset") or "Pianoteq unavailable"},
    ]
    try:
        configured = json.loads(os.environ.get("FLEET_TARGETS", "[]"))
    except json.JSONDecodeError:
        configured = []
    for target in configured:
        online = False
        try:
            with socket.create_connection((target["host"], int(target.get("port", 80))), timeout=0.35):
                online = True
        except (OSError, KeyError, ValueError):
            pass
        items.append({"id": str(target.get("id", target.get("host", "device"))), "name": str(target.get("name", target.get("host", "Device"))), "kind": str(target.get("kind", "other")), "online": online, "lastSeen": now if online else 0, "detail": str(target.get("detail", f"{target.get('host', '')}:{target.get('port', 80)}"))})
    return items


def expire_time_limited_state() -> None:
    global PURGE_UNTIL
    now = int(time.time() * 1000)
    with LOCK:
        if STORE.delivery and STORE.delivery.get("active") and STORE.delivery.get("expiresAt", 0) <= now:
            STORE.delivery = None
            STORE.save()
            broadcast("delivery", None)
        if PURGE_UNTIL and PURGE_UNTIL <= now:
            # Restore the fans FIRST, clear the flag only on success. Clearing
            # first meant one unreachable-HA moment left purifiers at 100%
            # forever with the UI showing the purge as over; now the poller
            # retries every cycle until the fans actually come down.
            try:
                states = current_states(True)
                for config in ENTITY["purifiers"].values():
                    if available(states, config["entity"]):
                        call_service("fan", "set_percentage", {"entity_id": config["entity"], "percentage": 50})
                PURGE_UNTIL = None
            except Exception:
                pass


def poller() -> None:
    last: dict[str, Any] = {}
    while True:
        try:
            states = current_states(True)
            piano = piano_payload()
            snapshot = {
                "state": state_info(states),
                "rooms": rooms_payload(states),
                "safety": safety_payload(states),
                "utilities": utilities_payload(states),
                "piano": piano,
                "fleet": fleet_payload(states, piano),
                "air": air_payload(states),
                "preflight": {"preflight": preflight_payload(states), "prep": prep_state()},
            }
            for key, value in snapshot.items():
                if last.get(key) != value:
                    broadcast(key, value)
                    last[key] = value
            expire_time_limited_state()
        except Exception as error:
            # Nothing in this handler may raise: this thread IS the bridge's
            # heartbeat, and a failed history write (full/read-only SD card)
            # once killed it silently — frozen SSE forever, REST still up.
            if last.get("bridge_error") != error.__class__.__name__:
                last["bridge_error"] = error.__class__.__name__
                try:
                    STORE.add_history("system", "Home Assistant unavailable", error.__class__.__name__, "warning")
                except Exception:
                    pass
        else:
            last.pop("bridge_error", None)
        time.sleep(2)


def clean_text(value: Any, limit: int) -> str:
    return " ".join(str(value or "").split())[:limit]


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    # Socket timeout for every connection: a client that connects and sends
    # nothing (or stops reading its SSE stream) releases its thread in about a
    # minute instead of holding it for the TCP retransmission eternity.
    timeout = 75

    def log_message(self, format_: str, *args: Any) -> None:
        if os.environ.get("HTTP_LOG", "false").lower() == "true":
            super().log_message(format_, *args)

    def allowed_origin(self) -> str | None:
        origin = self.headers.get("Origin")
        if not origin:
            return None
        try:
            same_origin = urllib.parse.urlsplit(origin).netloc == self.headers.get("Host")
        except ValueError:
            same_origin = False
        return origin if same_origin or "*" in ALLOWED_ORIGINS or origin in ALLOWED_ORIGINS else None

    def add_cors(self) -> None:
        origin = self.allowed_origin()
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def send_json(self, payload: Any, code: int = 200) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.add_cors()
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, code: int, message: str) -> None:
        self.send_json({"error": message}, code)

    def do_OPTIONS(self) -> None:
        if self.headers.get("Origin") and not self.allowed_origin():
            return self.send_error_json(403, "origin not allowed")
        self.send_response(204)
        self.add_cors()
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Max-Age", "600")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def read_body(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length") or 0)
        if length > 32_768:
            raise ValueError("request body too large")
        try:
            value = json.loads(self.rfile.read(length) or b"{}")
        except json.JSONDecodeError as error:
            raise ValueError("invalid JSON") from error
        if not isinstance(value, dict):
            raise ValueError("JSON object required")
        return value

    def do_GET(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        try:
            states = None if path in {"/api/piano", "/api/delivery", "/api/displays", "/api/sos", "/api/history", "/api/stream", "/api/health", "/api/doorbell.jpg", "/api/preflight/status"} else current_states()
            if path == "/api/health":
                # Health must answer 200 even while Home Assistant restarts —
                # a watchdog probing this would otherwise bounce a healthy
                # bridge during every HA restart.
                try:
                    ha_up = bool(current_states())
                except Exception:
                    ha_up = False
                return self.send_json({"ok": True, "homeAssistant": ha_up, "commissioning": ALLOW_COMMISSIONING, "version": "1.4.0"})
            if path == "/api/state":
                return self.send_json(state_info(states))
            if path == "/api/rooms":
                return self.send_json(rooms_payload(states))
            if path == "/api/preflight":
                return self.send_json(preflight_payload(states))
            if path == "/api/preflight/status":
                return self.send_json(prep_state())
            if path == "/api/safety":
                return self.send_json(safety_payload(states))
            if path == "/api/doorbell":
                camera = entity(current_states(), ENTITY["camera"])
                timestamp = epoch_ms(camera.get("last_updated") if camera else None, int(time.time() * 1000))
                return self.send_json({"snapshotUrl": f"/api/doorbell.jpg?ts={timestamp}", "ts": timestamp})
            if path == "/api/doorbell.jpg":
                return self.send_doorbell()
            if path == "/api/history":
                return self.send_json(STORE.history)
            if path == "/api/utilities":
                return self.send_json(utilities_payload(states))
            if path == "/api/piano":
                return self.send_json(piano_payload())
            if path == "/api/fleet":
                states = current_states()
                return self.send_json(fleet_payload(states))
            if path == "/api/air":
                return self.send_json(air_payload(states))
            if path == "/api/sos":
                return self.send_json(STORE.sos)
            if path == "/api/delivery":
                expire_time_limited_state()
                return self.send_json(STORE.delivery)
            if path == "/api/displays":
                return self.send_json(STORE.displays)
            if path == "/api/stream":
                return self.stream()
            if not path.startswith("/api/") and WEB_ROOT:
                return self.send_static(path)
            return self.send_error_json(404, "not found")
        except (BrokenPipeError, ConnectionResetError):
            return
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            return self.send_error_json(503, f"Home Assistant unavailable ({error.__class__.__name__})")
        except Exception as error:
            return self.send_error_json(500, f"bridge error ({error.__class__.__name__})")

    def do_POST(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        if self.headers.get("Origin") and not self.allowed_origin():
            return self.send_error_json(403, "origin not allowed")
        try:
            body = self.read_body()
            skip_ha = path in {
                "/api/sos",
                "/api/sos/clear",
                "/api/tone",
                "/api/piano/cue",
                "/api/delivery",
                "/api/delivery/clear",
                "/api/displays/update",
                "/api/displays/add",
                "/api/displays/remove",
            }
            states = {} if skip_ha else current_states()
            if path == "/api/state":
                target = body.get("state")
                if target not in VALID_STATES:
                    return self.send_error_json(400, "invalid studio state")
                call_service("input_select", "select_option", {"entity_id": ENTITY["state"], "option": target})
                call_service("input_text", "set_value", {"entity_id": ENTITY["set_by"], "value": "Aangan app"})
                states = current_states(True)
                info = state_info(states)
                STORE.add_history("state", f"Studio → {target}", "Set from Aangan")
                broadcast("state", info)
                return self.send_json(info)
            if path == "/api/scene":
                target = body.get("state")
                if target not in VALID_STATES:
                    return self.send_error_json(400, "invalid scene state")
                call_service("input_select", "select_option", {"entity_id": ENTITY["state"], "option": target})
                call_service("input_text", "set_value", {"entity_id": ENTITY["set_by"], "value": f"Scene · {clean_text(body.get('name'), 48)}"})
                info = state_info(current_states(True))
                STORE.add_history("state", f"Scene · {clean_text(body.get('name'), 48) or 'Unnamed'}", f"Studio → {target}")
                broadcast("state", info)
                return self.send_json(info)
            if path == "/api/panic":
                call_service("input_select", "select_option", {"entity_id": ENTITY["state"], "option": "emergency"})
                STORE.add_history("safety", "Emergency triggered", "Raised from Aangan", "critical")
                broadcast("state", state_info(current_states(True)))
                return self.send_json({"ok": True})
            if path == "/api/settings/db-threshold":
                value = max(30.0, min(90.0, as_float(body.get("value"), 40)))
                call_service("input_number", "set_value", {"entity_id": ENTITY["db_threshold"], "value": value})
                return self.send_json({"ok": True})
            if path == "/api/preflight/prepare":
                PREP.update({"active": True, "status": "preparing", "mutedDoorbell": False, "acOff": False, "fanOff": False, "startedAt": int(time.time() * 1000)})
                missing = [name for name, entity_id in ENTITY["silence"].items() if not available(states, entity_id)]
                if missing:
                    PREP.update({"active": False, "status": "idle"})
                    return self.send_error_json(409, f"studio devices not configured: {', '.join(missing)}")
                try:
                    call_service("script", "turn_on", {"entity_id": "script.studio_silence_room"})
                except urllib.error.HTTPError:
                    PREP.update({"active": False, "status": "idle"})
                    return self.send_error_json(409, "studio_silence_room is not configured")
                deadline = time.monotonic() + 8
                while time.monotonic() < deadline:
                    states = current_states(True)
                    doorbell_off = entity_state(states, ENTITY["silence"]["doorbell"]) == "off"
                    ac_off = entity_state(states, ENTITY["silence"]["ac"]) == "off"
                    fan_off = entity_state(states, ENTITY["silence"]["fan"]) == "off"
                    PREP.update({"mutedDoorbell": doorbell_off, "acOff": ac_off, "fanOff": fan_off})
                    if doorbell_off and ac_off and fan_off:
                        break
                    time.sleep(0.4)
                if not (PREP["mutedDoorbell"] and PREP["acOff"] and PREP["fanOff"]):
                    PREP.update({"active": False, "status": "idle"})
                    return self.send_error_json(409, "studio devices did not confirm off")
                PREP["status"] = "ready"
                broadcast("preflight", {"preflight": preflight_payload(current_states(True)), "prep": prep_state()})
                return self.send_json(prep_state())
            if path == "/api/preflight/restore":
                PREP["status"] = "restoring"
                try:
                    call_service("script", "turn_on", {"entity_id": "script.studio_restore_room"})
                except urllib.error.HTTPError:
                    PREP["status"] = "ready"
                    return self.send_error_json(409, "studio_restore_room is not configured")
                PREP.update({"active": False, "status": "idle", "mutedDoorbell": False, "acOff": False, "fanOff": False})
                broadcast("preflight", {"preflight": preflight_payload(current_states(True)), "prep": prep_state()})
                return self.send_json(prep_state())
            if path == "/api/utilities/action":
                action = body.get("action")
                if action == "water_pump_toggle":
                    if not available(states, ENTITY["utilities"]["pump"]):
                        return self.send_error_json(409, "water pump is not configured")
                    if not is_on(states, ENTITY["utilities"]["dry_run"]):
                        return self.send_error_json(409, "physical dry-run protection is not confirmed")
                    call_service("switch", "toggle", {"entity_id": ENTITY["utilities"]["pump"]})
                elif action == "purifier_toggle":
                    if not available(states, ENTITY["utilities"]["purifier"]):
                        return self.send_error_json(409, "purifier is not configured")
                    call_service("fan", "toggle", {"entity_id": ENTITY["utilities"]["purifier"]})
                else:
                    return self.send_error_json(400, "invalid utility action")
                payload = utilities_payload(current_states(True))
                broadcast("utilities", payload)
                return self.send_json(payload)
            if path == "/api/tone":
                return self.send_json({"ok": True})
            if path == "/api/piano/cue":
                cue = body.get("cue")
                if cue not in {"recording_started", "recording_stopped", "next_preset", "prev_preset", "replay_last"}:
                    return self.send_error_json(400, "invalid piano cue")
                request = urllib.request.Request(f"{PIANO_URL}/cue", data=json.dumps({"cue": cue}).encode(), headers={"Content-Type": "application/json"}, method="POST")
                try:
                    with urllib.request.urlopen(request, timeout=3) as response:
                        piano = json.loads(response.read())
                except urllib.error.HTTPError as error:
                    if error.code == 409:
                        return self.send_error_json(409, "piano cues locked during a take")
                    piano = piano_payload()
                except Exception:
                    piano = piano_payload()
                broadcast("piano", piano)
                return self.send_json(piano)
            if path == "/api/air/purifier":
                purifier = ENTITY["purifiers"].get(body.get("id"))
                mode = body.get("mode")
                if not purifier or mode not in {"off", "silent", "auto", "max"}:
                    return self.send_error_json(400, "invalid purifier or mode")
                if mode == "off":
                    call_service("fan", "turn_off", {"entity_id": purifier["entity"]})
                else:
                    call_service("fan", "set_percentage", {"entity_id": purifier["entity"], "percentage": {"silent": 25, "auto": 50, "max": 100}[mode]})
                payload = air_payload(current_states(True))
                broadcast("air", payload)
                return self.send_json(payload)
            if path == "/api/air/purge":
                global PURGE_UNTIL
                minutes = max(1, min(60, as_int(body.get("minutes"), 10)))
                PURGE_UNTIL = int(time.time() * 1000) + minutes * 60_000
                for purifier in ENTITY["purifiers"].values():
                    if available(states, purifier["entity"]):
                        call_service("fan", "set_percentage", {"entity_id": purifier["entity"], "percentage": 100})
                payload = air_payload(current_states(True))
                broadcast("air", payload)
                return self.send_json(payload)
            if path == "/api/air/purge/stop":
                PURGE_UNTIL = None
                for purifier in ENTITY["purifiers"].values():
                    if available(states, purifier["entity"]):
                        call_service("fan", "set_percentage", {"entity_id": purifier["entity"], "percentage": 50})
                payload = air_payload(current_states(True))
                broadcast("air", payload)
                return self.send_json(payload)
            if path == "/api/sos":
                who = clean_text(body.get("who"), 40) or "Someone"
                message = clean_text(body.get("message"), 160)
                with LOCK:
                    STORE.sos = {"active": True, "who": who, "message": message, "since": int(time.time() * 1000)}
                    STORE.save()
                # Every phone and panel must see the SOS immediately, even if
                # Home Assistant is mid-restart. The latch is the point; the
                # escalation below is best-effort and logged when it fails.
                broadcast("sos", STORE.sos)
                try:
                    call_service("input_select", "select_option", {"entity_id": ENTITY["state"], "option": "emergency"})
                    call_service("input_text", "set_value", {"entity_id": ENTITY["set_by"], "value": f"SOS · {who}"})
                    try:
                        call_service("notify", "all_family_critical", {"title": f"SOS · {who}", "message": message or f"{who} needs help now"})
                    except urllib.error.HTTPError:
                        STORE.add_history("safety", "SOS notification group missing", "Configure notify.all_family_critical", "warning")
                    broadcast("state", state_info(current_states(True)))
                except (urllib.error.URLError, TimeoutError, OSError) as error:
                    STORE.add_history("safety", "SOS raised · Home Assistant unreachable", f"House not switched to emergency ({error.__class__.__name__})", "critical")
                STORE.add_history("safety", f"SOS · {who}", message or "Help requested", "critical")
                return self.send_json(STORE.sos)
            if path == "/api/sos/clear":
                with LOCK:
                    STORE.sos = None
                    STORE.save()
                broadcast("sos", None)
                return self.send_json({"ok": True})
            if path == "/api/delivery":
                minutes = max(1, min(120, as_int(body.get("minutes"), 20)))
                with LOCK:
                    STORE.delivery = {"active": True, "courier": clean_text(body.get("courier"), 40) or "Delivery", "otp": clean_text(body.get("otp"), 16), "note": clean_text(body.get("note"), 180), "displayId": clean_text(body.get("displayId"), 80) or "front-house", "expiresAt": int(time.time() * 1000) + minutes * 60_000}
                    STORE.save()
                broadcast("delivery", STORE.delivery)
                STORE.add_history("system", f"{STORE.delivery['courier']} OTP on door", "Delivery hand-off active")
                return self.send_json(STORE.delivery)
            if path == "/api/delivery/clear":
                with LOCK:
                    STORE.delivery = None
                    STORE.save()
                broadcast("delivery", None)
                return self.send_json({"ok": True})
            if path == "/api/displays/update":
                with LOCK:
                    for display in STORE.displays:
                        if display["id"] == body.get("id"):
                            patch = body.get("patch") if isinstance(body.get("patch"), dict) else {}
                            for key in ("content", "message", "name"):
                                if key in patch:
                                    display[key] = clean_text(patch[key], 180 if key == "message" else 60)
                    STORE.save()
                broadcast("displays", STORE.displays)
                return self.send_json(STORE.displays)
            if path == "/api/displays/add":
                with LOCK:
                    if len(STORE.displays) >= 16:
                        return self.send_error_json(400, "display limit reached (16)")
                    existing = {item["id"] for item in STORE.displays}
                    new_id = f"panel-{int(time.time() * 1000)}"
                    while new_id in existing:
                        new_id += "x"
                    STORE.displays.append({"id": new_id, "name": clean_text(body.get("name"), 60) or "New display", "content": "door", "message": ""})
                    STORE.save()
                broadcast("displays", STORE.displays)
                return self.send_json(STORE.displays)
            if path == "/api/displays/remove":
                with LOCK:
                    protected = {item["id"] for item in DEFAULT_DISPLAYS}
                    STORE.displays = [item for item in STORE.displays if item["id"] != body.get("id") or item["id"] in protected]
                    STORE.save()
                broadcast("displays", STORE.displays)
                return self.send_json(STORE.displays)
            if path == "/api/safety/demo":
                if not ALLOW_COMMISSIONING:
                    return self.send_error_json(403, "commissioning mode is disabled")
                return self.send_json(safety_payload(states))
            return self.send_error_json(404, "not found")
        except (BrokenPipeError, ConnectionResetError):
            return
        except ValueError as error:
            return self.send_error_json(400, str(error))
        except urllib.error.HTTPError as error:
            return self.send_error_json(502, f"Home Assistant rejected the action ({error.code})")
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            return self.send_error_json(503, f"device unavailable ({error.__class__.__name__})")
        except Exception as error:
            return self.send_error_json(500, f"bridge error ({error.__class__.__name__})")

    def send_doorbell(self) -> None:
        try:
            payload, content_type = ha(f"/api/camera_proxy/{ENTITY['camera']}", raw=True)
        except Exception:
            payload = b'<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="#101014"/><text x="50%" y="50%" fill="#8b8b96" font-family="monospace" font-size="22" text-anchor="middle">ENTRANCE CAMERA NOT CONNECTED</text></svg>'
            content_type = "image/svg+xml"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.add_cors()
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def send_static(self, request_path: str) -> None:
        decoded = urllib.parse.unquote(request_path)
        relative = posixpath.normpath(decoded.lstrip("/"))
        if relative.startswith("../"):
            return self.send_error_json(403, "invalid path")
        target = (WEB_ROOT / (relative or "index.html")).resolve()
        if WEB_ROOT not in target.parents and target != WEB_ROOT:
            return self.send_error_json(403, "invalid path")
        if not target.is_file():
            target = WEB_ROOT / "index.html"
        if not target.is_file():
            return self.send_error_json(404, "web app not built")
        payload = target.read_bytes()
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        # Any HTML page, the service worker, and the manifest must revalidate —
        # an hour-stale door.html on a wall panel lags every deploy.
        fresh_always = target.suffix == ".html" or target.name in {"sw.js", "manifest.webmanifest"}
        self.send_header("Cache-Control", "no-cache" if fresh_always else "public, max-age=31536000, immutable" if "/assets/" in target.as_posix() else "public, max-age=3600")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def stream(self) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Accel-Buffering", "no")
        self.add_cors()
        self.end_headers()
        queue: list[str] = []
        with COND:
            SUBSCRIBERS.append(queue)
        try:
            states = current_states()
            piano = piano_payload()
            initial = (
                ("state", state_info(states)),
                ("rooms", rooms_payload(states)),
                ("safety", safety_payload(states)),
                ("utilities", utilities_payload(states)),
                ("preflight", {"preflight": preflight_payload(states), "prep": prep_state()}),
                ("piano", piano),
                ("delivery", STORE.delivery),
                ("displays", STORE.displays),
                ("sos", STORE.sos),
                ("fleet", fleet_payload(states, piano)),
                ("air", air_payload(states)),
            )
            for name, payload in initial:
                self.wfile.write(f"event: {name}\ndata: {json.dumps(payload, separators=(',', ':'))}\n\n".encode())
            self.wfile.flush()
            last_beat = time.monotonic()
            while True:
                with COND:
                    COND.wait(timeout=10)
                    frames, queue[:] = list(queue), []
                for frame in frames:
                    self.wfile.write(frame.encode())
                if time.monotonic() - last_beat > 15:
                    self.wfile.write(b": keepalive\n\n")
                    last_beat = time.monotonic()
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            with COND:
                if queue in SUBSCRIBERS:
                    SUBSCRIBERS.remove(queue)


def main() -> None:
    if not HA_TOKEN:
        raise SystemExit("HA_TOKEN or SUPERVISOR_TOKEN is required")
    if WEB_ROOT and not (WEB_ROOT / "index.html").is_file():
        raise SystemExit(f"WEB_ROOT has no index.html: {WEB_ROOT}")
    threading.Thread(target=poller, daemon=True, name="ha-poller").start()
    print(f"Aangan Bridge :{PORT} → {HA_URL} · web={'on' if WEB_ROOT else 'off'} · commissioning={'on' if ALLOW_COMMISSIONING else 'off'}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
