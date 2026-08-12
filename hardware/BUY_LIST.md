# What to buy — and what NOT to re-buy (commissioning revision, 12 Aug 2026)

Silverline Electronics = India's only approved Raspberry Pi channel partner.
SP Road retail: 139/5 VT Complex, opp. Karthik Plaza, Nagarathpete — **call/WhatsApp
7090939819 to confirm stock before the trip**. Online: silverlineelectronics.in.
Sensors and displays come from robu.in.

**Direction change (28 Jul):** the piano rig's audio is now **baked into the Pi** —
Raspberry Pi DAC Pro + official XLR daughter board. No USB interface, no HiFiBerry
import, no Neutrik/soldering kit. The full build is documented in
`docs/PIANO_PI_BUILD_PLAN.html` (order → first note, nothing skipped).

## ✅ Already owned — do NOT buy again

Pi 5 8GB (becomes the **PIANO Pi**) · **HOUSE Pi installed with its SD card and ready** · **Pianoteq Pro licence** · ESP32 ×6 · ESP32-CAM ·
MC-38 reed ×9 · water-leak ×6 · WS2812B strip + aluminium LED channel · 74AHCT level
shifters · 5V SMPS · DHT22 · PIR HC-SR501 ×4 · MQ-2 · INMP441 · jumper/PCB/adapters/
enclosures · acoustic weatherstrip ×4 · old iPad (Wall iPad panel) ·
certified smoke alarms + LPG detector (Amazon) · **USB A→B keyboard cable · XLR cables ·
USB-C 100W cables · USB SSD · gaffer tape + velcro ties · studio UPS/power backup
(no APC purchase needed)** (confirmed 29 Jul).

**Ordering rule (29 Jul): BOTH projects are ordered NOW as two separate carts/invoices,
and both Pis are built in parallel.** The intern PDF (`docs/AANGAN_BUY_LIST.html`) is the
canonical clickable list.

## 🎹 PIANO Pi build (the music machine — owned Pi 5 8GB)

