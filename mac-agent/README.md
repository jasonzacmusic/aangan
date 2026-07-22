# Mac recording gate

Home Assistant only *warns*; this agent on the recording Mac actually **blocks Record**
until the house's one authoritative `studio_ready` sensor is green.

## Install (one time)

```bash
sudo install -m 755 record_gate.py /usr/local/bin/record_gate.py
mkdir -p ~/.config/nsm && printf 'HA_URL=http://homeassistant.local:8123\nHA_TOKEN=PASTE-TOKEN\n' > ~/.config/nsm/studio.env
cp com.nsm.recordgate.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.nsm.recordgate.plist
```

Then in REAPER: Actions → Show action list → New action → **Load ReaScript** →
`GuardedRecord.lua`, and move your Record key binding onto it. Pressing Record now asks the
house first; if a door is open, the room is loud, a sensor is silent, or any safety alert is
live, REAPER shows exactly why and refuses to roll. (Logic/other DAWs: the agent still pops
a macOS alert the moment a take starts while not-ready — the hard block is REAPER-side.)

## Training the noise threshold (never guess a number)

1. During a genuinely good, quiet take: `python3 /usr/local/bin/record_gate.py train good`
2. With the AC/fan/traffic making the room unacceptable: `... train noisy`
3. Repeat each a few times on different days, then: `... train apply`

`apply` sets the threshold to the 95th percentile of proven-good takes + 3 dB headroom
(and splits the difference if noisy overlaps), then writes it into
`input_number.studio_db_threshold` in Home Assistant. The `studio_quiet` sensor adds
hysteresis on top (must hold 20 s under to turn green, 1 dB of slack before turning red).
