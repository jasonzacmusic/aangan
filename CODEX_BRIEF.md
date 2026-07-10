# CODEX BRIEF — Finish "Studio Command"

You are **Codex Sol**, working autonomously on this Mac (M4 Pro, macOS Sequoia) for **Jason Zac**,
a professional musician and educator (Nathaniel School of Music, Bangalore) who is **not a coder**.
He wants outcomes, not explanations. Ship finished, verified work. GitHub is the source of truth —
**always commit + push, and redeploy to Vercel yourself.** Never leave him terminal steps to run.

Claude Code built v1 of this app. Your job: **study it in depth, fix bugs, finish and deepen the
features Jason actually asked for, add tasteful new features, and propose + implement (in mock) new
ideas for his House + Studio Raspberry Pi sensor setup.** Be genuinely creative, but stay on-brand
and keep everything working.

---

## 0. The app, in one paragraph

**Studio Command** is the mobile + iPad control surface for Jason's whole apartment, which runs on a
**Raspberry Pi 5 + Home Assistant** with ESP32 sensors in 5 zones (entrance, music room, bedroom,
kitchen, bathroom): door reed switches, a music-room dB mic, panic buttons, gas + leak sensors, an
ESP32-CAM doorbell, and WS2812B LED room signs. The house runs on a single **studio state** —
`Available · Class · Meeting · Audio Rec · Video Rec · Emergency` — and setting it recolors every room
sign, notifies family, and arms/relaxes recording pre-flight rules.

React 18 + TypeScript + Tailwind v4 (Vite). Installable PWA. No backend/DB — all state in memory /
IndexedDB. It currently runs on a **full mock simulation** so it's alive everywhere; a **single flag**
switches to the real Pi.

## 1. Where everything is / how to run it

- Repo (cwd): `/Users/nphmacmini/Documents/Claude Code/studio-command`
- GitHub: `jasonzacmusic/studio-command` (private). Push to `main`.
- Vercel prod: **https://studio-command.vercel.app** (project `studio-command`, team `jasonzacmusics-projects`).
  Deploy with: `npx vercel --prod --yes` from the repo. (Vercel CLI is already logged in as `jasonzacmusic`.
  GitHub auto-deploy is NOT configured, so you must run this command after pushing.)
- Dev: `npm run dev` (Vite). Typecheck: `npx tsc --noEmit`. Build: `npm run build`. **Both must stay clean.**
- Preview during work: open `http://localhost:5173` in a browser and actually click through all 5 pages,
  the dial, the hold-to-confirm sheets, the emergency takeover, and voice. Do not claim something works
  without observing it. Take screenshots into `/tmp` if useful.

### File map (read all of these first)
```
src/config.ts              ← USE_MOCK flag + LIVE_BASE_URL (the one switch)
src/api/types.ts           ← ApiAdapter interface, StudioState, STATE_META, ROOM_NAMES, DEFAULT_SCENES
src/api/api.ts             ← picks mock vs live from USE_MOCK
src/api/mockAdapter.ts     ← the simulated house (ticker, dB, doors, doorbell)
src/api/liveAdapter.ts     ← REST + SSE client for the Pi wrapper (the contract)
src/state/store.tsx        ← React context store; boot fetch + subscribe; setStudioState/runScene/panic
src/state/audio.ts         ← Web Audio state chimes + rotary tick + haptic
src/state/idb.ts           ← tiny IndexedDB kv (settings persistence)
src/components/StateDial.tsx      ← THE SOUL: SVG rotary dial (drag/tap, detents, needle, commit ripple)
src/components/DbMeter.tsx        ← breathing LED dB meter + Sparkline
src/components/HoldButton.tsx     ← press-and-hold-to-confirm (rAF + timeout fallback)
src/components/ConfirmSheet.tsx   ← bottom sheet to arm Rec/Emergency
src/components/EmergencyOverlay.tsx ← full-screen violet takeover, hold-to-stand-down
src/components/VoiceButton.tsx    ← SpeechRecognition ("set studio to recording")
src/components/Nav.tsx            ← bottom bar (phone) / left rail (iPad)
src/components/RoomCard.tsx
src/pages/{Command,Home,Preflight,Safety,Settings}.tsx
src/App.tsx, src/main.tsx, src/index.css
public/{manifest.webmanifest, sw.js, nsm-white.png, icons/*}
scripts/gen_icons.py
```

