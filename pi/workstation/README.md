# chorale-pi as a workstation

`bootstrap.sh` turns a freshly-powered Raspberry Pi 5 into a usable development
machine. It is separate from `pi/piano/`, which configures the *audio* rig and
assumes a DAC board that is not fitted yet. Run this one first; run that one
when an audio board arrives.

## Running it

On the Pi, as the normal login user — **not** with sudo:

```
git clone https://github.com/jasonzacmusic/aangan.git
bash aangan/pi/workstation/bootstrap.sh
```

It is safe to run again. Every step is independent, so one failure does not
stop the rest, and the summary at the end says exactly what worked.
A full log lands in `~/bootstrap-<timestamp>.log`.

## What it installs

| | |
|---|---|
| **Raspberry Pi Connect** | Official remote access — full desktop (or shell on Lite) in any browser, no port forwarding, no VPN. Picks `rpi-connect` or `rpi-connect-lite` based on whether a desktop is present. |
| **Claude Code** | Native installer. `linux-arm64` is officially supported. |
| **Codex CLI** | Statically-linked `aarch64-unknown-linux-musl` binary, resolved from the GitHub API rather than a hardcoded URL so it survives version bumps. |
| **VS Code** | arm64 from Microsoft's repo — **desktop installs only**. On Lite it is skipped, because a GUI editor has nowhere to draw. |
| **Node.js 22 LTS** | Not needed by Claude Code (the native installer is self-contained) but the repo is a Node project. |
| **Build toolchain** | git, build-essential, cmake, python3, plus htop/tmux/rsync/jq/ripgrep. |
| **Realtime audio limits** | `@audio rtprio 95`, `memlock unlimited`, performance governor. Harmless now; means the audio setup later is just "fit board, set overlay, reboot". |
| **Samba share** | `/srv/samples`, visible from the Mac in Finder as `samples`, so sample libraries can be dragged across. |

## What it deliberately does not do

- **It never formats, partitions or erases a drive.** It lists what is attached
  and stops there. Erasing a disk is a decision a person makes.
- **It does not configure any audio HAT.** No board is fitted. See `pi/piano/`.
- **It does not install Cursor.** Cursor does publish an arm64 Linux build via
  their apt repository, but scripting a third-party apt source from a URL I
  have not verified is how machines get broken. Install it by hand from
  <https://cursor.com/docs/downloads> if you want it — and note it is a desktop
  app, so it needs a desktop install, not Lite.

## The two things a script cannot do

Both need an interactive login:

1. `rpi-connect signin` — prints a link; sign in once. After that the Pi is
   reachable from any browser at <https://connect.raspberrypi.com>, including
   from the old iMac.
2. `claude` and `codex` — each prompts for sign-in on first launch.

## Why "edit on the Mac, build on the Pi"

The Pi is an excellent place for the code to *live* and a fine place to run
Claude Code — the model runs in the cloud, so the Pi is only a terminal. It is
a slow *compiler*. Chorale's universal builds already exhaust RAM on an M4 Pro
at `-j8`; on a Pi 5 with 8 GB use `-j2` or `-j3` and expect to wait.

For real work, run VS Code on the Mac with the Remote-SSH extension pointed at
this Pi: the Mac's speed, the Pi's Linux, one filesystem. `scripts/build-pi.sh`
in the chorale repo already exists for building on the board itself.
