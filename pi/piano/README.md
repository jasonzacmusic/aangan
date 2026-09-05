# PIANO Pi — the Pianoteq stage rig

Turns the Raspberry Pi 5 (8GB, from Silverline) into a silent, fanless stage piano:
USB MIDI keyboard in → Pianoteq 9 Pro → Raspberry Pi DAC Pro + optional XLR board → balanced XLR → console.

**Verified against official docs August 2026** (Modartt + Raspberry Pi docs).
Anything marked ⚠ was community-sourced, not official — test before trusting.

## Hardware for this rig

| Part | Note |
|---|---|
| Raspberry Pi 5 8GB | Jason already owns (Silverline) |
| **Raspberry Pi DAC Pro + optional XLR board** | Current PCM5242 board, previously IQaudio DAC Pro. The XLR daughter board connects to P7/P9 for balanced output. |
| Raspberry Pi Touch Display 2 (5" or 7") | DSI cable + GPIO 5V. Autodetected on Bookworm, zero config. In stock at Silverline. |
| Fanless aluminium case with HAT + display room | Argon NEO 5 (robu.in) or EDATEC fanless. Must clear the XLR connectors. |
| A2 microSD 32–64 GB, official 27W USB-C PSU | Silverline. |

## Build steps

1. **Flash**: Raspberry Pi Imager → **Raspberry Pi OS Lite (64-bit)** (headless — Pianoteq runs its own touchscreen UI? No: Lite has no desktop. If you want the Pianoteq GUI on the touch display, flash **Raspberry Pi OS (64-bit) Desktop** instead and let the setup script trim it. For a pure headless rig controlled from the app, Lite is cleaner. **Default here: Desktop**, because the on-rig touchscreen for patch switching is part of the design.)
   In the Imager's gear menu: hostname `piano.local`, enable SSH, set Wi-Fi.
2. **Mount** the DAC Pro on the GPIO header, fit the XLR daughter board to P7/P9, and connect the Touch Display 2 to the DSI port.
3. Copy this folder to the Pi (`scp -r pi/piano pi@piano.local:~/`) and run:
   ```
   sudo bash setup_piano_pi.sh
   ```
   The script edits `/boot/firmware/config.txt`, installs the systemd services, sets the
   `performance` governor, and configures realtime audio limits.
4. **Pianoteq**: log in at modartt.com → User area → download the latest **Linux** package
   (it contains the **aarch64** binary). Copy the zip to `~/pianoteq/` on the Pi; the setup
   script unpacks whatever zip it finds there. First launch needs internet once for
   activation with Jason's Pro licence; after that it runs fully offline.
5. Reboot. Pianoteq auto-starts full screen on the touch display; `aplay -l` should show
   the Raspberry Pi DAC Pro as the output card.
6. Plug any USB MIDI keyboard in, XLR out to the console. Play.

## What the setup script writes into /boot/firmware/config.txt

```
# onboard audio OFF, Raspberry Pi DAC Pro ON
dtoverlay=vc4-kms-v3d,noaudio
dtoverlay=rpi-dacpro
```
`dtparam=audio=on` is disabled. Current Raspberry Pi documentation lists `rpi-dacpro`
for the Raspberry Pi-branded DAC Pro. Run `dtoverlay -h rpi-dacpro` on the installed OS;
if the board's own EEPROM already configures it, avoid loading a second overlay.

## Audio settings inside Pianoteq (Devices)

- Device: Raspberry Pi DAC Pro (ALSA direct — no JACK needed for a solo instrument)
- Sample rate **48000**, buffer **192 samples** (~4 ms) — proven stable on Pi 5 ⚠ community
- Performance → multicore **max** (better than "on" on Pi 5 under heavy playing) ⚠ community
- Headless benchmark: `./Pianoteq --headless --multicore max --play-and-quit`

## The status server (how the house sees the piano)

`piano_status_server.py` runs as a second systemd service on port **8951**. It is
deliberately tiny, stdlib-only, and **read-mostly**: the House Pi polls
`GET /status`, and `POST /cue` only writes a flag file + optional preset switch via
Pianoteq's JSON-RPC (`--serve` must be enabled in the Pianoteq service, which the unit file
does). If this server dies, the piano keeps playing — it is decoupled by design.

Endpoints:
- `GET /health` → `{"ok": true}`
- `GET /status` → the `PianoRig` JSON shape from `src/api/types.ts`
- `POST /cue {"cue": "recording_started" | "recording_stopped" | "next_preset" | "prev_preset" | "replay_last"}` — preset and replay return 409 while tally is on so a take cannot glitch.

## Real-time notes (verified)

- PREEMPT_RT is in mainline ≥ 6.12 but Raspberry Pi OS does **not** enable it; at
  48 kHz/192 frames on a Pi 5 the stock kernel is fine (RT gain "negligible" per the
  Pianoteq-on-Pi community). Don't chase a custom kernel unless you hear dropouts.
- The script sets: CPU governor `performance`, `@audio - rtprio 95` / `memlock unlimited`
  in `/etc/security/limits.d/audio.conf`, and adds the `pi` user to `audio`.
- Keep Wi-Fi for the status server; audio is I2S (wired into the DAC), so network
  activity cannot glitch it at these buffer sizes.