## 2. Hard constraints — DO NOT BREAK THESE

1. **Mock/live is ONE flag.** Every page talks only to the `api` object. Any new capability MUST be added
   to the `ApiAdapter` interface AND implemented in **both** `mockAdapter.ts` (realistic simulated data +
   events) **and** `liveAdapter.ts` (the REST/SSE call). If you add an endpoint, document its exact
   contract in `liveAdapter.ts` comments and in the README/API doc so Jason's Pi wrapper knows what to build.
   Flipping `USE_MOCK=false` must never require touching page code.
2. **NSM design language.** Gold `#C9A84C` on true-black / charcoal. Fonts: **Fraunces** (display), **Inter**
   (UI), **IBM Plex Mono** (small technical labels). State colors as defined in `STATE_META`. Cinematic,
   calm, premium — a luxury studio device, not a smart-home grid. **Dark only.** The **full NSM logo**
   (`public/nsm-white.png`) stays present. The **state dial remains the hero/soul** of the app.
3. **Mobile-first, flawless on iPhone; bigger calm layout on iPad** (the `lg:` breakpoint is the wall panel).
4. **Keep it an installable PWA** (manifest + service worker + offline shell). Don't regress install/offline.
5. **Setting the studio state must stay a joyful, powerful moment** — the dial, the color morph, the commit
   ripple, the chord. Enhance; don't flatten.
6. Keep `tsc --noEmit` and `npm run build` green. Keep bundle lean (no heavy deps without good reason;
   prefer stdlib/Web APIs). No secrets in the repo.

## 3. P0 — Bugs & robustness (fix these first, verify each)

1. **Mock loses the studio state on reload.** `MockAdapter` resets to `available` every refresh, so the
   iPad wall panel forgets its state after any restart. Persist the current state (and `setBy`/`since`) to
   IndexedDB in mock and rehydrate on boot. (Live mode reads from the Pi, so guard this to mock only.)
2. **Safety is inert in mock.** `mockAdapter` never changes `safety` and never emits a `safety` StreamEvent,
   so the gas/leak `emergency-flash` tiles and the whole Safety live-path can't be demonstrated or trusted.
   (a) Emit an initial `safety` event on subscribe; (b) add rare, realistic simulated safety events; and
   (c) add a **discreet dev/demo affordance** to trigger a gas/leak alert so Jason can SEE it work
   (e.g. a long-press on the Safety header, clearly not a prod control). Make sure a real alert visibly
   flashes and could raise a notification.
3. **PWA update staleness.** The service worker precaches `/` alongside hashed JS/CSS; after a new deploy the
   cached shell can reference purged asset hashes → possible blank screen offline. Verify the update flow,
   add a clean `skipWaiting`/`clients.claim` + "new version — tap to refresh" path, and confirm offline still
   loads after an update. Don't purge immutable hashed assets you still need.
4. **`theme-color` never follows the state.** Update the `<meta name="theme-color">` (and status-bar styling)
   to the active state color on every change, so the iOS PWA chrome matches the room. On-brand, cheap, lovely.
5. **`prefers-reduced-motion` is ignored.** The living-bg drift, `breathe`, and pulse animations should calm
   down when the user asks for reduced motion. Add the media query.
6. **Accessibility of the dial.** It's pointer-only with no ARIA. Add roles/labels and a keyboard/AT-friendly
   path (tapping a segment already works — expose it properly). Don't compromise the feel.
7. **No boot retry.** If the initial fetch fails, `connected=false` sticks forever. Add a lightweight retry/
   backoff and an honest "reconnecting…" state. In live mode, surface "Pi unreachable" clearly.
8. **Verify `HoldButton`** cannot double-fire `onComplete` (rAF + setTimeout dual driver) and that
   `EmergencyOverlay`'s single chime is intentional — a real emergency should optionally **loop a siren**
   until stood down (add a setting; emergency may override the chime-mute).
9. Audit for any other real correctness bugs you find (SSE reconnect, StrictMode double-subscribe inflating
   `dbHistory` in dev, pointer capture edge cases, timer leaks). Fix what's real; don't churn what isn't.

## 4. P1 — Finish & deepen what Jason asked for

