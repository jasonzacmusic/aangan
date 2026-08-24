#!/usr/bin/env python3
"""NSM Record Gate — runs on the recording Mac. Stdlib only.

Reads the one authoritative pre-flight verdict from the Aangan LAN server
(the Mac process that talks to the ESP32s — there is no Raspberry Pi) and:

1) serves it at http://127.0.0.1:8952/ready for anything local (the REAPER
   GuardedRecord.lua action asks this before allowing Record),
2) pops a macOS alert if a take starts while the studio is NOT ready,
3) `train` mode: learns the dB threshold from real labelled takes instead of
   a guessed number, then writes it to the LAN server.

Usage:
  python3 record_gate.py serve                 # the always-on gate (launchd)
  python3 record_gate.py train good            # run DURING a known-good quiet take
  python3 record_gate.py train noisy           # run while the room is unacceptably noisy
  python3 record_gate.py train apply           # compute + push the trained threshold

Config in ~/.config/nsm/studio.env:
  AANGAN_URL=http://127.0.0.1:8126
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


def load_env():
    env = {}
    if CONF.exists():
        for line in CONF.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip()
    return env


ENV = load_env()
AANGAN_URL = ENV.get("AANGAN_URL", os.environ.get("AANGAN_URL", "http://127.0.0.1:8126")).rstrip("/")


def aangan(path, method="GET", body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{AANGAN_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=4) as res:
        return json.loads(res.read() or b"null")


def not_ready_reason(pf):
    bits = []
    if not pf.get("doorsClosed"):
        names = pf.get("openDoorNames") or []
        bits.append(", ".join(names) if names else "a door is open")
    if not pf.get("quietEnough"):
        bits.append("room too loud" if pf.get("dbLevel") is not None else "sound meter not reporting")
    if not pf.get("sensorsHealthy"):
        bits.append("a board is silent")
    if not pf.get("safetyClear"):
        bits.append("a safety alert is live")
    return " · ".join(bits) or "not ready"


def ready_payload():
    try:
        pf = aangan("/api/preflight")
        ready = bool(pf.get("ready"))
        db = pf.get("dbLevel")
        if db is not None:
            try:
                db = float(db)
            except (TypeError, ValueError):
                db = None
        return {
            "ready": ready,
            "reason": "" if ready else not_ready_reason(pf),
            "db": db,
            "ts": int(time.time() * 1000),
        }
    except Exception as e:
        return {
            "ready": False,
            "reason": f"Aangan LAN unreachable ({e.__class__.__name__}) — is npm run lan running?",
            "db": None,
            "ts": int(time.time() * 1000),
        }


def alert(msg):
    safe = msg.replace("\\", "\\\\").replace('"', '\\"')
    subprocess.run(
        ["osascript", "-e", f'display notification "{safe}" with title "NSM Record Gate" sound name "Basso"'],
        check=False,
    )


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
    print(f"record gate on 127.0.0.1:{PORT} → {AANGAN_URL}")
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
        print(f"Sampling studio dBA for 60 s as '{mode}' — keep the room in that condition…")
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
                threshold = round((p95_good + floor_noisy) / 2, 1)
        aangan("/api/settings/db-threshold", "POST", {"value": threshold})
        print(
            f"trained threshold {threshold} dBA (p95 good {p95_good:.1f}"
            + (f", quietest noisy {min(noisy):.1f}" if noisy else "")
            + ") → pushed to Aangan LAN"
        )
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
