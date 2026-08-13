# Aangan — state of the build

**Single source of truth for what physically exists, what is on order, and what is missing.**
Last verified: **13 August 2026**, against vendor email — not against buy lists.

> Read this before recommending any purchase, writing any node config, or telling Jason
> something is "ready". Buy lists in `docs/` describe intentions. This file describes reality.
> If you change hardware or flash a board, update this file in the same commit.

---

## 1. The rule that caused the most damage

An "already owned — do NOT buy again" block in `docs/aangan-FINAL-LIST.html` listed a Raspberry Pi 5,
six ESP32s, an ESP32-CAM, an LED strip, and **certified smoke and LPG alarms** as owned.

**None of it was owned.** Jason confirmed on 13 Aug that nothing existed before this project except
his MacBook. That single wrong assumption hid the total absence of fire and gas protection for weeks,
because every buy list dutifully skipped it.

**Treat that block as void.** This file replaces it.

---

## 2. The six nodes — live

Grouped **by room, not by function.** Wi-Fi unifies the data; it does not unify the wires. Sensors
reach their board by copper, so the board lives in the room with them. This replaced an earlier
function-grouped design that assumed 180 m of two-core cable nobody ever bought.

| Sticker | Room | Board MAC | IP | Config |
|---|---|---|---|---|
| 1 | Studio | `8c:94:df:69:20:20` | 192.168.0.158 | `pi/house/esphome/room-studio.yaml` |
| 2 | Music room | `00:70:07:a2:73:98` | 192.168.0.153 | `room-music.yaml` |
| 3 | Bathrooms A + geyser | `00:70:07:a2:6f:04` | 192.168.0.154 | `node-3-bath-a.yaml` |
| 4 | Bathrooms B + washing machine | `00:70:07:a2:90:dc` | 192.168.0.156 | `node-4-bath-b.yaml` |
| 5 | Kitchen | `88:f1:55:30:7f:84` | 192.168.0.157 | `node-5-kitchen.yaml` |
| 6 | Hall / entrance | `8c:94:df:69:1e:5c` | 192.168.0.159 | `node-6-hall.yaml` |

All six flashed 13 Aug. **36 sensors, no pin conflicts.** Each serves its own web page and announces
its address over USB on boot. Pins 25/26/27 are the doors-and-probes pins on nearly every board.

**There are four bathrooms, not two.** That is why the wet zones need two boards.

### Not yet done on these nodes
- **Nothing is physically wired.** Every board is a brain with no senses attached.
- Nodes 1, 3 and 4 need a 2-minute re-plug to pick up sensors added after they were first flashed.
- **Calibration cannot happen before wiring**: the dBA threshold that means "too loud to record",
  the MQ-6 clean-air baseline (needs 24–48 h powered), the HX711 scale factor, the LD2410 distance
  gates, and confirming reed direction with a real switch.

---

## 3. In the building — verified from the three orders that exist

Only three purchase orders have ever been placed: **Robocraze 351816** (delivered 9 Aug, ₹2,782),
**Robu 3625143** (₹10,842), **Electropi 134503** (₹1,354, still unshipped after 6 days — chase it).
**No Amazon order for this project existed before 13 Aug.**

| Part | Qty | Notes |
|---|---|---|
| ESP32 dev board, 38-pin, CP2102 | 9 | 6 programmed, 3 spare |
| MC-38 reed switches | 12 | 5 used |
| Raindrop / leak probes | 9 | **all 9 allocated, zero spare** |
| MQ-6 gas sensor | 4 | secondary trend sensors only — NOT a safety device |
| DHT22 | 4 | all allocated |
| GY-SHT31-D | 2 | **generic clones — need `heater_enabled: false`** |
| HC-SR501 PIR | 4 | 3 used |
| IR flame sensor | 4 | 3 used |
| SW-420 vibration | 4 | 2 used |
| SEN0232 sound meter | 1 | studio only; the music room's was never bought |
| HLK-LD2410 radar | 1 | studio |
| HX711 + 40 kg load cells | 1 + 4 | LPG cylinder scale |
| ADS1115 16-bit ADC | 2 | unused — see §6, they do not solve the divider problem |
| Breadboards / perfboard | 3 / 6 | |
| Jumper wires | M-F ×80, M-M ×40 | **no female-to-female — two M-F back to back does the job** |
| Resistor kit, KF301 terminals, diodes, transistors | — | |
| microSD | 1 | SanDisk **Ultra (A1)** — the plan wanted 3 × Extreme A2 |
| White ABS enclosures, double-sided tape | — | in hand, confirmed by Jason |

---

## 4. On order — Amazon cart, 13 August, ≈ ₹9,700

