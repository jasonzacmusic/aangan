"""Tests for Pi Pad. Run anywhere — evdev is never imported.

    python3 -m unittest pi/remote/test_pipad.py -v
"""
import asyncio
import json
import os
import struct
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipad  # noqa: E402


def client_frame(opcode, payload: bytes) -> bytes:
    """A browser-style (masked) frame."""
    mask = os.urandom(4)
    n = len(payload)
    head = bytes([0x80 | opcode])
    if n < 126:
        head += bytes([0x80 | n])
    elif n < 65536:
        head += bytes([0x80 | 126]) + struct.pack("!H", n)
    else:
        head += bytes([0x80 | 127]) + struct.pack("!Q", n)
    return head + mask + pipad.unmask(payload, mask)


def feed(data: bytes) -> asyncio.StreamReader:
    r = asyncio.StreamReader()
    r.feed_data(data)
    r.feed_eof()
    return r


class Handshake(unittest.TestCase):
    def test_rfc6455_example(self):
        # The worked example from RFC 6455 section 1.3.
        self.assertEqual(pipad.accept_key("dGhlIHNhbXBsZSBub25jZQ=="),
                         "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=")

    def test_origin(self):
        self.assertTrue(pipad.origin_ok({"host": "pi.local:8765", "origin": "http://pi.local:8765"}))
        self.assertTrue(pipad.origin_ok({"host": "pi.local:8765"}))      # non-browser client
        self.assertFalse(pipad.origin_ok({"host": "pi.local:8765", "origin": "http://evil.example"}))


class Frames(unittest.TestCase):
    def test_encode_length_forms(self):
        self.assertEqual(pipad.encode_frame(1, b"x" * 125)[1], 125)
        self.assertEqual(pipad.encode_frame(1, b"x" * 126)[1], 126)
        self.assertEqual(pipad.encode_frame(1, b"x" * 70000)[1], 127)

    def test_read_masked(self):
        async def go():
            return await pipad.read_frame(feed(client_frame(1, b'{"t":"m"}')))
        fin, op, data = asyncio.run(go())
        self.assertEqual((fin, op, data), (True, 1, b'{"t":"m"}'))

    def test_read_extended_length(self):
        payload = b"a" * 300
        async def go():
            return await pipad.read_frame(feed(client_frame(1, payload)))
        self.assertEqual(asyncio.run(go())[2], payload)

    def test_rejects_unmasked(self):
        async def go():
            await pipad.read_frame(feed(pipad.encode_frame(1, b"hi")))
        with self.assertRaises(pipad.ProtocolError):
            asyncio.run(go())

    def test_rejects_oversized(self):
        head = bytes([0x81, 0x80 | 127]) + struct.pack("!Q", pipad.MAX_FRAME + 1)
        async def go():
            await pipad.read_frame(feed(head + b"\0\0\0\0"))
        with self.assertRaises(pipad.ProtocolError):
            asyncio.run(go())


class Keymap(unittest.TestCase):
    def test_letters_digits(self):
        self.assertEqual(pipad.char_to_key("a"), ("KEY_A", False))
        self.assertEqual(pipad.char_to_key("A"), ("KEY_A", True))
        self.assertEqual(pipad.char_to_key("7"), ("KEY_7", False))

    def test_symbols(self):
        self.assertEqual(pipad.char_to_key("!"), ("KEY_1", True))
        self.assertEqual(pipad.char_to_key("_"), ("KEY_MINUS", True))
        self.assertEqual(pipad.char_to_key("/"), ("KEY_SLASH", False))
        self.assertEqual(pipad.char_to_key("\n"), ("KEY_ENTER", False))

    def test_untypeable(self):
        self.assertIsNone(pipad.char_to_key("é"))
        self.assertIsNone(pipad.char_to_key("🎹"))

    def test_iphone_smart_punctuation(self):
        # iOS turns ' and " into curly quotes and -- into a dash by default.
        self.assertEqual(pipad.normalise_text("it’s “ok” — x"), "it's \"ok\" - x")

    def test_every_name_is_a_real_linux_key(self):
        for name in pipad.all_key_names():
            self.assertTrue(name.startswith("KEY_"), name)


