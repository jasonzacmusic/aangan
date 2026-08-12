# Aangan sensor day — install and breadboard guide

Use this in order. Do not mount a sensor until its breadboard test passes and the exact entity is visible in Home Assistant.

## 1. Table layout

```text
Laptop USB ── ESPHome flash ──► ESP32 on breadboard
                                   │
            RED = 5 V / 3V3  ─────┤
          BLACK = common GND ─────┤
          GREEN = signal GPIO ────┘

Home Assistant :8123  ◄── encrypted ESPHome API ── ESP32
       │
       └── Aangan Bridge + live app :8126 ── every phone/tablet
```

Keep separate trays for each node. Label the ESP32 and every cable at both ends before moving to the next node.

## 2. What goes on the Mac and House Pi

| Place | Install | Why |
|---|---|---|
| House Pi / Home Assistant | ESPHome Device Builder | Compile, flash, adopt and update ESP32 nodes |
| House Pi / Home Assistant | File editor or Samba share | Copy package and edit secrets |
| House Pi / Home Assistant | Aangan Bridge | Live app + API on port 8126 |
| Every family phone | Home Assistant Companion | Repeating critical alerts |
| Every control device | Aangan PWA from port 8126 | House control; add to home screen |
| Studio Mac | Existing `mac-agent/record_gate.py` + REAPER script | Uses the same `studio_ready` verdict |

Do not install Docker, Node, Python or a systemd wrapper on Home Assistant OS. Aangan Bridge contains and starts the runtime itself.

Keep port 8126 on the trusted home LAN and never port-forward it. Plain HTTP is
enough for tomorrow's controls and a home-screen shortcut. Browser-managed
offline updates require trusted HTTPS; add that later through the chosen
VPN/reverse-proxy route.

## 3. Before power

- Use one current-limited, fused 5 V USB supply per breadboard node; do not power many MQ heaters from the ESP32 regulator.
- Join sensor and ESP32 grounds unless the input is deliberately opto-isolated.
- ESP32 GPIO is 3.3 V only. Divide any possible 5 V signal before it reaches a GPIO.
- Keep mains, 12 V alarm loops, pumps, contactors and unknown relay outputs away from the table.
- Use only the certified alarm's volt-free contact for acceptance. MQ-6 modules are secondary trend sensors.

## 4. Flash loop — repeat for every board

1. In ESPHome, copy the matching YAML from `pi/house/esphome/`.
2. Click **Validate**. The committed files pass ESPHome 2026.7.4.
3. Connect one board by USB and click **Install → Plug into this computer**.
4. Open **Logs** and wait for `API connection established`.
5. Home Assistant → Settings → Devices & services: adopt the discovered device.
6. Perform every input test below. Confirm the entity name, not merely a changing voltage.
7. Mark the node passed in Aangan → More → Install & test.

## 5. Six critical nodes

### Node 1 — Studio doors

File: `studio-doors.yaml` · parts: one ESP32, four MC-38 reed switches.

| GPIO | Input | Breadboard connection | Pass test |
|---:|---|---|---|
| 25 | Studio leaf A | reed between GPIO and GND | jumper in = closed; out = open |
| 26 | Studio leaf B | reed between GPIO and GND | same |
| 32 | Teaching leaf A | reed between GPIO and GND | same |
| 33 | Teaching leaf B | reed between GPIO and GND | same |

Mount one reed per leaf, not one across the middle of both leaves. Open each leaf by itself; Aangan Pre-flight must name the exact open leaf.

### Node 2 — Studio sense

File: `studio-sense.yaml` · parts: one ESP32, SEN0232 ×2, LD2410, WS2812B strip, 74AHCT level shifter.

| GPIO | Device | Wire |
|---:|---|---|
| 34 ADC | Studio SEN0232 analogue | SEN signal → GPIO34; 5 V + GND to sensor |
| 35 ADC | Teaching SEN0232 analogue | SEN signal → GPIO35; 5 V + GND to sensor |
| 16 RX / 17 TX | LD2410 | LD2410 TX → 16, RX → 17; 5 V + GND |
| 18 | Tally data | GPIO18 → 74AHCT input → WS2812 DIN |

The firmware conversion is `dBA = volts × 50`: 0.6 V is about 30 dBA and 2.6 V about 130 dBA. Speak near each meter and confirm it moves without pinning at an endpoint. Stand still in front of LD2410 for 20 seconds; presence must remain on. Power the strip from its 5 V supply, join grounds, then test the Home Assistant light.

### Node 3 — Kitchen safety

File: `kitchen-safety.yaml` · parts: one ESP32, certified LPG alarm contact, flame module, leak probe, MQ-6 ×4.

| GPIO | Input | Important connection |
|---:|---|---|
| 25 | Certified LPG dry contact | volt-free contact to GPIO/GND only |
| 26 | Kitchen flame D0 | digital output to GPIO |
| 32 | Kitchen sink leak | probe output to GPIO |
| 34/35/36/39 ADC | MQ-6 AO ×4 | AO → 10 kΩ → GPIO; GPIO → 20 kΩ → GND |

