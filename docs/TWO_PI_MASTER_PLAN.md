# Two-Pi Master Plan — House Command + NSM Music Rig
*Written 28 Jul 2026. Supersedes the role assignments in BUY_LIST.md (the buy list itself stays valid; deltas are marked below).*

## The one big decision (role swap)

| Pi | Role | OS |
|---|---|---|
| **Existing Pi 5 8GB** (already owned) | **HOUSE Pi** — Home Assistant, all sensors, wall panels, studio_ready verdict | **Home Assistant OS** (flash via Raspberry Pi Imager → "Other specific-purpose OS → Home Assistant") |
| **NEW Pi 5 16GB** (buying tomorrow at Silverline — in stock) | **MUSIC Pi** — Pianoteq 9 Pro + NSM sample engine + 4-channel audio interface rig | **Raspberry Pi OS 64-bit Desktop (Bookworm)**, trimmed by our existing `pi/piano/setup_piano_pi.sh` |

Why the swap: house duty is light CPU; Pianoteq + a sample library loaded into RAM wants the 16GB board. Buy the 16GB, not another 8GB — the price difference is small and sample memory is the whole point.

## MUSIC Pi — "a professional interface with a computer inside"

The honest engineering answer: nobody makes a 4-preamp combo-jack HAT worth trusting. The professional, proven-on-Linux way is a **class-compliant USB interface bolted into the same case** as the Pi. It IS the architecture Pianoteq stage rigs use worldwide.

**The interface (pick one, both are class-compliant = zero drivers on the Pi):**
- **MOTU M6** — the go-for-broke pick. 4 combo XLR/TRS preamps with 48V, 4 line outs + separate monitor out, ESS Sabre32 converters, genuinely pro headphone amp, hardware metering on the front panel. ~₹35–38k (Bajaao / Furtados).
- **Behringer UMC404HD** — the proven-on-Pi workhorse. 4 combo Midas preamps with 48V, 4 TRS outs, phones out, MIDI I/O. ~₹13–16k. The Pi community's default 4-channel choice.

Recommendation: **MOTU M6**. "Professional and trustworthy live" is its exact job description; the UMC404HD is the fallback if stock or budget says so.

**Consequence:** the HiFiBerry DAC2 Pro XLR import is **no longer needed** for this rig — the interface covers outputs with better conversion. If it was already ordered, it becomes the HOUSE Pi's pristine stereo out (chimes/whole-house audio) instead. Do not order it fresh.

**The software stack:**
1. **Pianoteq 9 Pro** (licence owned) — aarch64 Linux build from modartt.com. 48 kHz, 192-sample buffer (~4 ms), multicore max. Proven stable on Pi 5; the Pianoberry project even runs 96 kHz.
2. **NSM Sample Engine** — `sfizz` (open-source SFZ player, ARM-native) + `fluidsynth` for SF2. Loads OUR libraries: Salamander grand (already in the toolchain) + every instrument we sample ourselves.
3. **NSM Sample Player UI** — a touch web app served by the Pi itself on the 7" official Touch Display 2: big preset tiles, volume, tuner, A440, panic. Same dark NSM design language as Studio Command.
4. **Sampling workflow** — the rig records ITSELF: the 4 preamps capture new instruments straight into the Pi, an auto-chop script slices notes into an SFZ, and the new instrument appears as a preset tile. The studio builds its own library over time.
5. **Black-box safety recorder** — every session, the Pi silently records all 4 inputs in crash-proof 30-second chunks (same design as Baithak). A take is never lost because "we weren't recording."

**Case & weatherproofing (transport-grade, Bangalore-buyable):**
- Rig lives on a **shallow 2U/3U rack tray inside an ABS waterproof flight case** (Pelican-style with pressure valve — Amazon.in: "DE Cases" / "Aquapro" IP67 utility case, pick the size after the interface arrives). Pi + interface + PSU strip mounted on the tray; lid closes = rainproof for transport.
- Interface faces outward; all stage connections through **Neutrik locking connectors** (genuine, from mouser.in — avoid Amazon fakes).
- **Argon NEO 5** aluminium case for the Pi itself inside the rack (already on the robu.in list) — fanless, silent.
- Cable strain relief: P-clips + M3 hardware; **3M gaffer tape** (the actual item "down to the nearest piece of tape" — one black 48mm roll, Amazon.in) + velcro cable ties (robu.in).

**Electrical (non-negotiable):**
- Official 27W USB-C PSU for the Pi (Silverline) — never a phone charger.
- One **line-interactive UPS (APC BV1000i-class)** feeding the whole rig strip — Pi, interface, and monitors ride through power cuts and brown-outs.
- A **surge-protected power strip with proper earth** inside the case; have the electrician verify the studio socket's earthing (hum and dead preamps both come from bad earth).
- Everything labelled with a label maker.

