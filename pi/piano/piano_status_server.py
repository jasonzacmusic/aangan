#!/usr/bin/env python3
"""Piano rig status server — runs ON the PIANO Pi, port 8951.

Deliberately tiny and decoupled: the House Pi polls /status; /cue sets a tally
flag and (optionally) switches presets through Pianoteq's local JSON-RPC
(enabled with --serve 127.0.0.1:8081 in pianoteq.service). If Pianoteq's RPC is
unreachable we still answer with best-effort data — this server must never make
the instrument's life harder. Stdlib only.
"""
import json
import os
import subprocess
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8951
PIANOTEQ_RPC = "http://127.0.0.1:8081/jsonrpc"
STATE = {"tally": False, "preset": "—", "last_rpc_ok": 0.0}
BLACKBOX_DIR = os.path.expanduser("~/blackbox")


def rpc(method, params=None):
    body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}).encode()
    req = urllib.request.Request(PIANOTEQ_RPC, data=body, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=1.5) as res:
        return json.loads(res.read()).get("result")


def read_temp():
    try:
        with open("/sys/class/thermal/thermal_zone0/temp") as f:
            return round(int(f.read().strip()) / 1000, 1)
    except OSError:
        return 0.0


def read_cpu_pct():
    try:
        out = subprocess.run(
            ["sh", "-c", "top -bn1 | awk '/Cpu\\(s\\)/{print 100-$8}'"],
            capture_output=True, text=True, timeout=2,
        ).stdout.strip()
        return int(float(out or 0))
    except (subprocess.SubprocessError, ValueError):
        return 0


def refresh_preset():
    try:
        info = rpc("getInfo")
        # Pianoteq's getInfo returns current preset info; shape can vary by version,
        # so we fish defensively and fall back to the last known name.
        if isinstance(info, list) and info:
            name = info[0].get("current_preset", {}).get("name")
            if name:
                STATE["preset"] = name
        STATE["last_rpc_ok"] = time.time()
    except Exception:
        pass


def read_blackbox():
    """Best-effort summary from the midi_blackbox.py files. Never raises."""
    out = {"recording": False, "takesToday": 0, "lastTakeAt": None, "lastTakeMinutes": 0, "lastTakeNotes": 0}
    try:
        with open(os.path.join(BLACKBOX_DIR, "state.json")) as f:
            live = json.load(f)
        # stale state file (service down) must not claim "recording"
        out["recording"] = bool(live.get("recording")) and (time.time() * 1000 - live.get("ts", 0)) < 120_000
    except (OSError, json.JSONDecodeError):
        pass
    try:
        with open(os.path.join(BLACKBOX_DIR, "takes.json")) as f:
            takes = json.load(f)
        midnight = time.mktime(time.localtime()[:3] + (0, 0, 0, 0, 0, -1)) * 1000
        out["takesToday"] = sum(1 for t in takes if t.get("at", 0) >= midnight)
        if takes:
            last = takes[-1]
            out["lastTakeAt"] = last.get("at")
            out["lastTakeMinutes"] = last.get("minutes", 0)
            out["lastTakeNotes"] = last.get("notes", 0)
    except (OSError, json.JSONDecodeError):
        pass
    return out


def status_payload():
    refresh_preset()
    online = (time.time() - STATE["last_rpc_ok"]) < 30
    return {
        "online": online,
        "preset": STATE["preset"],
        "cpuPct": read_cpu_pct(),
        "tempC": read_temp(),
        "audioDevice": "Raspberry Pi DAC Pro → balanced XLR → console",
        "sampleRate": 48000,
        "bufferFrames": 192,
        "latencyMs": 4,
        "lastSeen": int(time.time() * 1000),
        "tally": bool(STATE["tally"]),
        "blackbox": read_blackbox(),
    }


REPLAY_MIN_GAP_S = 10.0
PRESET_MIN_GAP_S = 2.0
_last_replay = 0.0
_last_preset = 0.0


class Handler(BaseHTTPRequestHandler):
    timeout = 60

    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            return self._json({"ok": True})
        if self.path == "/status":
            return self._json(status_payload())
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        global _last_replay, _last_preset
        if self.path != "/cue":
            return self._json({"error": "not found"}, 404)
        # Cap the body: this port is open on the LAN and rfile.read of an
        # attacker-chosen length would buffer it all in RAM.
        length = int(self.headers.get("Content-Length") or 0)
        if length > 4096:
            return self._json({"error": "body too large"}, 400)
        try:
            cue = json.loads(self.rfile.read(length) or b"{}").get("cue", "")
        except json.JSONDecodeError:
            cue = ""
        if cue == "recording_started":
            STATE["tally"] = True
        elif cue == "recording_stopped":
            STATE["tally"] = False
        elif cue in ("next_preset", "prev_preset"):
            if STATE["tally"]:
                return self._json({**status_payload(), "error": "tally on"}, 409)
            now = time.time()
            if now - _last_preset < PRESET_MIN_GAP_S:
                return self._json(status_payload())
            _last_preset = now
            try:
                rpc("nextPreset" if cue == "next_preset" else "prevPreset")
            except Exception:
                pass
        elif cue == "replay_last":
            if STATE["tally"]:
                return self._json({**status_payload(), "error": "tally on"}, 409)
            # fire-and-forget: aplaymidi streams the newest take into Pianoteq.
            # Rate-limited so cue spam cannot stack concurrent playbacks into
            # the instrument.
            now = time.time()
            if now - _last_replay >= REPLAY_MIN_GAP_S:
                _last_replay = now
                try:
                    subprocess.Popen(["python3", "/usr/local/bin/midi_blackbox.py", "--replay-last"])
                except OSError:
                    pass
        self._json(status_payload())


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
