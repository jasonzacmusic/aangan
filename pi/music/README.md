# chorale-pi in composition mode

`setup_music.sh` installs what a composition box needs:

| | |
|---|---|
| **REAPER** | Latest stable ARM64 Linux build, resolved from reaper.fm each run (7.82 at the time of writing). Installed to `/opt/REAPER`, with a desktop entry and `reaper` on the path. |
| **Pianoteq** | Linked into `~/.vst3`, `~/.lv2` and `~/.vst` so REAPER finds it as a plugin. Links, not copies, so a Pianoteq update needs no re-run. |
| **Audio plumbing** | `pipewire-jack` gives REAPER a JACK device on top of the PipeWire that Raspberry Pi OS already runs. `qpwgraph` is the visual patchbay. |

`pi/workstation/bootstrap.sh` runs it. On its own: `bash pi/music/setup_music.sh`.

## Composition mode vs. stage piano

`pi/piano/` turns the Pi into a stage piano that boots straight into Pianoteq
full-screen. This folder does the opposite: REAPER is the front door and
Pianoteq is a plugin inside it. Same Pi, different job — pick one per boot.

## What a person still does once

1. **Pianoteq download.** It sits behind the Modartt login. Download the Linux
   version, put the zip in `~/Downloads`, and re-run the script.
2. **REAPER licence.** Copy `reaper-license.rk` from the Mac into
   `~/.config/REAPER/`. REAPER runs fully without it.
3. **REAPER audio device:** Preferences → Audio → Device → JACK, buffer 128.

## Our own apps on Linux — the honest status

| App | Built with | On the Pi |
|---|---|---|
| **Pianoteq** | Modartt, ships ARM64 Linux | ✅ Installs today |
| **REAPER** | Cockos, ships ARM64 Linux | ✅ Installs today |
| **Chorale** | JUCE — cross-platform | ⚠️ Portable, but never built for Linux. JUCE gives Linux a Standalone and VST3 for free (it drops AU automatically); the gesture camera code is Mac-only and already compiled out. Needs a Linux build and a test on the board. `scripts/build-pi.sh` in the chorale repo measures the DSP today. |
| **Manch** | Swift + AppKit + AVAudioEngine, hosting Mac Audio Units | ❌ Cannot run on Linux. All three of those are Apple-only. And the instruments Manch hosts (Arturia and the rest) have no Linux versions either, so even a rewrite would have nothing to load. On the Pi, REAPER is the nearest equivalent: one track per layer, track templates as patches. |