## HOUSE Pi — unchanged plan, better screens

Everything in `pi/house/` stands: HA OS, ESPHome ×6 nodes, the studio_ready verdict, the wrapper on port 8126, certified alarms primary.

**Go-for-broke screens (the upgrade):**
| Surface | Screen | Driven by |
|---|---|---|
| Front door (OTP + door sign) | **Waveshare 10.1" HD (G), 1920×1200, optical-bonded toughened glass** — robu.in | Pi Zero 2 W in kiosk mode (~₹1,700) |
| Studio door (state sign) | Same Waveshare 10.1" (G) | Pi Zero 2 W |
| Inside-house board | Old iPad (already panel #3) | — |
| Piano rig onboard | Official Raspberry Pi Touch Display 2, 7" — Silverline, in stock | The MUSIC Pi (DSI) |

The Waveshare (G) is the best panel actually stocked in India: full-HD IPS, 10-point touch, toughened glass that survives a doorway. Each panel just opens `/#/display/<id>` from the app — the Displays page already supports adding panels freely.

## Tomorrow's shopping (one Silverline visit + two online orders)

**Silverline SP Road** (call/WhatsApp 7090939819 first — 139/5 VT Complex, Nagarathpete):
- Raspberry Pi 5 **16GB** (in stock, ~₹10–12k)
- Raspberry Pi Touch Display 2 (7")
- 2× official 27W USB-C PSU
- 2× A2 microSD 64GB (SanDisk Extreme)
- 2× Raspberry Pi Zero 2 W if stocked (else robu.in)
- Micro-HDMI → HDMI cable ×2

**robu.in one order:** everything already on BUY_LIST.md (SEN0232 ×2, LD2410, SW-420 ×5, flame ×4, Argon NEO 5, JSN-SR04T ×2, HX711+load cells) **plus** 2× Waveshare 10.1" HD (G) 1920×1200, 2× Pi Zero 2 W (if Silverline lacked them), velcro tie roll, DIN rail + P-clips.

**Music store (Bajaao online / Furtados):** MOTU M6 (fallback: Behringer UMC404HD).

**Amazon.in:** ABS waterproof flight case (size after interface arrives), 3M gaffer tape black 48mm, APC BV1000i UPS, label tape.

**Electrician list:** unchanged from BUY_LIST.md (panic loop, relays, contactors) + earth verification of the studio socket.

## Now that there are two Pis — the creative layer

1. **Delivery OTP door display goes physical** — the feature already in the app finally gets its 10.1" glass panel at the door.
2. **Black-box recorder** (above) — the studio never loses a take again.
3. **Rig = REAPER remote** — the touch display gets a "Mac mode": transport, arm, marker drop on the recording Mac (we already drive REAPER programmatically).
4. **Tarang wall visuals node** — HOUSE Pi's spare HDMI feeds a TV with MIDI-reactive Tarang visuals during classes/tours.
5. **AirPlay + Spotify Connect receiver** — shairport-sync + librespot on the MUSIC Pi: any phone plays through the studio monitors through the M6.
6. **Calendar-driven states** — Google Calendar class slots auto-set the dial to Class and back; no human forgets the sign.
7. **Nightly session backup** — the MUSIC Pi rsyncs the Mac's REAPER projects to its SSD at 3am; an off-Mac copy always exists.
8. **Groove Metronome / A440 / tuner on the rig screen** — the practice tools live where the piano is.
9. **Voice intercom** — HA Assist on the house Pi: "Class starting" paged to the wall panels.

## 10× Studio Command (software roadmap, in order)

- **Phase A — Go live.** Wrapper on the LAN, `USE_MOCK=false`, panels mounted. Everything below builds on live.
- **Phase B — Music Rig page v2.** Sampler presets, interface gain memory, black-box arm/status, live VU, sampling-session mode.
- **Phase C — Fleet card.** nsm-health feeds device status (Macs, Pis, printers, router) into a Fleet page — one screen answers "is everything in the school alive?"
- **Phase D — Calendar + comms.** Calendar-driven states; WhatsApp/critical notifications on state changes and safety events.
- **Phase E — Net-Sense + energy.** WAN status and per-circuit energy monitoring into House Pulse.
- **Phase F — Doorbell/CCTV.** ESP32-CAM upgrade path to a proper doorbell cam with snapshots in history.

Web app stays the right call: it's internal, every wall panel/iPad/phone/Chrome browser is a client, and the PWA already handles offline + kiosk. A Mac app would only narrow where it runs.
