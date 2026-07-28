# What to buy — and what NOT to re-buy (revised 28 Jul 2026)

Silverline Electronics = India's only approved Raspberry Pi channel partner.
SP Road retail: 139/5 VT Complex, opp. Karthik Plaza, Nagarathpete — **call/WhatsApp
7090939819 to confirm stock before the trip**. Online: silverlineelectronics.in.
Sensors and displays come from robu.in.

**Direction change (28 Jul):** the piano rig's audio is now **baked into the Pi** —
Raspberry Pi DAC Pro + official XLR daughter board. No USB interface, no HiFiBerry
import, no Neutrik/soldering kit. The full build is documented in
`docs/PIANO_PI_BUILD_PLAN.html` (order → first note, nothing skipped).

## ✅ Already owned — do NOT buy again

Pi 5 8GB (becomes the **PIANO Pi**) · **Pianoteq Pro licence** · ESP32 ×6 · ESP32-CAM ·
MC-38 reed ×9 · water-leak ×6 · WS2812B strip + aluminium LED channel · 74AHCT level
shifters · 5V SMPS · DHT22 · PIR HC-SR501 ×4 · MQ-2 · INMP441 · jumper/PCB/adapters/
enclosures · acoustic weatherstrip ×4 · old iPad (Wall iPad panel) ·
certified smoke alarms + LPG detector (Amazon).

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
| USB-C cable 5A/100W e-marked, 1m | 2 | Amazon.in | weak cables = under-voltage crashes |
| USB-A → USB-B cable | 1 | SP Road | check the keyboard's socket first (B vs C vs DIN) |
| XLR cables M→F | 2 | pro-audio dealer | rig → console |
| Hard foam-lined transport case | 1 | music store | buy AFTER the boards arrive and are measured — no closed Pi case clears the XLR board |
| Velcro ties, standoffs, label tape, black 3M gaffer 48mm | kit | SP Road / Amazon | strain relief + L/R/power labels |

## 🏠 HOUSE Pi (buy tomorrow at Silverline)

| Item | Qty | Note |
|---|---|---|
| Raspberry Pi 5 8GB | 1 | runs Home Assistant OS — 8GB is plenty |
| Official 27W USB-C PSU | 1 | |
| A2 microSD 64GB | 1 | |
| Raspberry Pi Zero 2 W | 2 | kiosk driver for each fixed display (robu.in if Silverline lacks stock) |
| Micro-HDMI → HDMI cable | 2 | Pi Zero → display |

## 🖥 The two fixed displays (go-for-broke)

| Item | Qty | Source | Note |
|---|---|---|---|
| Waveshare 10.1" HD (G) 1920×1200, optically-bonded toughened glass | 2 | robu.in | one outside the studio door, one at the front door (OTP + sign). Driven by the Pi Zeros in kiosk mode at `/#/display/<id>` |

## 🛒 robu.in sensor order (one order covers everything)

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

## 🚪 Double doors (4 of them) — how the sensors mount

MC-38 reed pairs mount at the **meeting stiles — the middle where the two leaves meet**:
switch on one leaf, magnet on the other. Either leaf opening breaks the contact, so one
sensor covers the whole double door. The owned ×9 covers all 4 double doors + the front
door with spares. The app pairs each door with the room mic: door open + room above the
dB threshold → "Please close the door" appears on the wall panels and phones.

## 🛠 Electrician / low-voltage technician (they source these)

Latching panic switches ×4 (Schneider-type) + NC loop cable + battery-backed sounder ·
volt-free relay modules for the certified alarm contacts · motor contactor + float
switches · any mains relays · **verify the studio socket's earth**. Book a
**low-voltage/fire-alarm technician**, not a general electrician, for the panic loop.

## ❌ Removed from the plan (do not buy)

HiFiBerry DAC2 Pro XLR (replaced by DAC Pro + XLR board) · Neutrik NC3MD connectors ·
project box + soldering kit · any USB audio interface (MOTU/Behringer) — the DAC Pro
build replaces all of it.
