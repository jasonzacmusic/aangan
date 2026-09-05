"""Contract smoke tests for Aangan Bridge (stdlib only)."""

from __future__ import annotations

import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from contextlib import contextmanager
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest import mock

from pi.house.wrapper import studio_wrapper as bridge


def item(entity_id: str, state: str, **attributes):
    return {
        "entity_id": entity_id,
        "state": state,
        "attributes": attributes,
        "last_changed": "2026-08-12T12:00:00+00:00",
        "last_updated": "2026-08-12T12:00:00+00:00",
    }


def fake_states():
    values = [
        item("input_select.studio_state", "available"),
        item("input_text.studio_state_set_by", "Test"),
        item("input_number.studio_db_threshold", "45"),
        item("sensor.studio_sound_level", "38.5"),
        item("binary_sensor.studio_ready", "on"),
        item("binary_sensor.studio_doors_ok", "on"),
        item("binary_sensor.studio_quiet", "on"),
        item("binary_sensor.studio_sensors_healthy", "on"),
        item("binary_sensor.house_safety_clear", "on"),
        item("binary_sensor.studio_presence", "on"),
        item("binary_sensor.studio_door_leaf_a", "off"),
        item("binary_sensor.studio_door_leaf_b", "off"),
        item("binary_sensor.teaching_door_leaf_a", "off"),
        item("binary_sensor.teaching_door_leaf_b", "off"),
        item("binary_sensor.main_door", "off"),
        item("binary_sensor.house_fire_any", "off"),
        item("binary_sensor.lpg_detector_alarm_contact", "off"),
        item("binary_sensor.panic_loop_broken", "off"),
        item("binary_sensor.kitchen_sink_leak", "off"),
        item("binary_sensor.bathroom_1_leak", "off"),
        item("binary_sensor.geyser_overflow_leak", "off"),
        item("sensor.studio_air_pm2_5", "12.4"),
        item("sensor.studio_air_co2", "612"),
        item("sensor.studio_air_voc_index", "102"),
        item("sensor.studio_air_temperature", "24.1"),
        item("sensor.studio_air_humidity", "57"),
        item("binary_sensor.studio_air_node_online", "on"),
        item("switch.doorbell_chime", "off"),
        item("climate.studio_ac", "off"),
        item("fan.studio_fan", "off"),
        item("fan.dyson_purifier", "on", percentage=50),
        item("switch.water_pump", "off"),
        item("binary_sensor.water_pump_dry_run_protected", "on"),
        item("sensor.dyson_purifier_filter_life", "82"),
    ]
    return {value["entity_id"]: value for value in values}


PIANO = {
    "online": True,
    "preset": "Test Piano",
    "cpuPct": 10,
    "tempC": 45,
    "audioDevice": "Test",
    "sampleRate": 48000,
    "bufferFrames": 192,
    "latencyMs": 4,
    "lastSeen": 1786536000000,
}


@contextmanager
def running_bridge():
    server = ThreadingHTTPServer(("127.0.0.1", 0), bridge.Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)


class PayloadTests(unittest.TestCase):
    def setUp(self):
        self.states = fake_states()

    def test_contract_shapes(self):
        self.assertEqual(bridge.state_info(self.states)["state"], "available")
        self.assertEqual(len(bridge.rooms_payload(self.states)), 5)
        self.assertTrue(bridge.preflight_payload(self.states)["ready"])
        self.assertEqual(set(bridge.safety_payload(self.states)), {"fire", "gas", "panic", "leakKitchen", "leakBath", "leakGeyser", "perimeter"})
        self.assertIn("online", bridge.utilities_payload(self.states)["water"])
        self.assertEqual(bridge.air_payload(self.states)["rooms"][0]["co2"], 612)

    def test_missing_mic_is_not_silence(self):
        del self.states["sensor.studio_sound_level"]
        result = bridge.preflight_payload(self.states)
        self.assertIsNone(result["dbLevel"])
        music = next(room for room in bridge.rooms_payload(self.states) if room["id"] == "music")
        self.assertIsNone(music["dbLevel"])

    def test_exact_open_door_name(self):
        self.states["binary_sensor.studio_door_leaf_b"]["state"] = "on"
        result = bridge.preflight_payload(self.states)
        self.assertEqual(result["openDoorNames"], ["Studio door · leaf B"])
        self.assertEqual(result["openDoors"], ["music"])


class HttpContractTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        bridge.STORE = bridge.Store(f"{self.temporary.name}/state.json")
        bridge.PURGE_UNTIL = None
        bridge.PREP.update({"active": False, "status": "idle", "mutedDoorbell": False, "acOff": False, "fanOff": False})
        self.states = fake_states()
        self.patches = [
            mock.patch.object(bridge, "current_states", return_value=self.states),
            mock.patch.object(bridge, "piano_payload", return_value=dict(PIANO)),
            mock.patch.object(bridge, "call_service", return_value=[]),
            mock.patch.object(bridge, "PIANO_URL", "http://127.0.0.1:9"),
        ]
        for patcher in self.patches:
            patcher.start()

    def tearDown(self):
        for patcher in reversed(self.patches):
            patcher.stop()
        self.temporary.cleanup()

    def get_json(self, base: str, path: str):
        with urllib.request.urlopen(f"{base}{path}", timeout=2) as response:
            self.assertEqual(response.status, 200)
            return json.loads(response.read())

    def post_json(self, base: str, path: str, payload=None):
        request = urllib.request.Request(
            f"{base}{path}",
            data=json.dumps(payload or {}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            self.assertEqual(response.status, 200)
            return json.loads(response.read())

    def test_every_boot_endpoint_answers(self):
        paths = [
            "/api/state",
            "/api/rooms",
            "/api/preflight",
            "/api/preflight/status",
            "/api/safety",
            "/api/doorbell",
            "/api/history",
            "/api/utilities",
            "/api/piano",
            "/api/delivery",
            "/api/displays",
            "/api/sos",
            "/api/fleet",
            "/api/air",
            "/api/health",
        ]
        with running_bridge() as base:
            for path in paths:
                with self.subTest(path=path):
                    self.get_json(base, path)

    def test_live_actions_answer(self):
        actions = [
            ("/api/state", {"state": "class"}),
            ("/api/scene", {"name": "Class mode", "state": "class"}),
            ("/api/settings/db-threshold", {"value": 44}),
            ("/api/preflight/prepare", {}),
            ("/api/preflight/restore", {}),
            ("/api/utilities/action", {"action": "water_pump_toggle"}),
            ("/api/utilities/action", {"action": "purifier_toggle"}),
            ("/api/tone", {"hz": 440}),
            ("/api/piano/cue", {"cue": "next_preset"}),
            ("/api/air/purifier", {"id": "dyson-studio", "mode": "auto"}),
            ("/api/air/purge", {"minutes": 10}),
            ("/api/air/purge/stop", {}),
            ("/api/panic", {}),
            ("/api/sos", {"who": "Test", "message": "Help"}),
            ("/api/sos/clear", {}),
            ("/api/delivery", {"courier": "Test", "otp": "1234", "minutes": 10}),
            ("/api/delivery/clear", {}),
            ("/api/displays/add", {"name": "Test panel"}),
            ("/api/displays/update", {"id": "front-house", "patch": {"content": "clock"}}),
            ("/api/displays/remove", {"id": "not-protected"}),
        ]
        with running_bridge() as base:
            for path, payload in actions:
                with self.subTest(path=path):
                    self.post_json(base, path, payload)

    def test_sos_latches_when_home_assistant_is_down(self):
        with mock.patch.object(bridge, "current_states", side_effect=TimeoutError("ha down")):
            with mock.patch.object(bridge, "call_service", side_effect=TimeoutError("ha down")):
                with running_bridge() as base:
                    payload = self.post_json(base, "/api/sos", {"who": "Amma", "message": "Help"})
                    self.assertTrue(payload["active"])
                    self.assertEqual(payload["who"], "Amma")
                    self.assertEqual(self.get_json(base, "/api/sos")["who"], "Amma")

    def test_invalid_actions_are_rejected(self):
        actions = [
            ("/api/state", {"state": "not-a-state"}),
            ("/api/utilities/action", {"action": "open_everything"}),
            ("/api/piano/cue", {"cue": "shell"}),
            ("/api/air/purifier", {"id": "missing", "mode": "max"}),
        ]
        with running_bridge() as base:
            for path, payload in actions:
                with self.subTest(path=path):
                    request = urllib.request.Request(
                        f"{base}{path}",
                        data=json.dumps(payload).encode(),
                        headers={"Content-Type": "application/json"},
                        method="POST",
                    )
                    with self.assertRaises(urllib.error.HTTPError) as raised:
                        urllib.request.urlopen(request, timeout=2)
                    self.assertEqual(raised.exception.code, 400)

    def test_commissioning_endpoint_is_off_by_default(self):
        with running_bridge() as base:
            request = urllib.request.Request(f"{base}/api/safety/demo", data=b"{}", headers={"Content-Type": "application/json"}, method="POST")
            with self.assertRaises(urllib.error.HTTPError) as raised:
                urllib.request.urlopen(request, timeout=2)
            self.assertEqual(raised.exception.code, 403)

    def test_pump_refuses_to_run_without_physical_protection(self):
        self.states["binary_sensor.water_pump_dry_run_protected"]["state"] = "off"
        with running_bridge() as base:
            request = urllib.request.Request(
                f"{base}/api/utilities/action",
                data=b'{"action":"water_pump_toggle"}',
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with self.assertRaises(urllib.error.HTTPError) as raised:
                urllib.request.urlopen(request, timeout=2)
            self.assertEqual(raised.exception.code, 409)

    def test_sse_initial_snapshot_contains_all_event_types(self):
        with running_bridge() as base:
            with urllib.request.urlopen(f"{base}/api/stream", timeout=2) as response:
                events = []
                while len(events) < 11:
                    line = response.readline().decode()
                    if line.startswith("event: "):
                        events.append(line.removeprefix("event: ").strip())
                self.assertEqual(
                    events,
                    ["state", "rooms", "safety", "utilities", "preflight", "piano", "delivery", "displays", "sos", "fleet", "air"],
                )

    def test_built_pwa_is_served_by_bridge(self):
        web_root = Path(__file__).resolve().parents[3] / "aangan_bridge" / "web"
        self.assertTrue((web_root / "index.html").is_file(), "run npm run build:addon first")
        with mock.patch.object(bridge, "WEB_ROOT", web_root):
            with running_bridge() as base:
                with urllib.request.urlopen(base + "/", timeout=2) as response:
                    html = response.read().decode()
                self.assertIn("Studio Command", html)
                self.assertIn("/assets/", html)


if __name__ == "__main__":
    unittest.main()
