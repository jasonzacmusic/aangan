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

That list has since been proved wrong **in both directions**, which is why it must not be used as
evidence by anyone.

- On 13 Aug Jason said "nothing was owned except this computer". Claude applied that to all twenty
  items without checking each. **The certified smoke and LPG alarms genuinely were missing** — that
  gap hid for weeks and is now bought.
- On 20 Aug Jason corrected the correction: **the WS2812 LED strip, the ESP32-CAM and the old iPad
  are real and on the shelf.** Writing them off cost a near-miss on re-buying them.

**Rule: never infer stock from a document. Ask, or look.** §5 below is the only list that has been
checked item by item against vendor email or Jason's own eyes.

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
| **The app reading real sensors** | USB bench works on this Mac (see §4). HTTPS Vercel still cannot read HTTP boards — see §8 |
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
| 3 | Bathrooms A + geyser | `00:70:07:a2:6f:04` | DHCP — needs a static | `node-3-bath-a.yaml` |
| 4 | Bathrooms B + washing machine | `00:70:07:a2:90:dc` | DHCP — needs a static | `node-4-bath-b.yaml` |
| 5 | Kitchen | `88:f1:55:30:7f:84` | DHCP — needs a static | `node-5-kitchen.yaml` |
| 6 | Hall / entrance | `8c:94:df:69:1e:5c` | DHCP — needs a static | `node-6-hall.yaml` |
| door | Studio door bulb | `68:09:47:9d:b7:c4` | **192.168.0.248** (static) | `door-studio.yaml` |

All six room nodes flashed. **36 sensors, no pin conflicts.** The door stick is a spare ESP32, not a seventh room node. Each room board serves its own page and announces its address
over USB on boot. Pins 25/26/27 are the doors-and-probes pins on nearly every board.

**USB bench (19 Aug 2026):** Studio Command still reads Board 1 over USB on this Mac (`pi/house/usb_bridge.py`). **Door data path is Wi-Fi:** Board 1 broadcasts dBA / reeds / leak over ESP-NOW every 100 ms to `door-studio` (and HTTP `/text_sensor/studio_live` + `/sensor/studio_sound_level` as fallback). House mesh isolation still blocks phone → `192.168.0.250`; ESP-NOW does not go through the AP so the puck can still follow the mic.

**There are four bathrooms, not two** — that is why the wet zones need two boards.
**Boards 1 and 2 are currently at DEBUG log level** so sensor changes can be read over USB while
wiring. Set back to INFO once each room is signed off.

### Still to do on these nodes
- **Most sensors are not physically wired yet.**
- Assign static addresses to boards 3–6, continuing `.252`, `.253`, `.254`, `.249`.
- **Calibration, which can only happen after wiring:** the dBA threshold that means "too loud",
  the MQ-6 clean-air baseline, the HX711 scale factor, and the LD2410 distance gates.
- **Studio rest (measured 19 Aug 2026):** ~**42 dBA** with the AC on. Recording quiet stays a
  separate slider (default 45). The G2 hall warning is **52 dBA** (10 above rest) so the
  compressor cannot trip the outside puck + sign. Those two warnings are one married state.

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
| **WS2812 LED strip, 5V, 60 LED/m, 5 m reel, IP20** | 1 reel | **confirmed 20 Aug.** Black PCB. Factory 3-wire JST lead on the input end, so a first run needs no connector |
| **ESP32-CAM** | 1 | **confirmed 20 Aug.** Needs a USB-serial adapter to program — it has no USB socket |
| **Old iPad** | 1 | **confirmed 20 Aug.** Usable as a temporary display; rejected as a door panel — see §6 |

**Amazon order, 13 Aug:** Hikvision HF-GP110 LPG detector **with a potential-free relay** (the one
input that actually matters), 2 × Hikvision HF-S2E smoke alarms (**no relay** — they protect the
house but cannot talk to the app), 6 × 20W dual-port USB adapters, 8 × micro-USB cables,
2 × leak probes, PG7 glands.

---

## 6. The studio door sign and light — DECIDED 20 Aug

The earlier plan here (two Android tablets, wall mounts, Fully Kiosk licences) is **abandoned**.
Jason's objection was correct: a tablet screwed to a dark mahogany door looks like a phone taped to
an antique, and the app it would show still runs on simulated data.

### What is being built instead

