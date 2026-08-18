# Aangan — project brief and state of the build

**Single source of truth for what this project is, what physically exists, and what is missing.**
Last verified: **14 August 2026**, against vendor email and the boards themselves — not against buy lists.

> Read this before recommending a purchase, writing a node config, or telling anyone something is
> ready. Buy lists in `docs/` describe intentions. This file describes reality. If you change
> hardware or flash a board, update this file in the same commit.

---

## 1. What Aangan is

A music school and home in Langford Town, Bangalore, where the **studio's state drives the whole
building**. Six states — Available, Class, Meeting, Audio Rec, Video Rec, Emergency — change what
the house does, what the door signs say, and whether recording is allowed to start.

Two halves that are often confused:

- **The sensing layer** — six ESP32 boards, one per room, each serving its own live web page over
  Wi-Fi. **This is real and working.**
- **The app** (React PWA, `studio-command.vercel.app`) — beautiful, installable, and currently
  **running on simulated data**. It was built to talk to a Raspberry Pi bridge that was never bought.

Bridging those two is the single biggest piece of unfinished work.

---

## 2. The rule that caused the most damage

An "already owned — do NOT buy again" block in `docs/aangan-FINAL-LIST.html` listed a Raspberry Pi 5,
six ESP32s, an ESP32-CAM, an LED strip, and **certified smoke and LPG alarms** as owned.

**None of it was owned.** Jason confirmed on 13 Aug that nothing existed before this project except
his MacBook. That one wrong assumption hid the total absence of fire and gas protection for weeks,
because every buy list dutifully skipped what was marked owned.

**Treat that block as void.** This file replaces it.

---

## 3. Goals, with honest status

### Working or nearly there
| Goal | Status |
|---|---|
| Know which door is open, by leaf | **Working** — board 1 confirmed, correct polarity |
| Live decibel level in the studio | **Working** — 46.6 dBA read on real hardware |
| Leak detection at 9 points | Firmware done; one probe's DO wire still being traced |
| Room climate / instrument humidity guard | Firmware done; **sensors need soldering** (see §7) |
| Gas trend sensing in the kitchen | Firmware done; needs dividers + 24–48 h burn-in |
| Fire sensing (flame modules) | Firmware done, not wired |
| Light security — main door, motion, vibration | Firmware done, not wired |
| Gas cylinder weight | Firmware done; someone must build the platform and calibrate |
| Doorbell button | Firmware done, not wired |
| Washing-machine-finished | Firmware done, not wired |

### The recording gate — the actual product
**"Can I record right now?"** = doors shut + room quiet + presence + nodes alive.
Three of the four inputs exist on board 1 today. **The combining logic does not exist yet** — it
belongs in the app, and the app cannot see the boards. This is the top priority after wiring.

### Not started, and each has a hidden dependency
| Goal | Blocked by |
|---|---|
| **Phone alerts when nobody has the app open** | Needs an ESP32 to push notifications itself. Designed, not built. **This is the honest safety gap.** |
| **The app reading real sensors** | HTTPS app cannot read HTTP boards — see §8 |
| Door displays / tablets | Nothing bought, and a socket problem nobody costed — see §6 |
| Recording tally light | LED strip + level shifter were on the false "owned" list |
| History and trends | An ESP32 has no storage. Needs a hub of some kind. |
| Air quality — CO₂, dust, VOC | Three app features shipped with **no sensors ever ordered** (₹22,500) |
| Water tank levels, pump control | Sensors not bought; pump needs a licensed technician |
| Doorbell camera | Needs an ESP32-CAM, a different board type |

---

## 4. The six nodes — live

Grouped **by room, not by function.** Wi-Fi unifies the data; it does not unify the wires. Sensors
reach their board by copper, so the board lives in the room. This replaced an earlier
function-grouped design that assumed 180 m of two-core cable nobody ever bought.

| Sticker | Room | Board MAC | Address | Config |
|---|---|---|---|---|
| 1 | Studio | `8c:94:df:69:20:20` | **192.168.0.250** (static) | `room-studio.yaml` |
| 2 | Music room | `00:70:07:a2:73:98` | **192.168.0.251** (static) | `room-music.yaml` |
| 3 | Bathrooms A + geyser | `00:70:07:a2:6f:04` | **192.168.0.252** (in yaml — reflash) | `node-3-bath-a.yaml` |
| 4 | Bathrooms B + washing machine | `00:70:07:a2:90:dc` | **192.168.0.253** (in yaml — reflash) | `node-4-bath-b.yaml` |
| 5 | Kitchen | `88:f1:55:30:7f:84` | **192.168.0.254** (in yaml — reflash) | `node-5-kitchen.yaml` |
| 6 | Hall / entrance | `8c:94:df:69:1e:5c` | **192.168.0.249** (in yaml — reflash) | `node-6-hall.yaml` |