class Dispatch(unittest.TestCase):
    def setUp(self):
        self.inj = pipad.DryRunInjector()

    def send(self, **msg):
        pipad.dispatch(self.inj, msg)

    def test_move_and_clamp(self):
        self.send(t="m", dx=3, dy=-2)
        self.send(t="m", dx=99999, dy=0)
        self.send(t="m", dx=0, dy=0)                       # nothing to do
        self.assertEqual(self.inj.events, [("move", 3, -2), ("move", pipad.MOVE_LIMIT, 0)])

    def test_scroll(self):
        self.send(t="s", v=-240, h=0)
        self.assertEqual(self.inj.events, [("scroll", -240, 0)])

    def test_buttons(self):
        self.send(t="b", b="left", a="click")
        self.send(t="b", b="right", a="double")
        self.send(t="b", b="left", a="down")
        self.send(t="b", b="nose", a="click")              # ignored
        self.send(t="b", b="left", a="explode")            # ignored
        self.assertEqual(self.inj.events, [("button", "left", "click"),
                                           ("button", "right", "double"),
                                           ("button", "left", "down")])

    def test_text_drops_untypeable(self):
        self.send(t="text", text="Hi é!")
        self.assertEqual(self.inj.events, [("type", "Hi !")])

    def test_shortcut(self):
        self.send(t="key", key="c", mods=["ctrl"])
        self.send(t="key", key="Enter", mods=[])
        self.send(t="key", key="Tab", mods=["alt", "hacker"])   # unknown mod dropped
        self.assertEqual(self.inj.events, [("key", "ctrl+c"), ("key", "Enter"), ("key", "alt+Tab")])

    def test_garbage_is_ignored(self):
        for junk in ({}, {"t": "rm -rf"}, {"t": "m", "dx": "abc"}, {"t": "text", "text": 5},
                     {"t": "key", "key": None}):
            pipad.dispatch(self.inj, junk)
        self.assertEqual(self.inj.events, [])


class Lockout(unittest.TestCase):
    def test_locks_then_unlocks(self):
        now = [1000.0]
        gate = pipad.Gate("123456", clock=lambda: now[0])
        for _ in range(pipad.LOCK_AFTER):
            self.assertFalse(gate.check("10.0.0.9", "000000"))
        self.assertTrue(gate.locked("10.0.0.9"))
        self.assertFalse(gate.check("10.0.0.9", "123456"))    # right PIN, still locked
        self.assertTrue(gate.check("10.0.0.8", "123456"))     # other devices unaffected
        now[0] += pipad.LOCK_SECONDS + 1
        self.assertTrue(gate.check("10.0.0.9", "123456"))     # lock lifted

    def test_non_ascii_attempt_does_not_crash(self):
        self.assertFalse(pipad.Gate("123456").check("x", "१२३४५६"))

    def test_pin_file(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "sub" / "pin"
            first = pipad.load_or_create_pin(path)
            self.assertRegex(first, r"^\d{6}$")
            self.assertEqual(oct(path.stat().st_mode & 0o777), "0o600")
            self.assertEqual(pipad.load_or_create_pin(path), first)  # stable across restarts


class EndToEnd(unittest.TestCase):
    """The real server, a raw socket, and the bytes a browser would send."""

    def test_full_session(self):
        async def go():
            with tempfile.TemporaryDirectory() as d:
                (Path(d) / "index.html").write_text("<!doctype html><title>Pi Pad</title>")
                inj = pipad.DryRunInjector()
                app = pipad.PiPad(inj, pipad.Gate("424242"), Path(d))
                server = await asyncio.start_server(app.handle, "127.0.0.1", 0)
                port = server.sockets[0].getsockname()[1]

                # 1. the page itself
                r, w = await asyncio.open_connection("127.0.0.1", port)
                w.write(b"GET / HTTP/1.1\r\nHost: x\r\n\r\n")
                page = await r.read()
                w.close()
                self.assertIn(b"200 OK", page)
                self.assertIn(b"<title>Pi Pad</title>", page)

                # 2. a cross-site page trying to open the socket is refused
                r, w = await asyncio.open_connection("127.0.0.1", port)
                w.write(f"GET /ws HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\n"
                        "Connection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                        "Origin: http://evil.example\r\n\r\n".encode())
                self.assertIn(b"403", await r.read())
                w.close()

                # 3. the real app
                r, w = await asyncio.open_connection("127.0.0.1", port)
                w.write(f"GET /ws HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nUpgrade: websocket\r\n"
                        "Connection: Upgrade\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                        f"Sec-WebSocket-Version: 13\r\nOrigin: http://127.0.0.1:{port}\r\n\r\n".encode())
                head = await r.readuntil(b"\r\n\r\n")
                self.assertIn(b"101 Switching Protocols", head)
                self.assertIn(b"s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", head)

                async def recv():
                    b0, b1 = await r.readexactly(2)
                    return json.loads(await r.readexactly(b1 & 0x7F))

                def send(obj):
                    w.write(client_frame(1, json.dumps(obj).encode()))

                send({"t": "m", "dx": 5, "dy": 5})          # before auth: must be ignored
                send({"t": "auth", "pin": "000000"})
                self.assertFalse((await recv())["ok"])
                send({"t": "auth", "pin": "424242"})
                self.assertTrue((await recv())["ok"])
                send({"t": "m", "dx": 4, "dy": -1})
                send({"t": "b", "b": "left", "a": "click"})
                send({"t": "text", "text": "ls -la\n"})
                send({"t": "key", "key": "c", "mods": ["ctrl"]})
                send({"t": "ping"})
                self.assertEqual((await recv())["t"], "pong")
                w.write(client_frame(8, b""))
                await w.drain()
                w.close()
                server.close()
                await server.wait_closed()
                return inj.events

        events = asyncio.run(go())
        self.assertEqual(events, [("move", 4, -1), ("button", "left", "click"),
                                  ("type", "ls -la\n"), ("key", "ctrl+c")])


if __name__ == "__main__":
    unittest.main()
