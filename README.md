# Aangan · Studio Command

Aangan (आंगन — the courtyard, the heart of an Indian home) is the mobile and iPad control surface for Jason Zac’s Nathaniel School of Music studio and home in Bangalore. One calm, musical dial conducts the whole apartment:

**Available · Class · Meeting · Audio Rec · Video Rec · Emergency**

Every state recolors the five room signs, changes the house behavior, protects teaching or recording, and leaves a clear activity trail. The app is a dark, installable PWA built with React 18, TypeScript, Tailwind v4, and Vite.

> ### ⚠ Read [INVENTORY.md](INVENTORY.md) first
> **What hardware physically exists, what is on order, what is missing, and the gotchas that cost
> us days.** This README and the buy lists in `docs/` describe intentions; `INVENTORY.md` describes
> reality. Several features documented below — the air quality behaviours in particular — are built
> and shipped with **no sensors bought for them**. Check there before recommending a purchase,
> writing a node config, or telling anyone something is ready.

## What is in the app

- **Command** — the accessible rotary state dial, state-by-state house preview, signature chords, editable house scenes, A440 reference tone, and recent activity history.
- **Home** — entrance, music room, bedroom, kitchen, and bathroom sensors plus the new **House Pulse** for water tanks/pump, mains and inverter, LPG level, and music-room air quality.
- **Pre-flight** — an exact go/no-go verdict. “Silence the room” mutes the doorbell, switches off AC and fan, watches the dB meter fall, and restores those devices after the studio returns to Available.
- **Safety** — gas/leak status, live doorbell image, device notifications, guarded emergency trigger, and a full-screen emergency takeover with an optional repeating siren. The **Family SOS** lives here too: `/#/sos` is a home-screen bookmark on every family phone — pick who, hold once, and every phone rings, all signs flash, and every wall panel shows who needs help until "I'm OK" stands the house down.
- **Close-the-door nudge** — when any monitored door is open while the room is above the recording-quiet threshold, phones and wall panels ask (with hysteresis, no flicker) for the door to be closed.
- **Fleet card** (on Home) — every machine in the school (Macs, Pis, panels, router) with live up/down status; fed by `/api/fleet` (nsm-health on the LAN).
- **Guest QR** — door displays carry a small QR to `/#/guest`, a read-only live visitor page: what's happening inside, how to behave, and delivery guidance. Nothing to install.
- **Air** (on Home) — per-room CO₂, dust, odour index and humidity, plus per-purifier control and a one-tap purge. Four behaviours run in Home Assistant so they keep working with the app closed (`pi/house/homeassistant/packages/air_quality.yaml`): purifiers **hush during a take** and restore to their exact previous modes, a **pre-class purge** runs 20 minutes before a calendar class, a **CO₂ nudge** asks for fresh air (a purifier cannot fix CO₂), and an **instrument climate guard** warns on sustained damp or dryness. Pre-flight gains an air row that is deliberately **advice, not a gate** — `studio_ready` stays the four original checks.
- **Displays** — every wall/door screen is a generic panel: assign it Door sign, Studio state, House board, Doorbell cam, Custom message, or Clock, open it full-screen at `/#/display/<id>`, and add/remove panels freely. The **delivery OTP hand-off** lives here too: pick Swiggy/Zomato/Amazon/etc., type the OTP, and the door display shows it big to the delivery partner (with a note like "Leave it at the door") until it expires — nobody opens the door mid-take.
- **Piano Rig** (on Home) — live status of the PIANO Pi (Pianoteq preset, CPU, temperature, buffer/latency) with preset next/prev cues; arming a Rec state cues the rig's tally automatically. Preset and replay lock for the whole take so they cannot glitch the audio.
- **Install & test** — a phone-friendly breadboard map for all nine node types, six commissioning checkpoints, electrical boundaries, and saved pass/fail progress.
- **Settings** — dBA take line (must sit under AC rest at 42), hall warning, family notifications, chimes/siren, device-alert permission, and a scene editor that can add, remove, rename, recolor, and re-icon scenes.

Pre-flight now shows the full authoritative **studio_ready** verdict: doors closed AND
trained-quiet AND every sensor node healthy AND no fire/gas/leak/panic.

The mock house persists the studio state in IndexedDB, so a wall panel comes back in the same state after a reload. Settings and custom scenes persist too.

## Mock → live is one build setting

Every page talks only to the `ApiAdapter` selected in [src/api/api.ts](src/api/api.ts). Both the simulation and Pi client implement the same complete interface.

Local demo mode is the default. The Home Assistant app build switches to live data automatically. For any other build, use:

