# Drive both USB door boards from the live Aangan door service.
# Usage: python3 scripts/door_usb_director.py
# Polls https://aangan.nathanielschool.com/api/door and writes the same SET
# command to the light and the screen, so they cannot disagree.

from __future__ import annotations

import json
import time
import urllib.request

import serial
import termios

RELAY = "https://aangan.nathanielschool.com/api/door"
LIGHT = "/dev/cu.usbserial-0001"
# tty.* on macOS does not wait for DCD; cu.* often pulses DTR and resets the S3.
SCREEN = "/dev/tty.usbmodem5B901711441"
HEARTBEAT_S = 2.0
OVERLAY = {"door", "loud", "delivery", "preflight"}


def log(msg: str) -> None:
    print(msg, flush=True)


def word(body: dict) -> str:
    vis = str(body.get("visual") or "")
    st = str(body.get("state") or "available")
    if vis in OVERLAY:
        return vis
    if vis == "sos" and st == "emergency":
        return "sos"
    return st


def open_port(path: str) -> serial.Serial | None:
    try:
        s = serial.Serial()
        s.port = path
        s.baudrate = 115200
        s.timeout = 0.05
        s.write_timeout = 1
        s.dsrdtr = False
        s.rtscts = False
        # Must be False BEFORE open. pyserial still applies these on open
        # when dsrdtr/rtscts are off; True (the default) resets the S3.
        s.dtr = False
        s.rts = False
        s.open()
        try:
            attrs = termios.tcgetattr(s.fileno())
            attrs[2] &= ~termios.HUPCL
            termios.tcsetattr(s.fileno(), termios.TCSANOW, attrs)
        except Exception:
            pass
        s.dtr = False
        s.rts = False
        log(f"open {path}")
        return s
    except Exception as e:
        log(f"skip {path}: {e}")
        return None


def write_one(port, path: str, label: str, msg: bytes):
    target = port
    if target is None:
        target = open_port(path)
    if target is None:
        return None
    try:
        target.write(msg)
        target.flush()
        return target
    except Exception as e:
        log(f"{label} write failed: {e}")
        try:
            target.close()
        except Exception:
            pass
        target = open_port(path)
        if target is None:
            return None
        try:
            target.write(msg)
            target.flush()
            return target
        except Exception as e2:
            log(f"{label} retry failed: {e2}")
            return None


def write_both(light, screen, w: str):
    msg = f"SET {w}\r\n".encode()
    return write_one(light, LIGHT, "light", msg), write_one(screen, SCREEN, "screen", msg)


def main() -> None:
    log("director starting")
    light = open_port(LIGHT)
    screen = open_port(SCREEN)
    # Native USB on the S3 can still reboot once at first open. Wait, then
    # reopen so SET goes to a live USB session instead of the dead one.
    if screen is not None:
        time.sleep(2.5)
        try:
            screen.close()
        except Exception:
            pass
        screen = open_port(SCREEN)
        log("screen reopened after settle")
    last = ""
    last_sent = 0.0
    log("turn the Command dial on aangan.nathanielschool.com")
    while True:
        try:
            with urllib.request.urlopen(RELAY, timeout=8) as r:
                body = json.loads(r.read().decode())
            w = word(body)
            now = time.monotonic()
            if w != last or (now - last_sent) >= HEARTBEAT_S:
                light, screen = write_both(light, screen, w)
                if w != last:
                    log(f"door → {w}")
                last = w
                last_sent = now
        except Exception as e:
            log(f"poll failed: {e}")
        time.sleep(1.0)


if __name__ == "__main__":
    main()