| Item | Qty | Source | Note |
|---|---|---|---|
| **Raspberry Pi DAC Pro** (PCM5242, ex-IQaudio) | 1 | robu.in | KEY. Native balanced out, powered from GPIO |
| **XLR daughter board for DAC Pro** | 1 | robu.in / PiShop / import | KEY. **Confirm stock first.** Fallback: DAC Pro RCA → passive stereo DI box |
| 6-pin female header | 1 | robu.in | only if the DAC Pro ships with bare P7/P9 pads |
| Pi Touch Display 2 (7") | 1 | Silverline — in stock | on-rig patch switching |
| Official Pi 5 Active Cooler | 1 | Silverline / robu | fit BEFORE the DAC |
| A2 microSD 64GB (SanDisk Extreme) | 2 | any reputable | one is the cloned spare that lives in the case |
| Official 27W USB-C PSU | 1 | Silverline | studio power |
| 100W USB-C PD power bank | 1 | Amazon.in | stage power |
| Hard foam-lined transport case | 1 | music store | buy AFTER the boards arrive and are measured — no closed Pi case clears the XLR board |

(Cables — keyboard USB A→B, XLR, USB-C 100W — plus USB SSD, gaffer and velcro are
already owned; nothing to buy there.)

## 🏠 HOUSE Pi core (ready — do not re-buy)

The House Pi and its SD card are installed. Before sensor day, confirm its official PSU,
Ethernet/Wi-Fi access, `homeassistant.local:8123`, a reserved router address, and one cloned
spare SD card. Buy a spare card only if the ready system has not yet been cloned.

## 🏠 Remaining house-computer/display items

| Item | Qty | Note |
|---|---:|---|
| Raspberry Pi Zero 2 W | 2 | kiosk driver for each fixed display (robu.in if Silverline lacks stock) |
| Micro-HDMI → HDMI cable | 2 | Pi Zero → display |

## 🖥 The two fixed displays (go-for-broke)

| Item | Qty | Source | Note |
|---|---|---|---|
| Waveshare 10.1" HD (G) 1920×1200, optically-bonded toughened glass | 2 | robu.in | one outside the studio door, one at the front door (OTP + sign). Driven by the Pi Zeros in kiosk mode at `/#/display/<id>` |

## 🛒 Critical sensor-day order

| Item | Qty | Why |
|---|---|---|
| DFRobot SEN0232 Gravity sound level meter | 2 | the trained dBA gate — studio + teaching room |
| **MQ-6 LPG sensor modules** | 4 | one per stove point — MQ-6 is LPG-specific (the owned MQ-2 stays as spare) |
| IR flame sensor modules | 4 | studio, teaching, kitchen, hall |
| Water-leak sensor probes | 6 | owned 6 + these = every sink, stove line and wet point (10–12 total, spares included) |
| HLK-LD2410 mmWave presence | 1 | studio presence |
| SW-420 vibration modules | 5 | perimeter layer |
| JSN-SR04T waterproof ultrasonic | 2 | water tanks (sump + overhead) |
| HX711 + 50 kg load cells | 1 set | LPG cylinder scale |
| Argon NEO 5 case | 1 | if the piano stack won't live in the transport case full-time |

## 🔌 Small parts required before breadboarding

| Item | Qty | Why |
|---|---:|---|
| Solderless breadboards | 6–10 | keep one labelled board per node during acceptance |
| 10 kΩ resistors | 25 | pull-ups and the top leg of 5 V→3.3 V dividers |
| 20 kΩ resistors | 15 | bottom leg of every MQ-6 and ultrasonic divider |
| Fused 5 V USB supplies, ≥1 A | 6 | one stable supply per critical node; MQ heaters do not use ESP32 3V3 |
| USB data cables matching the ESP32 boards | 6 | first flash and diagnosis |
| Lever terminals / screw terminals | 30+ | strain-relieved field cable transitions; no loose Dupont leads in walls |
| Ferrules, labels and heat-shrink | 1 kit each | label both ends; make every installed join serviceable |
| Perfboard or DIN terminal carriers | 6 | move passed circuits off breadboards before permanent installation |
| 10-core alarm cable / low-voltage cable | measured on site | reeds, dry contacts and isolated digital inputs |
| USB-to-serial adapter | 1 | first flash of the owned AI-Thinker ESP32-CAM |

## 🌬 Phase-two air order (optional; does not block tomorrow)

| Item | Qty | Why |
|---|---:|---|
| ESP32 DevKit | 4 | three air nodes + one House Pulse node; existing six remain dedicated to critical nodes |
| PMS5003 | 3 | PM2.5/dust for studio, kitchen and bedroom |
| SCD41 | 3 | true CO₂; purifier alone cannot remove CO₂ |
| SGP41 | 3 | VOC/NOx trend |
| SHT45 breakout | 3 | stable temperature/humidity compensation |

If budget is tight, build the **studio air node first** and buy the other two sets after it
has run for a week. The two JSN-SR04T, HX711/load-cell set and owned DHT22 already cover
the House Pulse sensor parts; the extra ESP32 above completes it.

## 🚪 Double doors (4 of them) — how the sensors mount

Use **two reeds per monitored double door: one for each leaf**. Mount each reed on the
frame and its magnet on that leaf. A single pair placed across the meeting stiles cannot
identify the open leaf and can miss some two-leaf movement. The current critical firmware
uses four owned reeds for the studio and teaching doors; the remaining five cover the
front/balcony doors with two spares. The app pairs the leaves with the room mic: leaf open
+ room above the dB threshold → "Please close the door" appears on panels and phones.

## 🛠 Electrician / low-voltage technician (they source these)

Latching panic switches ×4 (Schneider-type) + NC loop cable + battery-backed sounder ·
volt-free relay modules for the certified alarm contacts · motor contactor + float
switches · any mains relays · **verify the studio socket's earth**. Book a
**low-voltage/fire-alarm technician**, not a general electrician, for the panic loop.

## ❌ Removed from the plan (do not buy)

HiFiBerry DAC2 Pro XLR (replaced by DAC Pro + XLR board) · another House Pi or SD card (unless no clone exists) · Neutrik NC3MD connectors ·
project box + soldering kit · any USB audio interface (MOTU/Behringer) — the DAC Pro
build replaces all of it.