All six flashed. **36 sensors, no pin conflicts.** Each serves its own page and announces its address
over USB on boot. Pins 25/26/27 are the doors-and-probes pins on nearly every board.

**There are four bathrooms, not two** — that is why the wet zones need two boards.
**Boards 1 and 2 are currently at DEBUG log level** so sensor changes can be read over USB while
wiring. Set back to INFO once each room is signed off.

### Still to do on these nodes
- **Most sensors are not physically wired yet.**
- Assign static addresses to boards 3–6 (now in the yaml: `.252`, `.253`, `.254`, `.249`) and reflash.
- **Calibration, which can only happen after wiring:** the dBA threshold that means "too loud",
  the MQ-6 clean-air baseline, the HX711 scale factor, and the LD2410 distance gates.

---

## 5. In the building — verified from the three orders that exist

Purchase orders: **Robocraze 351816** (₹2,782), **Robu 3625143** (₹10,842),
**Electropi 134503** (₹1,354, one 27W Pi supply, unshipped), **Amazon 13 Aug** (₹9,700, below).

| Part | Qty | Notes |
|---|---|---|
| ESP32 dev board, 38-pin, CP2102 | 9 | 6 programmed, 3 spare |
| MC-38 reed switches | 12 | 5 used |
| Raindrop / leak probes | 9 + 2 on order | all 9 allocated |
| MQ-6 gas sensor | 4 | secondary trend sensors only — NOT a safety device |
| DHT22 | 4 | all allocated |
| GY-SHT31-D | 2 | **clones, and shipped "unwelded" — pins need soldering** |
| HC-SR501 PIR | 4 | 3 used |
| IR flame sensor | 4 | 3 used |
| SW-420 vibration | 4 | 2 used |
| SEN0232 sound meter | 1 | studio only; the music room's was never bought |
| HLK-LD2410 radar | 1 | studio |
| HX711 + 40 kg load cells | 1 + 4 | LPG cylinder scale |
| ADS1115 16-bit ADC | 2 | unused — see §8, they do not solve the divider problem |
| Breadboards / perfboard | 3 / 6 | |
| Jumper wires | M-F ×80, M-M ×40 | **no female-to-female — two M-F back to back does the job** |
| microSD | 1 | SanDisk **Ultra (A1)** — the plan wanted 3 × Extreme A2 |
| White ABS enclosures, double-sided tape | — | in hand, confirmed by Jason |

**Amazon order, 13 Aug:** Hikvision HF-GP110 LPG detector **with a potential-free relay** (the one
input that actually matters), 2 × Hikvision HF-S2E smoke alarms (**no relay** — they protect the
house but cannot talk to the app), 6 × 20W dual-port USB adapters, 8 × micro-USB cables,
2 × leak probes, PG7 glands.

---

## 6. The displays — the piece nobody costed

The app has a whole panel system built (`src/pages/Displays.tsx`, `DisplayPanel.tsx`, routes at
`/#/display/<id>`) supporting Door sign, Studio state, House board, Doorbell cam, Custom message and
Clock — plus the **delivery OTP hand-off** (Swiggy, Zomato, Blinkit and five more).

**None of the hardware exists, and three costs were never counted:**

| Item | Approx | Note |
|---|---|---|
| Tablet, 8.7" Wi-Fi ×2 | ₹20,000 | Galaxy Tab A9 or Lenovo Tab M9 |
| Screw-in wall mount ×2 | ₹1,400 | theft-resistant beside each door |
| Flat USB-C cable + charger ×2 | ₹1,000 | run under trunking |
| **Fully Kiosk Browser licence ×2** | **~₹1,400** | **never costed.** Locks the tablet to one page, stops sleep, auto-restarts. Without it a tablet is not a wall panel. |
| **A mains socket at each door** | **unknown** | **never costed, and it is the one item that may need an electrician** |

**Three things to settle before buying any tablet:**
1. **Is there a socket within cable reach of the studio door and the front door?** If not, that is
   the only part of this project that needs an electrician — exactly the thing we told Jason he could
   avoid. Check this first; it changes the plan.