| Part | Status | Note |
|---|---|---|
| **Waveshare ESP32-S3 7" capacitive touch display**, 800×480 | **On order, ~₹4,299–4,799** | Robu SKU 27078. **The ESP32 is inside the display** — it is not a screen wired to another board |
| **WS2812 LED strip** | **Owned, and PROVEN — see below** | 1 m cut, centred above the door |
| **Aluminium profile + frosted diffuser** | On order, ~₹369 | Frosted, never clear — clear shows the LEDs as dots |
| **74AHCT125 level shifter** | On order, ₹160 | ESP32 drives 3.3 V, strip wants ~3.5 V. Works without, then fails when the room warms |
| **USB-A to bare-wire pigtail ×2** | On order, ₹168 | Powers the strip from the 20 W adapters already owned |
| **Wooden bezel** | Local carpenter, ~₹800–1,500 | Routed rebate so the screen sits inset, and a channel for the diffuser so the light appears to come out of the wood |

### The architecture that makes this work

**Nothing wires between the studio and the door.** Board 1 already broadcasts studio state over
**ESP-NOW**, which is chip-to-chip and **does not go through the router** — so the light keeps
following the studio even in a Wi-Fi outage. The display listens to that same broadcast.

One 5 V supply at the door feeds the display and the strip in parallel, grounds common. **The
ESP32 supplies no power to the strip — only the data line.** One plug, one unit.

### The socket question is ANSWERED

There is a **tube light above the studio door on the G1 hall side**, already mains-fed. That is the
power, in exactly the right place.

**The one electrician job on this entire project, ~30 minutes:** remove the tube fitting and put a
**5 A socket on an UNSWITCHED, always-live feed** in its place, positioned to be hidden behind the
new profile. Unswitched matters — on the wall switch, someone kills the recording light mid-take.

### Placement decisions

- **Light:** where the tube was. Above the curtain rod so nothing shadows it. **Use one full 1 m
  profile centred over the door** rather than matching the 1.2 m tube — a centred 1 m bar reads as
  design, a 1.2 m bar with a seam reads as a bodge.
- **Display:** beside the door at eye height, handle side. Not above the door — a sign above a door
  gets read as a clock and ignored.
- **The studio has a door on each side** (G1 hall and G2 hall). A light at only one is invisible from
  the other. WS2812 chains, so **one pin drives both** with wire between the segments.

### Still open

- **Which GPIO is free on the Waveshare board** after the RGB panel and touch take theirs. If one is
  free, a single unit drives screen and light. If not, a spare ESP32 lives behind the same bezel.
  **Needs the Waveshare pinout PDF.**
- The G1 front-door screen still waits on the app, because the delivery OTP is typed by a human into
  the app — no board can invent it.

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
- **The WS2812 strip is PROVEN (20 Aug).** Driven from a spare ESP32 on GPIO4, cycling red/green/
  blue/white at 50% brightness. Colour order `GRB`. Config is `pi/house/esphome/strip-test.yaml`,
  static IP `192.168.0.247`. That firmware transfers unchanged to the Waveshare board.
- **`on_boot` at priority 600 runs BEFORE the light component exists.** A boot colour sequence there
  silently does nothing and looks like dead wiring. Use an `interval:` or a low priority instead.
  This cost a debugging round.
- **Power the strip from its own supply, never the board's 5 V pin.** 60 LED/m means a full 5 m reel
  at white is ~18 A. Even 1 m at white is >4 A. Cap brightness in firmware; a browned-out board looks
  exactly like a software bug.
- **A WS2812 strip is directional.** Arrows are printed on it; data enters at the end they point away
  from. Wrong end = nothing lights, nothing is damaged.
- `secrets.yaml` is gitignored and local-only. It was **not** ignored when first created — a real
  Wi-Fi password nearly went public. Anyone cloning this repo must create it from
  `secrets.example.yaml`.

---

### The two public pages — LIVE

| Page | What it is |
|---|---|
| `aangan.nathanielschool.com/door.html` | Control. Six states, free-text note, five presets. Mirrors the door back at you. |
| `aangan.nathanielschool.com/sign.html` | The door sign. Add to Home Screen on the iPad for full screen. |

Both are plain ES5 files in `public/`, deliberately **not** routes in the React
app: they get opened on whatever is nearest, including an old iPad by a door,
and a modern bundle cannot be trusted there. Both read the same `/api/door` the
light board polls, so the sign, the control page and the strip cannot disagree.

**Both are completely public.** Anyone with the link can set the studio state or
put text on the door. That was Jason's call on 20 Aug for a light in his own
building. If it ever needs locking down, a key in the query string is the
cheapest fix that keeps it a one-tap bookmark.