Re-read his original request (below, verbatim-ish) and make sure every promise is not just present but
**excellent**:

- **Command dial**: haptic-style feedback, smooth color morphs, satisfying commit animation. ✔ exists —
  make the drag feel even better (momentum/snap), and make scene buttons feel like real "conducting."
- **dB meter breathes in real time; crossing the record threshold flips the pre-flight tile red live.** ✔ —
  verify the live cross-over is instant and unmistakable across pages.
- **Emergency takes over the whole screen with hold-to-confirm.** ✔ — consider the siren loop (P0.8) and
  making "what's the emergency" clearer (which sensor/zone tripped, if any).
- **Persistent voice button** using browser SpeechRecognition. ✔ — improve command coverage + feedback,
  and make it fail gracefully where unsupported (iOS Safari support is patchy — say so, don't pretend).
- **Pre-flight** must say **exactly** what's wrong and block "start recording" until green. ✔ — deepen: let
  pre-flight actually **act** (see P2 "pre-flight that fixes itself").
- **Settings**: dB threshold, family notification toggles, scene editor. ✔ — make the scene editor able to
  **add/remove** scenes and pick an icon, not just rename the three.

## 5. P2 — New app features (build now, in mock; wire the live contract)

Pick the strongest of these and build them well (you don't have to do all — depth over breadth):

1. **Activity timeline.** A calm log of the last N state changes + safety events + doorbell rings (who/what/
   when), on Command or a small "History" view. Mock generates it; live reads `GET /api/history`.
2. **Auto-return timer.** Arm Audio/Video Rec (or Meeting) with an optional duration; a countdown ring on the
   dial; the house auto-returns to Available when it elapses (with a gentle chime). Great for solo shoots.
3. **"Now Playing" studio card.** Jason uses Spotify. Show what's on the monitors and **auto-pause when a Rec
   state is armed**, resume on Available. (There is a Spotify integration available on this machine; if you
   can't reach it cleanly, mock it and document the hook.) This is the kind of delight he loves.
4. **Pre-flight that fixes itself.** A "Silence the room" action that (via the Pi) mutes the doorbell, cuts
   the AC/fan smart-plug, and confirms the dB drop on the live meter before going green — then restores after.
   Mock it end-to-end; document `POST /api/preflight/prepare` + `POST /api/preflight/restore`.
5. **Utilities panel (Bangalore-real).** New tiles for the things below (§6): water tank levels, mains/power
   status, AQI, gas cylinder level. Mock realistic values + events; document the endpoints.
6. **A440 tuning tone.** A musician's house should be able to sound a reference A. A button that plays a clean
   A440 (Web Audio) through the app now, and documents a `POST /api/tone {hz}` to play it over room speakers.
7. **Per-state house scenes preview.** On the dial, show a one-line "what this does to the house" (signs, AC,
   lights, doorbell, notifications) so setting a state feels like conducting, not toggling.

Keep any new page reachable from `Nav.tsx` (add an icon in the same visual language) without crowding the
5-tab phone bar — consider grouping (e.g. Utilities under Home/Safety, History under Command).

## 6. House + Studio ideas Jason forgot (implement mock tiles + document Pi wrapper + suggest HA automations)

Jason explicitly asked for **new ideas he forgot to incorporate into his House + Studio Pi + sensors setup.**
For each you adopt: add a believable **mock data source + tile/section in the app**, define the **live
endpoint/SSE contract** in `liveAdapter.ts` + README, and write the **Home Assistant automation / hardware
note** in `REPORT.md` (see §7). Prioritize the ones that are genuinely useful for a **musician's home studio
in Bangalore**:

**Recording / studio workflow**
- **Noise interlock**: smart-plug the AC + ceiling fan; arming Rec cuts them and the dB meter proves silence,
  then restores on Available. (Pairs with P2.4.)
- **Tally / On-Air**: a boom-arm tally LED + a hallway lamp that goes red on Rec — extends the WS2812B signs.
- **Gear power sequencing**: a "studio wake" that powers monitors/interface/outboard in order via a smart
  strip; "studio sleep" reverses it.
- **Take/session logging**: when Audio/Video Rec is armed, log start/stop (and optionally start REAPER
  recording — a REAPER integration exists on this machine; document the hook, don't hard-wire it).

**Bangalore home realities (high value)**
- **Water tank levels** (sump + overhead) via ultrasonic sensors; **motor/pump control with dry-run
  protection** and auto-fill. This is the single most useful Indian-home addition — build a strong tile.
- **Power/mains status + inverter/UPS**: detect outage, show "recording on inverter — ~N min battery",
  warn before a shoot. Optionally mains voltage/spike monitoring to protect gear.
- **LPG cylinder level** via a load cell under the cylinder ("gas ~2 days left"), complementing the existing
  gas-leak sensors.
- **Air quality (PM2.5 / AQI)** + auto-trigger an air purifier; comfort index (temp+humidity) per room.
- **Geyser (water heater)** schedule + a "boost 20 min" button.

**Teaching (NSM) specific**
- **Class-mode automation**: on `Class`, set signs blue, doorbell to a silent buzz, AC to a comfortable
  setpoint, a warm light scene, push a "lesson starting" note to the family WhatsApp group, and log the
  lesson start. (WhatsApp/Brevo paths exist in Jason's stack — document, don't hard-wire secrets.)
- **Student arrival**: entrance reed + presence → an unobtrusive "student's here" nudge.
- **Quiet hours / everyone-out**: presence-based "all out" arms locks, AC off, geyser off, signs dim.

**Intelligence**
- **Scheduled scenes/routines** (e.g. "Wind down" at 22:00), **geofence pre-warm** on arrival, and a small
  **energy dashboard** per smart-plug. Mock the data; document the HA side.

You don't have to build all of these in the UI — build the **2–4 highest-value ones** as real mock tiles/
sections, and put the rest in `REPORT.md` as a clear, prioritized proposal with a **hardware shopping list**
(sensor + rough part) and the **Home Assistant automation** sketch for each. Jason will use REPORT.md to
decide what to wire up physically.

## 7. Definition of done

1. `npx tsc --noEmit` clean and `npm run build` succeeds.
2. You have actually run the app and **clicked through every page + interaction** and confirmed the new work
   behaves (dial commit, hold-to-arm, emergency takeover + stand-down, pre-flight red/green live, voice,
   any new tiles/timelines/timers). Fix what you find.
3. Mock/live discipline intact: `USE_MOCK` is still the only switch; every new capability exists in both
   adapters; new endpoints/SSE events are documented for the Pi wrapper.
4. Update **README.md** (features + the full mock→live API contract) and **`src/api/liveAdapter.ts`** comments
   so the Pi wrapper spec stays authoritative and complete.
5. Write **`REPORT.md`** at the repo root, written **for a non-coder**, covering: what you fixed, what you
   added, and the **House + Studio hardware/sensor proposal** (prioritized, with a shopping list and an HA
   automation sketch per idea). This is Jason's readable deliverable — make it clear and exciting, not techy.
6. **Commit with clear messages, push to `main`, then `npx vercel --prod --yes`.** Confirm
   https://studio-command.vercel.app returns 200 and serves the new build. Leave the tree clean.
7. In your final message, give Jason a short, plain-English summary of what changed and what he can now do —
   plus the top 3 hardware add-ons you recommend he buy first.

### Jason's original request (context)
> Build "Studio Command" — a stunning master-controller app for a music studio + home in Bangalore. The
> mobile/iPad face of a Home Assistant setup. One tap should feel like conducting the house. Six states
> recolor every room sign, notify family, arm/relax pre-flight. Pages: Command (hero dial + scenes), Home
> (live 5-room map with dB meter), Pre-flight (go/no-go, block record until green, say what's wrong), Safety
> (gas/leak + doorbell + guarded emergency), Settings (dB threshold, notifications, scene editor). Signature
> interactions: the state dial (haptic, color morph, commit animation), the breathing dB meter that flips
> pre-flight red live, full-screen emergency with hold-to-confirm, a persistent voice button. Design: NSM
> gold-on-dark, Fraunces/Inter/IBM Plex Mono, cinematic and premium, dark only, mobile-first + calm iPad wall
> panel, installable PWA. Tech: React+TS+Tailwind, SSE with polling fallback, mock→live one line. "Make
> setting the studio state feel genuinely joyful and powerful. Add one delightful touch I didn't ask for."

Be bold and thorough. Make Jason smile when he opens it.
