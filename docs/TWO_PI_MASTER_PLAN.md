# Two-Pi Master Plan — v2 (28 Jul 2026)
*Supersedes v1 entirely. Direction locked by Jason: the music Pi's audio is BAKED IN
(Raspberry Pi DAC Pro + XLR daughter board) — no external USB interface, no HiFiBerry.*

## The two machines

| Pi | Role | OS |
|---|---|---|
| **Owned Pi 5 8GB** | **PIANO Pi** — Pianoteq Pro stage/studio instrument, balanced XLR out | Raspberry Pi OS 64-bit Desktop (Bookworm) |
| **New Pi 5 8GB** (buying tomorrow, Silverline) | **HOUSE Pi** — Home Assistant, every sensor, wall panels, SOS, studio_ready | Home Assistant OS |

Plus **2× Pi Zero 2 W** driving the two fixed displays in kiosk mode.

## PIANO Pi — the complete build

The authoritative step-by-step (order → first note, 16-point test checklist) is
**`docs/PIANO_PI_BUILD_PLAN.html`** in this repo. Summary:

- **Signal chain:** MIDI keyboard → USB → Pi 5 → Pianoteq Pro (models the piano) →
  **Raspberry Pi DAC Pro** (PCM5242, 24-bit/192k, native balanced 0–4V RMS) →
  **official XLR daughter board** on P7/P9 → 2× XLR → console/DI. RCA stays free as a
  parallel second output; headphone socket on the DAC for monitoring.
- **Before ordering:** confirm the XLR board's India stock (robu.in); ask if the DAC Pro
  revision has pre-soldered P7/P9 headers; check the keyboard's USB socket type; do NOT
  buy a closed case until the stack is measured (the XLR board sits above the USB ports).
- **Fallback if the XLR board can't be sourced:** DAC Pro RCA → passive stereo DI box.
  Still balanced XLR to the desk, still no soldering.
- **Software:** Pi OS 64-bit Desktop → `pi/piano/setup_piano_pi.sh` (overlay for the
  IQaudio/DAC Pro family instead of HiFiBerry — the script's config.txt lines change to
  `dtoverlay=iqaudio-dacplus`; verify the exact overlay name against current Pi docs at
  build time) → Pianoteq ARM build, 48 kHz, start at 256 buffer and walk down →
  auto-start full-screen → clone the microSD to the spare card.
- **Power:** official 27W PSU in the studio, 100W PD power bank on stage, both through
  5A e-marked cables. Whole rig lives in a foam-lined hard case, labelled L/R/power/MIDI.
- The `piano_status_server.py` service is unchanged — the house app still shows preset,
  CPU, temperature and cues the tally on Rec states.

## HOUSE Pi — what tomorrow's setup covers

Install order stays as `pi/house/README.md` (HA OS → ESPHome ×6 → package → phones →
wrapper on port 8126 → panels). The revision adds four feature areas, **all already
built into the app** (shipped 28 Jul):

1. **Four double doors, acoustically guarded.** MC-38 reed at each door's meeting
   stiles (middle of the two leaves — either leaf opening trips it). The app pairs
   doors with the room mic: door open + sound above the recording threshold →
   **"Please close the door"** banner on phones and on the wall panels, with hysteresis
   so it never flickers.
2. **Two fixed displays** — 10.1" Waveshare full-HD panels on Pi Zero 2 W kiosks:
   - **Front door:** state-aware door sign + the delivery OTP takeover.
   - **Studio door:** ON AIR / class sign + the close-the-door nudge.
3. **Delivery hand-off, two taps.** Courier chips (Swiggy, Instamart, Blinkit, Zepto,
   Zomato, Amazon, BigBasket, Porter), one-tap message presets, a standing-directions
   line that rides under every hand-off, OTP huge on the door screen with auto-expiry.
4. **Family SOS.** `/#/sos` is a home-screen bookmark on Amma's, Jason's and brother's
   phones (all on the Nathaniel School Wi-Fi). One hold: every phone rings through
   silent mode (HA Companion critical alerts), all signs flash violet, every wall panel
   shows WHO needs help and their message, history logs it. "I'm OK" stands the house
   down. The 4 physical latching panic switches (electrician list) feed the same flow
   for anyone without a phone in hand.

### Sensor roster (final)

| Layer | Hardware | Count |
|---|---|---|
| Doors | MC-38 reed at meeting stiles | 4 double doors + front door (owned ×9) |
| Stoves — gas | MQ-6 LPG modules | 4 (buy) + certified LPG alarm (primary) |
| Fire | IR flame ×4 + certified smoke/heat alarms | 4 zones |
| Water | leak probes at every sink/stove line/wet point | owned 6 + buy 6 |
| Sound | SEN0232 dBA meters (studio + teaching), INMP441 pilot | 2 |
| Presence | mmWave LD2410 (studio) + PIR ×4 | 5 |
| Perimeter | SW-420 vibration | 5 |
| Tanks/LPG | JSN-SR04T ×2 + HX711 scale | next phase |
| Climate | DHT22, AQI on House Pulse | existing |

### Creative layer (both Pis, ranked)

1. Calendar-driven states — class slots auto-set the dial, no human forgets the sign.
2. Doorbell cam upgrade path — ESP32-CAM snapshot already in the app; Frigate later.
3. Tarang visuals node — HOUSE Pi HDMI → TV, MIDI-reactive visuals during classes.
4. AirPlay/Spotify Connect on the PIANO Pi (shairport-sync + librespot) → console.
5. Nightly REAPER-project rsync from the Mac to a Pi SSD — an off-Mac backup always.
6. Washing-machine-done / fridge-door-open nudges from spare SW-420 + reed + DHT22.
7. "Class starting" paging to wall panels via HA Assist.
8. Rig touch screen "Mac mode" — transport/arm/marker for REAPER over the network.

## App status (28 Jul)

SOS + delivery quick-flow + door nudge shipped and verified in mock; the Pi wrapper
contract for `/api/sos` is documented in `src/api/liveAdapter.ts` and the README.
Repo renamed **aangan** (the courtyard — where the family and the music meet).
