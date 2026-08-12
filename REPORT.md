# Studio Command — Delivery Report for Jason Zac

## 12 August 2026 — sensor-day release

**Software status:** commissioning-ready. The app, live Pi bridge, Home Assistant package,
Home Assistant app container, and all nine ESPHome node configurations build or validate
cleanly. The UI now includes a persistent **Install** page with wiring maps, one-node-at-a-time
breadboard tests, and six saved hand-off checkpoints.

**What is ready in the repository:**

- `aangan_bridge/` — installable Home Assistant app that serves the live PWA and the complete
  REST/SSE bridge on port 8126.
- `pi/house/esphome/` — nine validated node files covering studio sensing, doors, perimeter,
  wet zones, kitchen safety, panic/fire, air quality, doorbell camera, and utility pulse inputs.
- `pi/house/homeassistant/packages/` — one authoritative readiness/safety model, repeating alerts,
  phone groups, and pre-flight prepare/restore actions.
- `pi/piano/` — Raspberry Pi DAC Pro + balanced XLR installation and verification notes.
- `mac-agent/` — the recording-Mac gate; REAPER Record is refused until the house reports ready.
- `docs/TOMORROW_INSTALL.md` — the exact bench order, wiring boundaries, and pass/fail sequence.
- `hardware/BUY_LIST.md` — quantities split into sensor-day essentials and later expansion.

**Still requires physical acceptance tomorrow:** exact Home Assistant entity adoption, Wi-Fi
signal at each final location, sensor calibration, every family phone notification route, and
the full power-cut/false-alarm drill. This software is not a substitute for certified fire/LPG
alarms, physical motor protection, or electrician-installed mains switching.

---

## The short version

Studio Command now feels like a real house instrument, not a collection of smart-home buttons.

The state dial is still the hero. It now remembers its state after a restart, works with touch **and** keyboard/assistive technology, previews what each state will do to the house, changes the phone’s theme color, and drives a proper house activity history. Recording pre-flight can now silence the room for you. Safety alerts can finally be demonstrated. The emergency screen explains what triggered it and can repeat a siren until it is deliberately stood down.

I also added four high-value Bangalore house systems as working simulated tiles: **water tanks and pump, mains/inverter, LPG cylinder level, and music-room air quality**. They are already connected through the same mock/live adapter boundary as the rest of the app, so the Raspberry Pi wrapper has an exact target to implement.

## What was fixed

- The simulated wall panel now remembers **state, who set it, and when** after a reload.
- Gas and leak alerts now arrive as real live events in the simulation. Hold the **Safety** title for 1.2 seconds to run the next discreet sensor demo; it cycles gas, kitchen leak, and bathroom leak.
- A safety alert flashes visibly and can raise an operating-system notification once device alerts are enabled.
- The app now retries a failed boot with backoff and says **reconnecting** or **Pi unreachable** honestly.
- The live Pi client now returns to SSE after a stream failure instead of falling back to polling forever.
- The service worker no longer risks pairing old HTML with deleted asset files. A new release waits safely and displays **Tap to refresh**.
- The installed app’s browser/theme color follows the active studio state.
- Reduced-motion mode calms the drifting background, breathing meter, pulses, and transitions.
- The dial is now a labelled six-position control for screen readers and keyboards. Arrow keys move focus and conduct the selected state.
- Hold-to-confirm has one completion gate, so its animation driver and fallback timer cannot fire the action twice.
- The emergency siren is optional, loops until stand-down, and intentionally overrides the ordinary chime mute when enabled.
- State changes, scene actions, pre-flight restoration, subscriptions, and timers were cleaned up to avoid duplicate work and stale callbacks.

## What was added or deepened

### A pre-flight that helps

**Silence the room** now performs a three-step sequence:

1. Mute the doorbell.
2. Switch off the AC and ceiling fan.
3. Watch the real dB feed until the room proves it is quiet.

The app still refuses to pretend it can close a physical door; it names the exact open door that still needs Jason. When the studio returns to Available, the doorbell, AC, and fan restore to their earlier state automatically.

### House memory

Command now holds a calm, expandable history of state changes, safety events, doorbell rings, pre-flight actions, utility actions, and power changes. This is also the starting point for take/session logging and later REAPER hooks.

### Scenes that are truly editable

Quick scenes can now be added, removed, renamed, assigned a state, and given an icon. Running one feels like conducting and records the scene as the source of the state change.

### Musician details

- A clean **A440** reference tone is one tap away.
- Audio and Video Rec explain their tally, silence, and logging effects before commitment.
- The live contract includes a room-speaker `POST /api/tone` hook.
- Activity history is ready to receive REAPER take start/stop events later, without hard-wiring REAPER into this app today.

### House Pulse

- **Water:** sump and overhead levels, protected pump start/stop, automatic high-level stop, and dry-run warning.
- **Power:** mains voltage, inverter battery, estimated recording runtime, and a clear outage state.
- **LPG:** cylinder percentage and estimated days remaining from a load-cell reading.
- **Air:** AQI, PM2.5, humidity, and purifier control/automation.