**The note carries its own timestamp (`mat`), separate from the state's (`at`).**
Setting a state used to wipe a note already on the door, because a serverless
instance that had never seen the note looked like the freshest source of it once
a state write bumped the shared stamp. Both pages now keep the newest `mat` they
have seen and ignore anything older. Do not merge the two stamps back together.

**The logo comes from the iCloud logo library and copies out at mode 0600.**
Chmod it 0644 or the host serves a broken image on the door.

### Traps found on 20 Aug, all of which cost hours

**Never put a `uart:` on GPIO1 or GPIO3.** Those two pins *are* the USB serial
port. `door-studio.yaml` had a UART there for the old Mac-cable overlay, which
forced `logger: baud_rate: 0`, which meant the board could not print a boot log,
which meant a board that would not join Wi-Fi was completely undiagnosable. Every
attempt to read it failed before it started. Removed; do not put one back.

**A board that answers ARP but refuses TCP instantly is not a network fault.**
`Immediate connect fail ... after 1 ms` is a local filter, not a lost packet. On
this Mac it was NordVPN: quitting the app leaves `utun6` up, the default route
captured, and `com.nordvpn.macos.Shield` still filtering. Disconnect inside the
app — quitting is what strands it.

**`http_request: timeout: 1s` cannot do TLS.** 1s is fine for a plain LAN call to
another board. A TLS handshake to a CDN on a 240 MHz ESP32 takes seconds, and at
1s every single request died with `ESP_ERR_HTTP_CONNECT`. The board was working
perfectly and was simply never given time to finish shaking hands. Now 10s.

**ESPHome renamed `headers:` to `request_headers:`** in `http_request` actions.

**An https page may never read an http device.** This is a browser rule and no
code changes it. It is the whole reason the relay exists: the deployed app and
the door sign are https, the board is plain http, so the app writes to
`/api/door` and the board polls *out*. An outbound call from the board is immune
to mixed content, to mesh client isolation, and to whether the Mac is even on.

**The door board's MAC is `68:09:47:9d:b7:c4`**, read off the chip with
`esptool read-mac` and confirmed by ARP. The previously recorded
`68:09:47:9c:8a:fc` belongs to no board here. It was `room-studio`'s ESP-NOW peer
address, so every dB reading, door state and leak flag board 1 sent went to a
device that does not exist — silently, because ESP-NOW never reports an unknown
peer. **Board 1 still needs reflashing for the fix to take effect.**

**The relay keeps state in memory, not a database.** Several serverless
instances can be warm at once and a fresh one starts blank, so every answer
carries `at`, the epoch-ms of its last write. The board accepts a value only if
`at` is strictly newer than what it already applied; a blank instance reports
`at: 0` and is never believed. Without this the recording light would flicker
back to green mid-take. Do not "simplify" this away.

**The board's poll is a POST, deliberately.** One call reports what the board can
see (door open, room dB — facts that arrive on ESP-NOW and exist nowhere else)
and receives the studio state in the reply. Splitting it into a read and a write
doubles the serverless invocations for no gain. The interval is 3s and not
faster for the same reason: 2s is ~1.3M calls/month and over Vercel's included
million; 3s is ~860k and under it.

**The door sign is deliberately not part of the React app.** `public/sign.html`
is plain ES5 with no build step, because it runs on an old iPad propped by the
door and that Safari cannot be trusted with a modern bundle. It reads the same
`/api/door` as the light, from the same origin, so the sign and the strip cannot
contradict each other.

## 9. What comes next, in order

1. **Wire the six rooms.** Boards 1 and 2 are in progress. Everything is push-fit except §7.
2. **Static addresses on boards 3–6**, so no bookmark ever breaks again.
3. **Calibrate** — reed direction, dBA threshold, radar gates, cylinder scale. All remote over Wi-Fi.
4. **Connect the app to the real boards.** USB bench is working for Board 1 + the door bulb (this Mac, port 8126). Phones still cannot see the boards until mesh isolation is off. This remains the gate for a wall panel.
5. **The recording gate** — one glance before a take, with a named reason when the answer is no.
6. **Unattended safety alerting** — ESP32 pushing to phones directly, so a 3 a.m. leak wakes someone
   with no app open. Designed, not built.
7. **The studio door sign and light** — see §6. Socket question answered; parts on order.
   Sequence: electrician fits the unswitched socket → carpenter makes the bezel → mount and plug in.
8. **The G1 front-door screen last**, because it needs the app.

**Deliberately deferred:** both Raspberry Pis, the DAC Pro and XLR board, the 7" display, the air
sensors, tank levels, and everything in the technician-only group (panic loop, geyser, pump).
