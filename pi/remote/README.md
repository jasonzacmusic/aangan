# Pi Pad — the phone as the Pi's trackpad and keyboard

A home-screen web app served by the Pi itself. Open it on an iPhone or iPad,
add it to the home screen, and it behaves like an app: full screen, its own
icon, no App Store and no Xcode.

It is a web app rather than a native iOS app on purpose. Neither Mac has full
Xcode, a native app needs a developer account to put on a phone, and this one
works the same on iPhone, iPad, Android and the old iMac's browser.

## How it works

`pipad.py` serves the page and keeps a WebSocket open to it. What you do on the
phone becomes real input through **`/dev/uinput`** — the kernel creates a
virtual keyboard and a virtual trackpad. Because the events arrive at the kernel,
the desktop treats them like any USB keyboard and mouse: it works under Wayland
(labwc, wayfire) and X11 alike, with nothing to configure in the desktop.

Standard library only, plus `python3-evdev` for the uinput side.

## Install (on the Pi)

`pi/workstation/bootstrap.sh` already runs this. To install on its own:

```
bash pi/remote/install.sh
```

It prints the link with the PIN and a QR code. Open the link in Safari, then
**Share → Add to Home Screen**.

## Using it

| Do this | It does |
|---|---|
| One finger | Moves the pointer (faster flicks travel further) |
| Tap | Left click |
| Tap, then tap and hold while moving | Drag |
| Double tap | Double click |
| Two fingers | Scroll (natural, like a Mac — changeable in settings) |
| Two-finger tap | Right click |
| ⌨ | Brings up the phone's keyboard; whatever you type goes to the Pi |
| ctrl / alt / ❖ | Tap one, then a key: ctrl then c is Ctrl+C |
| ☰ | Opens the Pi's menu |
| HOLD | Locks the left button down for long drags |

## Security, plainly

- A six-digit PIN guards it. Eight wrong tries from one device locks that device
  out for a minute, so the PIN cannot be guessed by brute force.
- The connection refuses to be opened by any *other* web page in the phone's
  browser (an Origin check), so a malicious site cannot drive the Pi.
- It is plain HTTP on the home network. Fine for a home LAN; do not expose port
  8765 to the internet.

## If the phone cannot reach it

The house mesh has **wireless client isolation**: one Wi-Fi device often cannot
connect to another. If the Pi is on Wi-Fi and the phone is too, Pi Pad may not
connect. Put the Pi on **Ethernet** — wired devices are usually reachable. And
Raspberry Pi Connect, which goes out through the internet, always has mouse
and keyboard built in as a fallback.

## Testing without a Pi

```
python3 pi/remote/pipad.py --dry-run      # logs every action instead of injecting it
python3 -m unittest pi/remote/test_pipad.py
```

22 tests, including a full session over a real socket: handshake, wrong PIN,
right PIN, and a move, click, typed text and Ctrl+C arriving as the right actions.
