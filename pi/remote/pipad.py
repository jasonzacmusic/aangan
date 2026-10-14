#!/usr/bin/env python3
"""Pi Pad — use a phone or iPad as this Raspberry Pi's trackpad and keyboard.

Serves a home-screen web app over the local network and turns what you do on
it into real input events through /dev/uinput. Because the events come in at
the kernel level, the desktop sees an ordinary keyboard and mouse: it works the
same under Wayland (labwc, wayfire) and X11, with nothing to configure there.

Standard library only, plus python3-evdev on the Pi for the uinput side.
On a Mac, run with --dry-run: every action is logged instead of injected, which
is how the web app and the protocol are tested without a Pi.

    python3 pipad.py                 # on the Pi (needs access to /dev/uinput)
    python3 pipad.py --dry-run       # anywhere, for testing
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import socket
import struct
import sys
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

log = logging.getLogger("pipad")

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
MAX_FRAME = 64 * 1024          # nothing legitimate is anywhere near this
MAX_TEXT = 2000                # characters per "type" message
MOVE_LIMIT = 400               # px per message; the client sends one per frame
SCROLL_LIMIT = 2400            # hi-res units (120 = one wheel notch)
LOCK_AFTER = 8                 # wrong PINs from one address before lockout
LOCK_SECONDS = 60

# ---------------------------------------------------------------------------
# Keyboard map. Names are Linux KEY_* identifiers, resolved to numbers only in
# the real injector, so this table can be tested on a Mac without evdev.
# ---------------------------------------------------------------------------
_PLAIN = {
    " ": "KEY_SPACE", "\n": "KEY_ENTER", "\t": "KEY_TAB",
    "-": "KEY_MINUS", "=": "KEY_EQUAL", "[": "KEY_LEFTBRACE",
    "]": "KEY_RIGHTBRACE", "\\": "KEY_BACKSLASH", ";": "KEY_SEMICOLON",
    "'": "KEY_APOSTROPHE", "`": "KEY_GRAVE", ",": "KEY_COMMA",
    ".": "KEY_DOT", "/": "KEY_SLASH",
}
_SHIFTED = {
    "_": "KEY_MINUS", "+": "KEY_EQUAL", "{": "KEY_LEFTBRACE",
    "}": "KEY_RIGHTBRACE", "|": "KEY_BACKSLASH", ":": "KEY_SEMICOLON",
    '"': "KEY_APOSTROPHE", "~": "KEY_GRAVE", "<": "KEY_COMMA",
    ">": "KEY_DOT", "?": "KEY_SLASH",
    "!": "KEY_1", "@": "KEY_2", "#": "KEY_3", "$": "KEY_4", "%": "KEY_5",
    "^": "KEY_6", "&": "KEY_7", "*": "KEY_8", "(": "KEY_9", ")": "KEY_0",
}
# iOS turns on "smart punctuation" by default. Typing a quote into a terminal
# would otherwise produce a character no US keyboard can send.
_SMART = {
    "‘": "'", "’": "'", "“": '"', "”": '"',
    "–": "-", "—": "-", "…": "...", " ": " ",
}
SPECIAL_KEYS = {
    "Enter": "KEY_ENTER", "Backspace": "KEY_BACKSPACE", "Tab": "KEY_TAB",
    "Escape": "KEY_ESC", "Delete": "KEY_DELETE", "Space": "KEY_SPACE",
    "ArrowUp": "KEY_UP", "ArrowDown": "KEY_DOWN",
    "ArrowLeft": "KEY_LEFT", "ArrowRight": "KEY_RIGHT",
    "Home": "KEY_HOME", "End": "KEY_END",
    "PageUp": "KEY_PAGEUP", "PageDown": "KEY_PAGEDOWN",
    "Super": "KEY_LEFTMETA",
    **{f"F{n}": f"KEY_F{n}" for n in range(1, 13)},
}
MODIFIERS = {
    "ctrl": "KEY_LEFTCTRL", "alt": "KEY_LEFTALT",
    "shift": "KEY_LEFTSHIFT", "super": "KEY_LEFTMETA",
}


def normalise_text(text: str) -> str:
    return "".join(_SMART.get(ch, ch) for ch in text)


def char_to_key(ch: str):
    """Return (KEY_name, needs_shift), or None if a US keyboard cannot type it."""
    if "a" <= ch <= "z":
        return f"KEY_{ch.upper()}", False
    if "A" <= ch <= "Z":
        return f"KEY_{ch}", True
    if "0" <= ch <= "9":
        return f"KEY_{ch}", False
    if ch in _PLAIN:
        return _PLAIN[ch], False
    if ch in _SHIFTED:
        return _SHIFTED[ch], True
    return None


def all_key_names() -> set:
    names = {f"KEY_{c}" for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"}
    names |= set(_PLAIN.values()) | set(_SHIFTED.values())
    names |= set(SPECIAL_KEYS.values()) | set(MODIFIERS.values())
    names.add("KEY_LEFTSHIFT")
    return names


def clamp(v, limit: int) -> int:
    try:
        v = int(v)
    except (TypeError, ValueError):
        return 0
    return max(-limit, min(limit, v))


# ---------------------------------------------------------------------------
# Injectors
# ---------------------------------------------------------------------------
class DryRunInjector:
    """Records actions instead of injecting them. Used on a Mac and in tests."""

    def __init__(self):
        self.events = []

    def _rec(self, *parts):
        self.events.append(parts)
        log.info("dry-run: %s", " ".join(str(p) for p in parts))

    def move(self, dx, dy):
        self._rec("move", dx, dy)

    def scroll(self, v, h):
        self._rec("scroll", v, h)

    def button(self, name, action):
        self._rec("button", name, action)

    def type_text(self, text):
        typed = "".join(ch for ch in normalise_text(text) if char_to_key(ch))
        self._rec("type", typed)

    def key(self, name, mods):
        self._rec("key", "+".join(list(mods) + [name]))

    def close(self):
        pass


class UInputInjector:
    """Creates a virtual keyboard and a virtual trackpad through /dev/uinput."""

    def __init__(self):
        from evdev import UInput, ecodes  # only exists on Linux
        self.e = e = ecodes
        codes = sorted({getattr(e, n) for n in all_key_names() if hasattr(e, n)})
        self.kb = UInput({e.EV_KEY: codes}, name="Pi Pad Keyboard")

        rel = [e.REL_X, e.REL_Y, e.REL_WHEEL, e.REL_HWHEEL]
        # Hi-res wheel axes give smooth scrolling under libinput. Real mice send
        # both the hi-res value and a classic notch every 120 units; so do we.
        self.hires_v = getattr(e, "REL_WHEEL_HI_RES", None)
        self.hires_h = getattr(e, "REL_HWHEEL_HI_RES", None)
        self.hires = self.hires_v is not None and self.hires_h is not None
        if self.hires:
            rel += [self.hires_v, self.hires_h]
        self.mouse = UInput(
            {e.EV_KEY: [e.BTN_LEFT, e.BTN_RIGHT, e.BTN_MIDDLE], e.EV_REL: rel},
            name="Pi Pad Trackpad",
        )
        self.acc_v = 0
        self.acc_h = 0
        self.buttons = {"left": e.BTN_LEFT, "right": e.BTN_RIGHT, "middle": e.BTN_MIDDLE}

    def move(self, dx, dy):
        e = self.e
        if dx:
            self.mouse.write(e.EV_REL, e.REL_X, dx)
        if dy:
            self.mouse.write(e.EV_REL, e.REL_Y, dy)
        self.mouse.syn()

    def scroll(self, v, h):
        e = self.e
        if self.hires:
            if v:
                self.mouse.write(e.EV_REL, self.hires_v, v)
            if h:
                self.mouse.write(e.EV_REL, self.hires_h, h)
        self.acc_v += v
        self.acc_h += h
        notch_v = int(self.acc_v / 120)
        notch_h = int(self.acc_h / 120)
        if notch_v:
            self.mouse.write(e.EV_REL, e.REL_WHEEL, notch_v)
            self.acc_v -= notch_v * 120
        if notch_h:
            self.mouse.write(e.EV_REL, e.REL_HWHEEL, notch_h)
            self.acc_h -= notch_h * 120
        self.mouse.syn()

    def button(self, name, action):
        code = self.buttons.get(name)
        if code is None:
            return
        e = self.e
        if action == "down":
            seq = [1]
        elif action == "up":
            seq = [0]
        elif action == "double":
            seq = [1, 0, 1, 0]
        else:                                    # click
            seq = [1, 0]
        for value in seq:
            self.mouse.write(e.EV_KEY, code, value)
            self.mouse.syn()

    def _tap(self, code, shift=False):
        e = self.e
        if shift:
            self.kb.write(e.EV_KEY, e.KEY_LEFTSHIFT, 1)
        self.kb.write(e.EV_KEY, code, 1)
        self.kb.syn()
        self.kb.write(e.EV_KEY, code, 0)
        if shift:
            self.kb.write(e.EV_KEY, e.KEY_LEFTSHIFT, 0)
        self.kb.syn()

    def type_text(self, text):
        for ch in normalise_text(text):
            hit = char_to_key(ch)
            if hit:
                name, shift = hit
                self._tap(getattr(self.e, name), shift)

    def key(self, name, mods):
        e = self.e
        held = [getattr(e, MODIFIERS[m]) for m in mods if m in MODIFIERS]
        if name in SPECIAL_KEYS:
            code, shift = getattr(e, SPECIAL_KEYS[name]), False
        else:
            hit = char_to_key(normalise_text(name)[:1]) if name else None
            if not hit:
                return
            code, shift = getattr(e, hit[0]), hit[1]
        if shift:
            held.append(e.KEY_LEFTSHIFT)
        for c in held:
            self.kb.write(e.EV_KEY, c, 1)
        self.kb.write(e.EV_KEY, code, 1)
        self.kb.syn()
        self.kb.write(e.EV_KEY, code, 0)
        for c in reversed(held):
            self.kb.write(e.EV_KEY, c, 0)
        self.kb.syn()

    def close(self):
        self.kb.close()
        self.mouse.close()


def dispatch(injector, msg: dict):
    """Apply one client message. Unknown or malformed messages are ignored."""
    t = msg.get("t")
    if t == "m":
        dx, dy = clamp(msg.get("dx"), MOVE_LIMIT), clamp(msg.get("dy"), MOVE_LIMIT)
        if dx or dy:
            injector.move(dx, dy)
    elif t == "s":
        v, h = clamp(msg.get("v"), SCROLL_LIMIT), clamp(msg.get("h"), SCROLL_LIMIT)
        if v or h:
            injector.scroll(v, h)
    elif t == "b":
        name, action = msg.get("b"), msg.get("a", "click")
        if name in ("left", "right", "middle") and action in ("down", "up", "click", "double"):
            injector.button(name, action)
    elif t == "text":
        text = msg.get("text")
        if isinstance(text, str) and text:
            injector.type_text(text[:MAX_TEXT])
    elif t == "key":
        name = msg.get("key")
        mods = [m for m in msg.get("mods", []) if m in MODIFIERS]
        if isinstance(name, str) and name:
            injector.key(name, mods)


# ---------------------------------------------------------------------------
# PIN
# ---------------------------------------------------------------------------
def load_or_create_pin(path: Path) -> str:
    if path.exists():
        pin = path.read_text().strip()
        if len(pin) == 6 and pin.isdigit():
            return pin
    path.parent.mkdir(parents=True, exist_ok=True)
    pin = f"{secrets.randbelow(10 ** 6):06d}"
    path.write_text(pin + "\n")
    os.chmod(path, 0o600)
    return pin


class Gate:
    """PIN check with a per-address lockout, so six digits cannot be brute-forced."""

    def __init__(self, pin: str, clock=time.monotonic):
        self.pin = pin.encode()
        self.clock = clock
        self.fails = {}                  # addr -> (failures, time the lock lifts)

    def locked(self, addr: str) -> bool:
        count, until = self.fails.get(addr, (0, 0.0))
        return count >= LOCK_AFTER and self.clock() < until

    def check(self, addr: str, attempt) -> bool:
        if self.locked(addr):
            return False
        # compare_digest on str raises for non-ASCII input; bytes never does.
        if isinstance(attempt, str) and hmac.compare_digest(attempt.encode(), self.pin):
            self.fails.pop(addr, None)
            return True
        count, until = self.fails.get(addr, (0, 0.0))
        if count >= LOCK_AFTER and self.clock() >= until:
            count = 0                    # an old lockout has expired: start afresh
        self.fails[addr] = (count + 1, self.clock() + LOCK_SECONDS)
        return False


# ---------------------------------------------------------------------------
# WebSocket (RFC 6455) — just enough for one small JSON message at a time.
# ---------------------------------------------------------------------------
class ProtocolError(Exception):
    pass


def accept_key(client_key: str) -> str:
    digest = hashlib.sha1((client_key + WS_GUID).encode()).digest()
    return base64.b64encode(digest).decode()


def encode_frame(opcode: int, payload: bytes = b"") -> bytes:
    head = bytes([0x80 | opcode])
    n = len(payload)
    if n < 126:
        head += bytes([n])
    elif n < 65536:
        head += bytes([126]) + struct.pack("!H", n)
    else:
        head += bytes([127]) + struct.pack("!Q", n)
    return head + payload


def unmask(data: bytes, mask: bytes) -> bytes:
    return bytes(b ^ mask[i & 3] for i, b in enumerate(data))


async def read_frame(reader: asyncio.StreamReader):
    b0, b1 = await reader.readexactly(2)
    fin, opcode = bool(b0 & 0x80), b0 & 0x0F
    if not b1 & 0x80:
        raise ProtocolError("client frames must be masked")
    n = b1 & 0x7F
    if n == 126:
        (n,) = struct.unpack("!H", await reader.readexactly(2))
    elif n == 127:
        (n,) = struct.unpack("!Q", await reader.readexactly(8))
    if n > MAX_FRAME:
        raise ProtocolError("frame too large")
    mask = await reader.readexactly(4)
    return fin, opcode, unmask(await reader.readexactly(n), mask)


def origin_ok(headers: dict) -> bool:
    """Refuse WebSocket upgrades started by some *other* page in the browser."""
    origin = headers.get("origin")
    if not origin:
        return True                      # not a browser; the PIN still applies
    return urlparse(origin).netloc.lower() == headers.get("host", "").lower()


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------
STATIC = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/manifest.webmanifest": ("manifest.webmanifest", "application/manifest+json"),
    "/icon-180.png": ("icon-180.png", "image/png"),
    "/icon-512.png": ("icon-512.png", "image/png"),
}


class PiPad:
    def __init__(self, injector, gate: Gate, web_dir: Path):
        self.injector = injector
        self.gate = gate
        self.web_dir = web_dir

    async def handle(self, reader, writer):
        addr = (writer.get_extra_info("peername") or ("?",))[0]
        try:
            raw = await asyncio.wait_for(reader.readuntil(b"\r\n\r\n"), timeout=10)
        except (asyncio.TimeoutError, asyncio.IncompleteReadError, asyncio.LimitOverrunError, ConnectionError):
            writer.close()
            return
        lines = raw.decode("latin-1").split("\r\n")
        try:
            method, target, _ = lines[0].split(" ", 2)
        except ValueError:
            writer.close()
            return
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                k, v = line.split(":", 1)
                headers[k.strip().lower()] = v.strip()
        path = urlparse(target).path

        if path == "/ws" and headers.get("upgrade", "").lower() == "websocket":
            await self.websocket(reader, writer, headers, addr)
            return
        await self.static(writer, method, path)

    async def static(self, writer, method, path):
        entry = STATIC.get(path)
        if method != "GET" or entry is None:
            body, status, ctype = b"not found\n", "404 Not Found", "text/plain"
        else:
            try:
                body = (self.web_dir / entry[0]).read_bytes()
                status, ctype = "200 OK", entry[1]
            except OSError:
                body, status, ctype = b"missing file\n", "500 Internal Server Error", "text/plain"
        writer.write(
            (f"HTTP/1.1 {status}\r\nContent-Type: {ctype}\r\n"
             f"Content-Length: {len(body)}\r\nCache-Control: no-store\r\n"
             "X-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n").encode()
            + body
        )
        try:
            await writer.drain()
        finally:
            writer.close()

    async def websocket(self, reader, writer, headers, addr):
        key = headers.get("sec-websocket-key")
        if not key or not origin_ok(headers):
            writer.write(b"HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
            await writer.drain()
            writer.close()
            return
        writer.write(
            ("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n"
             f"Connection: Upgrade\r\nSec-WebSocket-Accept: {accept_key(key)}\r\n\r\n").encode()
        )
        await writer.drain()

        def send(obj):
            writer.write(encode_frame(0x1, json.dumps(obj).encode()))

        authed = False
        parts = []
        log.info("connection from %s", addr)
        try:
            while True:
                fin, op, data = await read_frame(reader)
                if op == 0x8:                                  # close
                    writer.write(encode_frame(0x8))
                    break
                if op == 0x9:                                  # ping
                    writer.write(encode_frame(0xA, data))
                    await writer.drain()
                    continue
                if op == 0xA:                                  # pong
                    continue
                if op in (0x1, 0x2):
                    parts = [data]
                elif op == 0x0:
                    parts.append(data)
                    if sum(len(p) for p in parts) > MAX_FRAME:
                        raise ProtocolError("message too large")
                else:
                    raise ProtocolError(f"opcode {op}")
                if not fin:
                    continue
                try:
                    msg = json.loads(b"".join(parts))
                except ValueError:
                    continue
                if not isinstance(msg, dict):
                    continue
                if not authed:
                    if msg.get("t") == "auth":
                        authed = self.gate.check(addr, msg.get("pin"))
                        send({"t": "auth", "ok": authed,
                              "locked": self.gate.locked(addr),
                              "host": socket.gethostname()})
                        await writer.drain()
                    continue
                if msg.get("t") == "ping":
                    send({"t": "pong"})
                    await writer.drain()
                    continue
                dispatch(self.injector, msg)
        except (asyncio.IncompleteReadError, ConnectionError, ProtocolError) as exc:
            log.info("closed %s (%s)", addr, exc.__class__.__name__)
        finally:
            writer.close()


def lan_addresses():
    out = set()
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        out.add(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    return sorted(out)


async def serve(args):
    web_dir = Path(args.web).resolve()
    pin = load_or_create_pin(Path(args.pin_file).expanduser())
    injector = DryRunInjector() if args.dry_run else UInputInjector()
    app = PiPad(injector, Gate(pin), web_dir)
    server = await asyncio.start_server(app.handle, args.host, args.port, limit=16 * 1024)
    host = socket.gethostname().split(".")[0]
    print(f"Pi Pad {'(dry run) ' if args.dry_run else ''}is listening on port {args.port}")
    print(f"  open on your phone:  http://{host}.local:{args.port}/?pin={pin}")
    for ip in lan_addresses():
        print(f"  or, by address:      http://{ip}:{args.port}/?pin={pin}")
    sys.stdout.flush()
    try:
        async with server:
            await server.serve_forever()
    finally:
        injector.close()


def main(argv=None):
    here = Path(__file__).resolve().parent
    p = argparse.ArgumentParser(description="Phone trackpad and keyboard for a Raspberry Pi")
    p.add_argument("--host", default="0.0.0.0")
    p.add_argument("--port", type=int, default=8765)
    p.add_argument("--web", default=str(here / "web"))
    p.add_argument("--pin-file", default="~/.config/pipad/pin")
    p.add_argument("--dry-run", action="store_true", help="log actions instead of injecting them")
    p.add_argument("-v", "--verbose", action="store_true")
    args = p.parse_args(argv)
    logging.basicConfig(level=logging.INFO if (args.verbose or args.dry_run) else logging.WARNING,
                        format="%(asctime)s %(message)s", datefmt="%H:%M:%S")
    try:
        asyncio.run(serve(args))
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