```bash
VITE_DATA_SOURCE=live VITE_LIVE_BASE_URL=http://homeassistant.local:8126 npm run build
```

No page or component changes are required. Port `8123` belongs to Home Assistant; Aangan Bridge and its copy of the app use `8126`. An empty `VITE_LIVE_BASE_URL` uses the current origin, which is how the add-on build avoids mixed-content and CORS problems.

> The public HTTPS Vercel app cannot normally call a plain-HTTP Pi URL because browsers block mixed content. For live house control, serve this same built app from the Pi/HTTPS home hostname, or expose the Pi wrapper through a trusted HTTPS home-network endpoint.

## Raspberry Pi wrapper contract

The TypeScript shapes in [src/api/types.ts](src/api/types.ts) and the comments in [src/api/liveAdapter.ts](src/api/liveAdapter.ts) are authoritative. JSON enum names must match exactly. Every timestamp is Unix epoch milliseconds. Responses use `Content-Type: application/json` and the wrapper must allow the Studio Command origin with CORS.

### REST endpoints

| Method | Path | Request | Response |
|---|---|---|---|
| GET | `/api/state` | — | `StudioStateInfo` |
| POST | `/api/state` | `{ "state": StudioState }` | `StudioStateInfo` |
| GET | `/api/rooms` | — | `Room[]` |
| GET | `/api/preflight` | — | `Preflight` |
| GET | `/api/preflight/status` | — | `PreflightPrep` |
| POST | `/api/preflight/prepare` | — | `PreflightPrep` |
| POST | `/api/preflight/restore` | — | `PreflightPrep` |
| POST | `/api/settings/db-threshold` | `{ "value": 45 }` | `{ "ok": true }` |
| GET | `/api/fleet` | — | `FleetDevice[]` (wrapper pings machines / reads nsm-health) |
| GET | `/api/air` | — | `AirState` |
| POST | `/api/air/purifier` | `{ id, mode }` | `AirState` — mode is `off \| silent \| auto \| max` |
| POST | `/api/air/purge` | `{ minutes }` | `AirState` |
| POST | `/api/air/purge/stop` | — | `AirState` |
| GET | `/api/sos` | — | `Sos \| null` |
| POST | `/api/sos` | `{ "who": string, "message": string }` | `Sos` (also sets state to `emergency`, setBy `SOS · <who>`) |
| POST | `/api/sos/clear` | — | `{ "ok": true }` (never changes the studio state by itself) |
| GET | `/api/safety` | — | `Safety` |
| GET | `/api/doorbell` | — | `Doorbell` |
| GET | `/api/history` | — | `ActivityEvent[]`, newest first, maximum 40 |
| POST | `/api/panic` | — | `{ "ok": true }` |
| POST | `/api/scene` | `{ "name": string, "state": StudioState }` | `StudioStateInfo` |
| GET | `/api/utilities` | — | `Utilities` |
| POST | `/api/utilities/action` | `{ "action": "water_pump_toggle" \| "purifier_toggle" }` | `Utilities` |
| POST | `/api/tone` | `{ "hz": 440 }` | `{ "ok": true }` |
| GET | `/api/piano` | — | `PianoRig` |
| POST | `/api/piano/cue` | `{ "cue": PianoCue }` | `PianoRig` |
| GET | `/api/delivery` | — | `Delivery \| null` |
| POST | `/api/delivery` | `{ courier, otp, note, displayId, minutes }` | `Delivery` |
| POST | `/api/delivery/clear` | — | `{ "ok": true }` |
| GET | `/api/displays` | — | `DisplayConfig[]` |
| POST | `/api/displays/update` | `{ id, patch }` | `DisplayConfig[]` |
| POST | `/api/displays/add` | `{ name }` | `DisplayConfig[]` |
| POST | `/api/displays/remove` | `{ id }` | `DisplayConfig[]` |
| POST | `/api/safety/demo` | `{ "kind": "gas" \| "leakKitchen" \| "leakBath" \| "clear" }` | `Safety` |

`/api/safety/demo` is for installation/commissioning only. Disable or protect it on the production Pi. Studio Command exposes that gesture only while `USE_MOCK=true`.

### Core response shapes

```ts
type StudioState =
  | "available" | "class" | "meeting"
  | "audio_rec" | "video_rec" | "emergency";

interface StudioStateInfo {
  state: StudioState;
  setBy: string;
  since: number;
}

interface PreflightPrep {
  active: boolean;
  status: "idle" | "preparing" | "ready" | "restoring";
  mutedDoorbell: boolean;
  acOff: boolean;
  fanOff: boolean;
  startedAt?: number;
}
```

