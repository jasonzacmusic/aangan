# Studio Command

The master control surface for the Nathaniel School of Music studio & home in Bangalore —
the mobile/iPad face of the Home Assistant setup on the Raspberry Pi 5.

One dial sets the whole house: **Available · Class · Meeting · Audio Rec · Video Rec · Emergency**.
Every WS2812B room sign recolors, the family is notified, and the pre-flight rules arm.

## Pages

- **Command** — the state dial (drag or tap; Rec/Emergency need a hold-to-confirm), living state-colored background, quick scenes.
- **Home** — 5 zones live: doors, presence, temperature, sign color, music-room dB meter.
- **Pre-flight** — go/no-go before recording; blocks Start Recording until doors are shut and the room is quiet, and says exactly what's wrong.
- **Safety** — gas + leak sensors, state-aware doorbell snapshot, guarded hold-for-Emergency.
- **Settings** — dB threshold, family notification toggles, scene editor. Persisted in IndexedDB.

## Mock → Live (one line)

The app currently runs on a full simulation so it works anywhere.
When the Pi wrapper is ready, flip one flag in [src/config.ts](src/config.ts):

```ts
export const USE_MOCK = false; // ← that's it
```

It then talks to `http://studio.local:8123` per the wrapper contract documented in
[src/api/liveAdapter.ts](src/api/liveAdapter.ts) (REST + SSE `/api/stream`, with an
automatic 3-second polling fallback if the stream drops).

> Note: live mode must be served from inside the home network (ideally from the Pi
> itself) — a phone on the same WiFi opening the HTTPS Vercel URL cannot reach
> `http://studio.local` due to browser mixed-content rules.

## The delightful touch

Every state answers with its own **signature chord** (Web Audio): Available is C major,
Class is D major, Meeting is a B♭maj7, recording states are a bare low fifth, Emergency
is a tritone. The dial ticks like a real rotary as you cross detents. Toggle in Settings.

## Tech

React 18 + TypeScript + Tailwind v4 (Vite). No backend, no external DB.
Installable PWA: manifest + offline-shell service worker + Add to Home Screen.
Fraunces / Inter / IBM Plex Mono, gold-on-dark NSM design language.

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build in dist/
```