Each MQ-6 heater uses 5 V and can draw roughly 150 mA. Use the external supply, common ground, and the divider above. With mains absent, close the certified detector's dry contact: `LPG detector alarm contact` must alert. Bridge flame D0 to GND, then touch only the leak probe with a damp cloth. Never test with loose gas or flame at the table; use the certified alarm test function after installation.

### Node 4 — Wet zones

File: `wet-zones.yaml` · parts: one ESP32, eight leak probes.

| GPIO | Named point |
|---:|---|
| 25 / 26 | Bathroom 1 / Bathroom 2 |
| 32 / 27 | Geyser overflow / washing machine |
| 33 / 34 | Studio sink / teaching sink |
| 35 / 39 | House sink / floor drain |

Every probe goes between its GPIO and GND. Add an external 10 kΩ pull-up from GPIO34, GPIO35 and GPIO39 to 3.3 V; those pins have no internal pull-up. Test one at a time with a damp cloth, confirm the exact label, dry it, and confirm clear.

### Node 5 — Perimeter

File: `perimeter.yaml` · parts: one ESP32, three reeds, SW-420 ×5, PIR ×4.

| GPIO | Inputs |
|---:|---|
| 25 / 26 / 27 | main door / studio balcony / house balcony reeds |
| 32 / 33 / 34 / 35 / 39 | main door / balcony / studio window / house window / rear vibration |
| 13 / 14 / 18 / 19 | entrance / hall / kitchen / bedroom PIR |

Open each reed. Tap each vibration module once and confirm the entity holds for three seconds, then clears. Walk across each PIR field and wait for its module delay to clear. Repeat a vibration test while the studio is in Audio Rec and confirm the phone notification.

### Node 6 — Panic and alarm listener

File: `panic-loop.yaml` · parts: one ESP32, isolated panic output, two smoke dry contacts, three flame modules, optional low-voltage chime relay.

| GPIO | Input/output |
|---:|---|
| 25 | isolated panic-loop output |
| 26 / 27 | studio-flat / house-flat smoke dry contacts |
| 32 / 33 / 21 | studio / teaching / hall flame D0 |
| 23 | low-voltage chime relay output |

The technician first proves the 12 V NC loop and battery sounder with the Pi completely off. At the isolated ESP32 side, open GPIO25 to trigger panic. Close each smoke dry contact, then bridge each flame D0 input. Every test must identify the source, set Emergency, and ring every required phone. Stand down only after the physical input clears.

## 6. Expansion nodes

### Entrance camera

File: `doorbell-cam.yaml` · one AI-Thinker ESP32-CAM.

For first flash, cross USB-to-serial TX/RX, power the board at 5 V/GND, and tie GPIO0 to GND. Flash; remove the GPIO0 jumper; reset. Adopt the camera, then verify a current image in Aangan Safety. Do not leave GPIO0 grounded for normal boot.

### Air quality — repeat three times

File: `air_node.yaml` · one ESP32 plus PMS5003, SCD41, SGP41 and SHT45 per room.

| Bus | Connection |
|---|---|
| I²C | SDA → GPIO21, SCL → GPIO22; SCD41 + SGP41 + SHT45 share the bus at 3.3 V |
| UART | PMS5003 TX → GPIO16; PMS5003 powered at 5 V |

Change `room` and `room_name` before each flash: studio, kitchen, bedroom. The log's I²C scan must find all three I²C devices. Breathe near SCD41 and watch CO₂ rise after its update interval. Treat VOC/NOx as settling data, not an instant pass/fail reading.

### House Pulse

File: `house-pulse.yaml` · one ESP32, JSN-SR04T ×2, HX711/load cells, DHT22.

| GPIO | Device |
|---:|---|
| 25 trigger / 34 echo | sump ultrasonic |
| 26 trigger / 35 echo | overhead ultrasonic |
| 18 data / 19 clock | HX711 |
| 23 | DHT22 data |

Both ultrasonic echoes are 5 V: ECHO → 10 kΩ → GPIO; GPIO → 20 kΩ → GND. Compare distance to a tape measure against a flat target. After mounting, edit all four empty/full distance substitutions. For LPG weight, record HX711 raw empty and with a known mass, then add `calibrate_linear`. Leave pump control locked until an electrician proves float/high-level and dry-run cut-offs without Home Assistant.

## 7. End-of-day acceptance

| Test | Expected result |
|---|---|
| Unplug each of six critical ESP32s, one at a time | Critical nodes becomes red; recording is blocked |
| Open every studio/teaching leaf separately | Exact leaf shown; recording is blocked |
| Raise room sound above threshold | Quiet becomes red immediately |
| Fire/gas/panic/leak simulated at isolated input | Emergency + repeating critical phone alerts |
| Power-cycle router and House Pi | Nodes reconnect; Aangan Bridge auto-starts |
| Disconnect optional camera/air/House Pulse | UI says Not connected; it does not fabricate a healthy number |
| Press Silence the room | Only ready after configured doorbell/AC/fan confirm off |
| Put phone on silent and lock it | Critical safety test still sounds, if OS permission allows |

Photograph each passed breadboard and its Home Assistant entity before mounting. That becomes the wiring record for the team.