`GET /api/utilities` returns this complete shape:

```json
{
  "water": {
    "online": true,
    "sumpPct": 74,
    "overheadPct": 61,
    "pumpRunning": false,
    "dryRunProtected": true,
    "lastFillTs": 1783700000000
  },
  "power": {
    "online": true,
    "mainsOnline": true,
    "voltage": 231,
    "inverterPct": 86,
    "estimatedMinutes": 128,
    "surgeProtected": true
  },
  "lpg": { "online": true, "remainingPct": 38, "estimatedDays": 12 },
  "air": {
    "online": true,
    "aqi": 62,
    "pm25": 21,
    "tempC": 24.3,
    "humidityPct": 58,
    "purifierOn": false
  }
}
```

### Live SSE stream

`GET /api/stream` returns `text/event-stream`. Use named SSE events and put one JSON payload in each `data:` frame.

| Event name | JSON payload |
|---|---|
| `state` | `StudioStateInfo` |
| `rooms` | `Room[]` |
| `safety` | `Safety` |
| `doorbell` | `Doorbell` |
| `history` | one `ActivityEvent` |
| `utilities` | `Utilities` |
| `preflight` | `{ "preflight": Preflight, "prep": PreflightPrep }` |
| `piano` | `PianoRig` |
| `delivery` | `Delivery` or JSON `null` |
| `displays` | `DisplayConfig[]` |
| `sos` | `Sos` or JSON `null` |
| `fleet` | `FleetDevice[]` |
| `air` | `AirState` |

Send an initial `safety`, `utilities`, and `preflight` frame as soon as a client subscribes. Heartbeat comments such as `: keepalive` are welcome. If SSE drops, Studio Command polls the state, rooms, safety, pre-flight, and utilities every three seconds while retrying SSE every ten seconds.

### Expected Home Assistant behavior

- `prepare` snapshots the current doorbell/AC/fan state, mutes or switches them off, then reports each completed flag. It must not claim `ready` until Home Assistant has confirmed the device states.
- `restore` returns those devices to the saved pre-preflight state; returning the studio to Available calls this automatically.
- `scene` may run a richer Home Assistant scene by `name`; `state` is the required fallback and final studio state.
- `water_pump_toggle` must honor physical dry-run and high-level cutoffs on the electrical side, not only in software.
- Safety events are never inferred from the UI. The Pi/ESP32 sensors are the source of truth.
- History should include state changes, sensor alerts/clears, doorbell rings, pre-flight actions, mains events, and guarded utility actions.

## PWA behavior

- The current HTML shell and its hashed JS/CSS are cached together under a build-specific cache.
- An update installs beside the running version. Phones show **“New Studio Command ready — Tap to refresh.”** Wall panels and the guest page apply the update by themselves — but only while the studio is not recording and no emergency/SOS is active. Nothing ever reloads a panel during a take.
- The refresh (user tap, or a panel's safe-state auto-apply) sends `SKIP_WAITING`; the new worker claims the page and reloads once.
- The last complete shell continues to load offline. Old hashed assets are kept until the new worker activates, preventing the stale-shell blank-screen failure.
- The browser theme color follows the active studio state. Reduced-motion users get a calm, nearly static version of the background, meters, and pulses.

## Local checks

```bash
npm install
npm run dev
npm run check
npm run build:addon
```

The production build is written to `dist/`. `npm run build` stamps the service worker with a unique build ID so every Vercel release can be detected cleanly.

## The rest of the system (in this repo)

```
pi/piano/     PIANO Pi: setup script, HiFiBerry config, Pianoteq + status-server services
pi/house/     HOUSE Pi: HA package, nine ESPHome node templates, critical alerts,
              and the tested bridge that serves the live app/API
aangan_bridge/ installable Home Assistant app; built with npm run build:addon
mac-agent/    the recording-Mac gate: record_gate.py (+ threshold TRAINING from real
              takes) and GuardedRecord.lua for REAPER
hardware/     BUY_LIST.md — owned vs to-buy, Silverline/robu.in/hifiberry sourcing
docs/         INSTALL_DIAGRAMS.md and TEST_CHECKLIST.md
```

Going live: add this GitHub repository to the Home Assistant App store, install **Aangan Bridge**, and open `http://homeassistant.local:8126`. Full steps: [docs/TOMORROW_INSTALL.md](docs/TOMORROW_INSTALL.md).

For the non-technical delivery summary and the prioritized hardware plan, see [REPORT.md](REPORT.md).