2. **A display showing simulated data is worse than no display.** The app must read the real boards
   before a tablet goes on a wall. See §8.
3. Disable Android battery optimisation for Fully Kiosk, or the OS kills it overnight.

---

## 7. Blocked on soldering

Jason has said a third party does the soldering. Two things wait on that person:

1. **Both GY-SHT31-D sensors.** The Robu line reads "**Unwelded** GY-SHT31-D" — the pin header ships
   loose. An I²C bus scan on board 1 returned **"Found no devices"**, confirming no electrical
   contact. Four joints each. Until then, temperature and humidity read NA on boards 1 and 2.
2. **The four MQ-6 voltage dividers** on board 5 — two resistors per sensor. Can be breadboarded for
   testing, but not left that way near a hob.

Everything else on all six boards is push-fit.

---

## 8. Hard-won facts. Do not re-learn these.

- **No Raspberry Pi is required** for the sensing layer. Each ESPHome node serves its own page over
  Wi-Fi. Jason chose to run Pi-free. Nodes adopt into Home Assistant later without rewiring, so
  nothing built now is a bet on that decision. What a hub *would* add: unattended alerting, history.
- **`power_save_mode: none` is mandatory.** The house runs a 4-AP mesh; ESP32 default power saving
  drops the association and loops forever — 86,000 retry lines in 20 seconds.
- **`api: reboot_timeout: 0s` is mandatory** with no Home Assistant, or every node reboots every
  15 minutes waiting for a client that will never connect.
- **Use static addresses.** DHCP moved board 1 three times in two days (.158 → .169 → .179),
  breaking every bookmark and wasting real time. Observed DHCP range reaches .187; statics start
  at .250.
- **HTTPS cannot read HTTP.** The app is served over HTTPS from Vercel; the boards speak plain HTTP
  on the LAN. Browsers block that. Connecting them needs the app served locally over HTTP, or
  something on the network in between. This is the main obstacle to the app reading real sensors.
- The mesh had **wireless client isolation** at one point: the node reached the internet fine while
  nothing on the LAN could reach it. Diagnose with an outbound HTTP test before blaming firmware.
- **Chrome auto-upgrades typed addresses to https**, which makes a node look dead. Always type
  `http://` explicitly.
- **The ADS1115 does NOT remove the MQ-6 voltage dividers.** Reading a 5 V sensor needs VDD = 5 V,
  and at 5 V its I²C logic-high threshold is 3.5 V while the ESP32 drives only 3.3 V.
- **SHT31 boards from Robu are clones** — they reject the heater command and mark the component
  FAILED even when wired correctly. `heater_enabled: false`.
- **Warnings self-heal, failures do not.** An unwired HX711 or DHT22 logs a warning and starts
  working when connected. A failed component stays dead until reboot.
- **Never publish a sensor for hardware that is not wired.** An unconnected ADC pin reports
  convincing nonsense — the studio sound level read "7.1 dBA" before its meter was attached, and a
  believable-looking number is worse than a blank.
- **MQ-6 modules are not a safety device.** The certified detector is. Never describe them otherwise.
- `secrets.yaml` is gitignored and local-only. It was **not** ignored when first created — a real
  Wi-Fi password nearly went public. Anyone cloning this repo must create it from
  `secrets.example.yaml`.

---

## 9. What comes next, in order

1. **Wire the six rooms.** Boards 1 and 2 are in progress. Everything is push-fit except §7.
2. **Static addresses on boards 3–6**, so no bookmark ever breaks again.
3. **Calibrate** — reed direction, dBA threshold, radar gates, cylinder scale. All remote over Wi-Fi.
4. **Connect the app to the real boards.** The LAN server now lives in this repo: on the studio
   Mac, `npm run lan`, then open the printed `http://192.168.0.x:8126` on every phone. HTTPS
   Vercel still cannot see the boards — that is a browser rule, not a missing feature. This is
   the gate for everything below.
5. **The recording gate** — one glance before a take, with a named reason when the answer is no.
6. **Unattended safety alerting** — ESP32 pushing to phones directly, so a 3 a.m. leak wakes someone
   with no app open. Designed, not built.
7. **Then, and only then, the displays** — after the socket question in §6 is answered.

**Deliberately deferred:** both Raspberry Pis, the DAC Pro and XLR board, the 7" display, the air
sensors, tank levels, and everything in the technician-only group (panic loop, geyser, pump).
