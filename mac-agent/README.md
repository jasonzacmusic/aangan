# Mac recording gate

The Aangan LAN server on this Mac is the source of truth. This agent **blocks Record**
until `/api/preflight` says the room is ready. There is no Raspberry Pi and no Home
Assistant token.

## Install (one time)

The LAN app must already be running (`npm run lan` in the aangan folder). Then:

```bash
sudo install -m 755 record_gate.py /usr/local/bin/record_gate.py
mkdir -p ~/.config/nsm && printf 'AANGAN_URL=http://127.0.0.1:8126\n' > ~/.config/nsm/studio.env
cp com.nsm.recordgate.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.nsm.recordgate.plist
```

Then in REAPER: Actions → Show action list → New action → **Load ReaScript** →
`GuardedRecord.lua`, and move your Record key binding onto it. Pressing Record now asks the
house first; if a door is open, the room is loud, a sensor is silent, or any safety alert is
live, REAPER shows exactly why and refuses to roll.

## Training the noise threshold (never guess a number)

1. During a genuinely good, quiet take: `python3 /usr/local/bin/record_gate.py train good`
2. With the AC/fan/traffic making the room unacceptable: `... train noisy`
3. Repeat each a few times on different days, then: `... train apply`

`apply` sets the threshold to the 95th percentile of proven-good takes + 3 dB headroom
(and splits the difference if noisy overlaps), then writes it into the LAN server.
The live pre-flight uses that number on every phone.
