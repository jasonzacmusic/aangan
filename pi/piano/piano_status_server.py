#!/usr/bin/env python3
"""Piano rig status server — runs ON the PIANO Pi, port 8951.

Deliberately tiny and decoupled: the House Pi polls /status; /cue sets a tally
flag and (optionally) switches presets through Pianoteq's local JSON-RPC
(enabled with --serve 127.0.0.1:8081 in pianoteq.service). If Pianoteq's RPC is
unreachable we still answer with best-effort data — this server must never make
the instrument's life harder. Stdlib only.
"""
import json
import subprocess
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 8951
PIANOTEQ_RPC = "http://127.0.0.1:8081/jsonrpc"
STATE = {"tally": False, "preset": "—", "last_rpc_ok": 0.0}


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


def status_payload():
    refresh_preset()
    online = (time.time() - STATE["last_rpc_ok"]) < 30
    return {
        "online": online,
        "preset": STATE["preset"],
        "cpuPct": read_cpu_pct(),
        "tempC": read_temp(),
        "audioDevice": "HiFiBerry DAC2 Pro XLR → console",
        "sampleRate": 48000,
        "bufferFrames": 192,
        "latencyMs": 4,
        "lastSeen": int(time.time() * 1000),
    }


class Handler(BaseHTTPRequestHandler):
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
        if self.path != "/cue":
            return self._json({"error": "not found"}, 404)
        length = int(self.headers.get("Content-Length") or 0)
        try:
            cue = json.loads(self.rfile.read(length) or b"{}").get("cue", "")
        except json.JSONDecodeError:
            cue = ""
        if cue == "recording_started":
            STATE["tally"] = True
        elif cue == "recording_stopped":
            STATE["tally"] = False
        elif cue in ("next_preset", "prev_preset"):
            try:
                rpc("nextPreset" if cue == "next_preset" else "prevPreset")
            except Exception:
                pass
        self._json(status_payload())


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
