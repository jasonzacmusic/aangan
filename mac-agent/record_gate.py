#!/usr/bin/env python3
"""NSM Record Gate — runs on the recording Mac. Stdlib only.

Reads the ONE authoritative studio_ready sensor from Home Assistant and
1) serves it at http://127.0.0.1:8952/ready for anything local (the REAPER
   GuardedRecord.lua action asks this before allowing Record),
2) pops a macOS alert if a take starts while the studio is NOT ready,
3) `train` mode: learns the dB threshold from real labelled takes instead of
   a guessed number, then writes it to HA's input_number.studio_db_threshold.

Usage:
  python3 record_gate.py serve                 # the always-on gate (launchd)
  python3 record_gate.py train good            # run DURING a known-good quiet take
  python3 record_gate.py train noisy           # run while the room is unacceptably noisy
  python3 record_gate.py train apply           # compute + push the trained threshold

Config in ~/.config/nsm/studio.env:
  HA_URL=http://homeassistant.local:8123
  HA_TOKEN=<long-lived token>
"""
import json
import os
import statistics
import subprocess
import sys
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

CONF = Path.home() / ".config/nsm/studio.env"
SAMPLES = Path.home() / ".config/nsm/noise-training.json"
PORT = 8952
DB_SENSOR = "sensor.studio_sound_level"
READY_SENSOR = "binary_sensor.studio_ready"
THRESHOLD_ENTITY = "input_number.studio_db_threshold"


def load_env():
    env = {}
    if CONF.exists():
        for line in CONF.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


ENV = load_env()
HA_URL = ENV.get("HA_URL", "http://homeassistant.local:8123").rstrip("/")
HA_TOKEN = ENV.get("HA_TOKEN", "")


def ha(path, method="GET", body=None):
    req = urllib.request.Request(
        f"{HA_URL}{path}",
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {HA_TOKEN}", "Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=4) as res:
        return json.loads(res.read() or b"null")


def ready_payload():
    try:
        ready = ha(f"/api/states/{READY_SENSOR}")
        db = ha(f"/api/states/{DB_SENSOR}")
        return {
            "ready": ready["state"] == "on",
            "reason": "" if ready["state"] == "on" else "studio_ready is off — check Pre-flight in Studio Command",
            "db": float(db["state"]) if db["state"] not in ("unknown", "unavailable") else None,
            "ts": int(time.time() * 1000),
        }
    except Exception as e:
        # Fail SAFE for the music, honest for the user: if HA is unreachable we
        # cannot vouch for the room — report not-ready with the real reason.
        return {"ready": False, "reason": f"Home Assistant unreachable ({e.__class__.__name__})", "db": None,
                "ts": int(time.time() * 1000)}


def alert(msg):
    subprocess.run(["osascript", "-e",
                    f'display notification "{msg}" with title "NSM Record Gate" sound name "Basso"'],
                   check=False)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        if self.path == "/ready":
            payload = ready_payload()
            body = json.dumps(payload).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body)
            return
        self.send_response(404)
        self.end_headers()


def serve():
    if not HA_TOKEN:
        raise SystemExit(f"Put HA_URL/HA_TOKEN in {CONF}")
    print(f"record gate on 127.0.0.1:{PORT} → {HA_URL}")
    was_ready = True
    def watch():
        nonlocal was_ready
        while True:
            p = ready_payload()
            if was_ready and not p["ready"]:
                alert(f"Studio NOT ready: {p['reason']}")
            was_ready = p["ready"]
            time.sleep(5)
    import threading
    threading.Thread(target=watch, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()


def train(mode):
    data = json.loads(SAMPLES.read_text()) if SAMPLES.exists() else {"good": [], "noisy": []}
    if mode in ("good", "noisy"):
        print(f"Sampling {DB_SENSOR} for 60 s as '{mode}' — keep the room in that condition…")
        got = []
        for _ in range(60):
            p = ready_payload()
            if p["db"] is not None:
                got.append(p["db"])
            time.sleep(1)
        data[mode].extend(got)
        SAMPLES.parent.mkdir(parents=True, exist_ok=True)
        SAMPLES.write_text(json.dumps(data))
        print(f"stored {len(got)} samples · totals good={len(data['good'])} noisy={len(data['noisy'])}")
        return
    if mode == "apply":
        good, noisy = data["good"], data["noisy"]
        if len(good) < 30:
            raise SystemExit("Need ≥30 'good' samples first (run: train good — during a real quiet take)")
        p95_good = statistics.quantiles(good, n=20)[18]  # 95th percentile of good takes
        threshold = round(p95_good + 3.0, 1)             # +3 dB headroom above proven-good
        if noisy:
            floor_noisy = min(noisy)
            if threshold >= floor_noisy:
                threshold = round((p95_good + floor_noisy) / 2, 1)  # split the gap
        ha("/api/services/input_number/set_value", "POST",
           {"entity_id": THRESHOLD_ENTITY, "value": threshold})
        print(f"trained threshold {threshold} dBA (p95 good {p95_good:.1f}"
              + (f", quietest noisy {min(noisy):.1f}" if noisy else "") + ") → pushed to HA")
        return
    raise SystemExit("train mode must be: good | noisy | apply")


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["serve"] or not args:
        serve()
    elif args[:1] == ["train"] and len(args) > 1:
        train(args[1])
    else:
        print(__doc__)