| Item | Qty | Delivery |
|---|---|---|
| **Hikvision HF-GP110 LPG detector** — has a **potential-free relay**, so the app can hear it | 1 | 14 Aug am |
| Hikvision HF-S2E photoelectric smoke alarm — **no relay**, standalone only | 2 | 15 Aug |
| GM G+ 20W dual-port USB adapter | 6 | 14 Aug am |
| Micro-USB cable 1 m / 1.5 m | 4 + 4 | 14 Aug am |
| Robodo raindrop sensors | 6 | 14 Aug am |
| PG7 cable glands | 1 pack | 21 Aug |

**Still missing from the cart:** 25–40 m of 3–4 core, ~0.25 mm² (≈23 AWG) sensor wire. Codex rejected
a 40 m 0.25 sq mm cable for not matching "24–26 AWG" — but 0.25 mm² *is* within spec and longer is
fine. **Without this the bathroom probes cannot be fitted at all**: their leads are only 20 cm and the
board must stay outside the wet zone. SP Road sells 4-core alarm cable off the roll for ~₹15/m.

---

## 5. Not bought — in priority order

1. **Relay-output smoke alarms.** The units on order protect the house but cannot talk to the app, so
   node 6's smoke inputs stay unused.
2. **Second SEN0232** (₹4,799) — the music room's sound meter.
3. **WS2812B strip + 74AHCT level shifter** — the recording tally light.
4. **JSN-SR04T ×2** (₹900) — sump and overhead tank levels.
5. **Air sensors: SCD41 ×3, PMS5003 ×3, SGP41 ×3 (≈₹22,500).** Three app features — CO₂ nudge,
   pre-class purge, recording-aware purifying — are **built and shipped with no sensors coming**.
   This was an authoring miss: they exist only in `docs/AANGAN_AIR_PLAN.html` and never reached a buy list.
6. **Both Raspberry Pi 5s, DAC Pro, XLR board, 7" display, tablets, Tapo camera, ESP32-CAM, UPS.**
   Deliberately deferred — see §6.
7. **Technician-only, never DIY:** panic switches, 2-core loop cable, battery sounder, volt-free
   relays, motor contactor + float switches.

---

## 6. Hard-won facts. Do not re-learn these.

- **No Raspberry Pi is required** for the studio work. Each ESPHome node serves its own page over
  Wi-Fi and the app can read it directly. Jason chose to run Pi-free for now. Nodes adopt into Home
  Assistant later without rewiring, so nothing built now is a bet on that decision.
  What a hub *would* add: unattended alerting when no phone is open, and history.
- **`power_save_mode: none` is mandatory.** The house runs a 4-AP mesh; ESP32 default power saving
  drops the association and loops forever — 86,000 retry lines in 20 seconds.
- **`api: reboot_timeout: 0s` is mandatory** with no Home Assistant, or every node reboots every 15
  minutes waiting for a client that will never connect.
- The mesh had **wireless client isolation**: the node reached the internet fine while nothing on the
  LAN could reach it. Diagnose with an outbound HTTP test before blaming firmware.
- **The ADS1115 does NOT remove the MQ-6 voltage dividers.** Reading a 5 V sensor needs VDD = 5 V, and
  at 5 V its I²C logic-high threshold is 3.5 V while the ESP32 drives only 3.3 V. At 3.3 V VDD the
  inputs must stay under 3.6 V. Dividers are required either way.
- **SHT31 boards from Robu are clones** — they reject the heater command and mark the component
  FAILED even when wired correctly. `heater_enabled: false`.
- **Warnings self-heal, failures do not.** An unwired HX711 or DHT22 logs a warning and starts working
  when connected. A failed component stays dead until reboot.
- **Never publish a sensor for hardware that is not wired.** An unconnected ADC pin reports convincing
  nonsense and somebody will believe it. Comment it out with a note instead.
- **MQ-6 modules are not a safety device.** The certified detector is. Never describe them otherwise.

---

## 7. What comes next

**Immediately:** wire the six nodes, then calibrate remotely over Wi-Fi — reed direction, dBA
threshold, radar gates, cylinder scale. The kitchen is the only board needing solder (8 resistors for
the gas dividers) and can be breadboarded for now.

**Then, in Jason's stated priority order:** the Quiet Meter, the Door Board, presence, and the Green
Light — the app combining doors, sound and presence into one "can I record right now?" verdict. Those
four are the studio product and none of them need a Pi.

**Open questions:** whether a hub is ever added (Pi, or the studio Mac mini); whether the air sensors
get bought; and how unattended safety alerting works without a hub — an ESP32 can push to phones
directly through a free service, which is designed but not built.
