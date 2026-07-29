#!/usr/bin/env python3
"""MIDI black-box — runs ON the PIANO Pi. Stdlib only.

Silently captures EVERY note played on the connected MIDI keyboard, 24/7, as
Standard MIDI Files. A "take" is any playing separated by >= 90 s of silence.
An improvisation is never lost: each take can be replayed straight back into
Pianoteq (--replay-last) or pulled off the Pi for lessons.

Files:
  ~/blackbox/YYYY-MM-DD/take-HHMMSS.mid   one SMF per take
  ~/blackbox/takes.json                    rolling index (last 200 takes)
  ~/blackbox/state.json                    live {recording, notes} for the
                                           status server (port 8951) to read

Design rules (same as the status server): decoupled and harmless. This
process only READS the ALSA sequencer via `aseqdump`; it can never touch
Pianoteq's audio thread. If the keyboard is unplugged it just waits.
"""
import json
import os
import re
import signal
import struct
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(os.path.expanduser("~/blackbox"))
SILENCE_SPLIT_S = 90          # gap that ends a take
MIN_TAKE_NOTES = 8            # ignore accidental single bumps
TPQN = 480                    # ticks per quarter note
TEMPO_US = 500_000            # 120 bpm — real time is preserved via ms→ticks
TICKS_PER_MS = TPQN / 500.0   # at 120 bpm: 500 ms per quarter

EVENT_RE = re.compile(
    r"(Note on|Note off|Control change)\s+(\d+), (?:note|controller) (\d+), (?:velocity|value) (\d+)"
)
SKIP_CLIENTS = ("System", "Midi Through", "Pianoteq", "aseqdump", "Client")


def vlq(n: int) -> bytes:
    """MIDI variable-length quantity."""
    out = [n & 0x7F]
    n >>= 7
    while n:
        out.append((n & 0x7F) | 0x80)
        n >>= 7
    return bytes(reversed(out))


def write_smf(path: Path, events):
    """events: list of (ms_since_take_start, status_byte, d1, d2)."""
    track = bytearray()
    track += vlq(0) + b"\xff\x51\x03" + struct.pack(">I", TEMPO_US)[1:]  # tempo
    last_ticks = 0
    for ms, status, d1, d2 in events:
        ticks = int(ms * TICKS_PER_MS)
        track += vlq(max(0, ticks - last_ticks)) + bytes([status, d1, d2])
        last_ticks = ticks
    track += vlq(0) + b"\xff\x2f\x00"  # end of track
    with open(path, "wb") as f:
        f.write(b"MThd" + struct.pack(">IHHH", 6, 0, 1, TPQN))
        f.write(b"MTrk" + struct.pack(">I", len(track)) + bytes(track))


def find_keyboard_port():
    """First readable ALSA client that isn't system/Pianoteq/loopback."""
    try:
        out = subprocess.run(["aseqdump", "-l"], capture_output=True, text=True, timeout=5).stdout
    except (subprocess.SubprocessError, FileNotFoundError):
        return None
    for line in out.splitlines():
        m = re.match(r"\s*(\d+):(\d+)\s+(.+?)\s{2,}", line + "  ")
        if not m:
            continue
        client = m.group(3).strip()
        if client and not any(s.lower() in client.lower() for s in SKIP_CLIENTS):
            return f"{m.group(1)}:{m.group(2)}", client
    return None


def write_json(path: Path, obj):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj))
    tmp.replace(path)


def save_state(recording: bool, notes: int):
    write_json(ROOT / "state.json", {"recording": recording, "notes": notes, "ts": int(time.time() * 1000)})


def index_take(path: Path, started_ms: int, dur_ms: int, notes: int):
    idx_path = ROOT / "takes.json"
    try:
        takes = json.loads(idx_path.read_text())
    except (OSError, json.JSONDecodeError):
        takes = []
    takes.append({"file": str(path), "at": started_ms, "minutes": round(dur_ms / 60000, 1), "notes": notes})
    write_json(idx_path, takes[-200:])


def flush_take(events, note_count, started_mono, started_wall_ms):
    if note_count < MIN_TAKE_NOTES or not events:
        return
    day = ROOT / datetime.fromtimestamp(started_wall_ms / 1000).strftime("%Y-%m-%d")
    day.mkdir(parents=True, exist_ok=True)
    path = day / datetime.fromtimestamp(started_wall_ms / 1000).strftime("take-%H%M%S.mid")
    write_smf(path, events)
    index_take(path, started_wall_ms, events[-1][0], note_count)
    print(f"blackbox: saved {path} ({note_count} notes)", flush=True)


def capture_loop():
    ROOT.mkdir(parents=True, exist_ok=True)
    save_state(False, 0)
    while True:
        found = find_keyboard_port()
        if not found:
            time.sleep(10)
            continue
        port, client = found
        print(f"blackbox: capturing from {client} ({port})", flush=True)
        proc = subprocess.Popen(["aseqdump", "-p", port], stdout=subprocess.PIPE, text=True)
        events, note_count = [], 0
        take_start_mono = take_start_wall = last_event_mono = None
        try:
            for line in proc.stdout:
                now = time.monotonic()
                # split the take on long silence
                if last_event_mono and now - last_event_mono >= SILENCE_SPLIT_S and events:
                    flush_take(events, note_count, take_start_mono, take_start_wall)
                    events, note_count, take_start_mono = [], 0, None
                    save_state(False, 0)
                m = EVENT_RE.search(line)
                if not m:
                    continue
                kind, ch, d1, d2 = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4))
                if take_start_mono is None:
                    take_start_mono, take_start_wall = now, int(time.time() * 1000)
                ms = int((now - take_start_mono) * 1000)
                if kind == "Note on":
                    status = 0x90 | (ch & 0x0F)
                    if d2 > 0:
                        note_count += 1
                elif kind == "Note off":
                    status = 0x80 | (ch & 0x0F)
                else:  # Control change — keeps the sustain pedal (CC64) honest
                    status = 0xB0 | (ch & 0x0F)
                events.append((ms, status, d1 & 0x7F, d2 & 0x7F))
                last_event_mono = now
                if len(events) % 32 == 1:
                    save_state(True, note_count)
        finally:
            proc.terminate()
            if events:
                flush_take(events, note_count, take_start_mono, take_start_wall)
            save_state(False, 0)
        time.sleep(5)  # keyboard unplugged / aseqdump died — rescan


def replay_last():
    """Play the newest take back into Pianoteq via aplaymidi."""
    try:
        takes = json.loads((ROOT / "takes.json").read_text())
        last = takes[-1]["file"]
    except (OSError, json.JSONDecodeError, IndexError):
        print("blackbox: no takes yet")
        return 1
    out = subprocess.run(["aplaymidi", "-l"], capture_output=True, text=True, timeout=5).stdout
    port = None
    for line in out.splitlines():
        if "pianoteq" in line.lower():
            port = line.split()[0]
            break
    if not port:
        print("blackbox: Pianoteq MIDI port not found")
        return 1
    subprocess.Popen(["aplaymidi", "-p", port, last])
    print(f"blackbox: replaying {last} → {port}")
    return 0


if __name__ == "__main__":
    if "--replay-last" in sys.argv:
        sys.exit(replay_last())
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    capture_loop()