## Hardware plan — what to buy first

This is a staged plan. It keeps the first installation useful and safe instead of buying every sensor at once. Any 230 V pump, AC, fan, geyser, inverter, or studio-power work must be installed inside a proper enclosure by a qualified electrician. An ESP32 must never switch those loads directly.

### Priority 1 — Water tanks + protected pump control

**Why first:** this removes a daily Indian-home annoyance and prevents both overflow and dry running. It is the strongest value-for-effort addition in the whole plan.

**Shopping list**

- 2 × waterproof ultrasonic level sensors, preferably **JSN-SR04T/AJ-SR04M** class: one for the sump, one for the overhead tank.
- 1 × ESP32 in an IP-rated enclosure near a safe low-voltage route.
- 2 × physical float switches as independent high/low safety cutoffs.
- 1 × electrician-fitted motor contactor with overload protection and manual override.
- Weatherproof cable glands, 5 V supply, terminal blocks, and a labelled bypass switch.

ESPHome has a dedicated [waterproof JSN-SR04T component](https://new.esphome.io/components/sensor/jsn_sr04t/) and also supports conventional [ultrasonic distance sensors](https://esphome.io/components/sensor/ultrasonic/).

**Home Assistant automation sketch**

- **Trigger:** overhead tank below 30%.
- **Conditions:** sump above 20%, no dry-run/overload trip, no manual lockout.
- **Actions:** start contactor; show “Pump filling” in Studio Command; stop at 95% or after a maximum runtime; notify Jason if the level did not rise within two minutes.
- **Independent safety:** the physical high-level and dry-run switches cut the contactor even if Wi-Fi, Home Assistant, or the Pi fails.

### Priority 1 — Mains, inverter, and studio power protection

**Why second:** a Bangalore outage or voltage problem should never surprise Jason halfway through a lesson or shoot.

**Shopping list**

- 1 × electrician-installed DIN-rail single-phase energy meter with local data, such as a **Shelly Pro EM-50** or an installer-approved Modbus meter.
- CT clamp(s) sized for the apartment/studio circuit.
- Inverter/UPS battery-state integration or a DC-side battery monitor compatible with the inverter.
- Type 2 surge protection device and a clearly separated studio circuit if not already present.
- Optional small UPS for the Pi, router, ESP32 gateway, and network switch.

The [Shelly Pro EM-50](https://www.shelly.com/products/shelly-pro-em-50) is a DIN-rail, single-phase, dual-channel meter with LAN and local MQTT/HTTP/WebSocket options. ESPHome also supports the [PZEM-004T V3](https://esphome.io/components/sensor/pzemac/) for voltage/current/power data, but its AC-side installation still belongs with an electrician.

**Home Assistant automation sketch**

- **Trigger:** mains goes offline or voltage leaves the installer-approved safe band.
- **Conditions:** Studio is Class, Meeting, Audio Rec, or Video Rec.
- **Actions:** announce “On inverter” in Studio Command; calculate conservative minutes remaining; preserve Pi/router/audio-interface power; pause non-essential loads; notify at 30 and 15 minutes.
- **Restore:** when stable mains has held for two minutes, clear the warning and re-enable only the loads that were previously on.

### Priority 1 — Recording quiet interlock + physical On-Air tally

**Why third:** this is the studio upgrade Jason will feel every recording day. It turns Pre-flight from advice into action and lets the family understand the house state without opening the app.

**Shopping list**

- Electrician-approved smart relay/contactor channels for the AC and ceiling fan; use local-control devices with current ratings comfortably above the real loads.
- 1 × ESP32 plus a small WS2812B tally light on the mic/boom arm.
- 1 × hallway On-Air lamp or extension of the existing room-sign WLED controller.
- Optional contact sensor on the music-room door if that door is not already covered.

Home Assistant’s [WLED integration](https://www.home-assistant.io/integrations/wled) supports WS2812B-class strips, segments, presets, and local push updates.

**Home Assistant automation sketch**

- **Trigger:** Pre-flight Prepare or studio changes to Audio/Video Rec.
- **Actions in order:** snapshot AC/fan/doorbell state; mute doorbell; cut AC and fan; wait for the dB sensor to remain below threshold; turn boom tally and hallway lamp red; mark pre-flight ready.
- **Abort:** if noise stays high, keep recording locked and name the live dB problem.
- **Restore:** on Available, turn off tally and restore only devices that the automation changed.

### Priority 2 — LPG cylinder scale

**Why:** the existing gas detector handles danger; the scale handles the inconvenient “when will it finish?” question.

**Shopping list**

- 1 × low-profile platform with four 50 kg load cells or a suitable single load cell rated well above a full cylinder.
- 1 × HX711 amplifier.
- 1 × nearby ESP32 in a protected enclosure.
- Mechanical stops so the load cell cannot be overloaded or pinched.

ESPHome supports the [HX711 load-cell amplifier](https://esphome.io/components/sensor/hx711) and documents two-point calibration from raw readings to kilograms.

**Home Assistant automation sketch**

- **Trigger:** filtered cylinder mass crosses the calibrated 20% and 10% levels.
- **Conditions:** reading has stayed stable for 30 minutes, avoiding false alerts while the cylinder is moved.
- **Actions:** estimate days from the last 14 days of consumption; show the estimate in House Pulse; send one reorder reminder; never use the weight reading as a gas-leak safety signal.

### Priority 2 — Music-room air quality and purifier

**Why:** long classes and recording sessions are easier when dust, PM2.5, humidity, and stale air are visible and controlled.

**Shopping list**

- 1 × **Sensirion SEN54 or SEN55** for PM, temperature, humidity, and VOC/NOx capability.
- 1 × ESP32 with a vented, dust-aware enclosure and correct I²C wiring.
- 1 × locally controllable purifier plug/relay, rated for the purifier.
- Optional CO₂ sensor such as an SCD40/SCD41 for occupancy-driven ventilation decisions.

ESPHome’s [SEN5x component](https://esphome.io/components/sensor/sen5x/) supports PM2.5, temperature, humidity, VOC, and related readings; it also notes the sensor warm-up and periodic fan cleaning.

**Home Assistant automation sketch**

- **Trigger:** AQI/PM2.5 rises above the chosen comfort band for five minutes.
- **Conditions:** do not run a noisy purifier during Audio/Video Rec unless air reaches a safety-first high threshold.
- **Actions:** start purifier; show status in House Pulse; stop only after air has stayed good for 15 minutes.
- **Recording behavior:** pre-clean the room 30 minutes before a scheduled shoot, then pause the purifier during the take.

### Priority 2 — Safe studio wake/sleep power sequencing

**Why:** one scene can protect monitors and outboard gear from pops while making the studio ready quickly.

**Shopping list**

- A certified, locally controllable smart PDU or electrician-built relay/contactor panel with individually labelled channels.
- Energy monitoring per important channel where practical.
- A physical master-off and manual bypass.

**Home Assistant automation sketch**

- **Studio Wake:** interface/computer support first → outboard gear → wait → monitors last.
- **Studio Sleep:** monitors first → wait → outboard → remaining support gear last.
- **Conditions:** never sequence while a take is active; stop and notify if expected power draw does not appear.
- **History:** write one timeline event per completed sequence, not one noisy event per relay.

### Priority 3 — Class mode + student arrival

**Shopping list**

- Use the existing entrance reed/presence sensors and doorbell camera.
- Optional low-power mmWave presence sensor near the entrance for a more reliable “someone is waiting” signal.
- Reuse the WLED signs and a locally controlled warm lesson light.

**Home Assistant automation sketch**

- **Trigger:** studio changes to Class.
- **Actions:** signs blue; doorbell becomes silent visual buzz; comfortable AC setpoint; warm light scene; lesson start logged; optional family WhatsApp note through Jason’s existing approved messaging path.
- **Student arrival:** entrance presence + door event while Class is active creates one quiet in-app nudge and boom-tally blink, with a cooldown to prevent repeats.

### Priority 3 — Geyser boost, quiet hours, and everyone-out

**Shopping list**

- Electrician-fitted contactor and correctly rated local-control relay for the geyser.
- Optional water-temperature sensor mounted in a safe, manufacturer-approved way.
- Reuse room presence; add mmWave only where existing presence is unreliable.

**Home Assistant automation sketch**

- **Geyser boost:** a 20-minute timer with an absolute maximum runtime and auto-off; never rely on the app as the heater’s only safety control.
- **Quiet hours:** at 22:00, dim signs, lower notification volume, and avoid non-urgent pump starts.
- **Everyone out:** when every presence/geofence entity has been away for a settling period, switch off AC/geyser/non-essential studio power, dim signs, and arm safety notifications.

## Automation design rule

Home Assistant automations are easiest to reason about as **trigger → optional conditions → actions**, and can be built in its visual editor without coding. Home Assistant’s official [automation overview](https://www.home-assistant.io/docs/automation) and [trigger guide](https://www.home-assistant.io/docs/automation/trigger/) use this same model. For every motor, heater, mains circuit, and safety alarm above, keep the physical protection independent of the Pi automation.

## Recommended buying order

1. Buy and install the **two water level sensors + physical cutoffs + pump contactor**.
2. Add the **DIN-rail mains/inverter meter + surge/UPS protection**.
3. Install the **AC/fan quiet interlock + boom/hallway tally lights**.
4. Add LPG and air-quality sensing after the first three are stable.
5. Add gear sequencing, class arrival, geyser, and everyone-out routines as the final convenience layer.

That order gives the house practical value first, protects teaching/recording second, and saves the more optional intelligence for last.
