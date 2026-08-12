# HOUSE Pi — Home Assistant, sensors, and Aangan Bridge

The House Pi runs Home Assistant OS. Certified smoke/LPG alarms and physical pump protection remain primary; Aangan is the monitored control layer.

## Install order

```text
Home Assistant OS
      ↓
ESPHome + File editor/Samba
      ↓
Six critical ESP32 nodes on breadboards
      ↓
studio_command.yaml package + phone alerts
      ↓
Aangan Bridge app on port 8126
      ↓
Camera, air and House Pulse expansion nodes
```

1. Open `http://homeassistant.local:8123` and complete Home Assistant onboarding.
2. Settings → Apps → App store: install **ESPHome Device Builder** and **File editor** (or Samba share).
3. ESPHome → Secrets: copy `esphome/secrets.example.yaml` to `secrets.yaml`; replace every placeholder. Generate API keys with `openssl rand -base64 32` on a Mac/Linux computer.
4. Flash and breadboard-test the six critical files in this order:
   - `studio-doors.yaml`
   - `studio-sense.yaml`
   - `kitchen-safety.yaml`
   - `wet-zones.yaml`
   - `perimeter.yaml`
   - `panic-loop.yaml`
5. Adopt all six devices in Settings → Devices & services → ESPHome.
6. Copy `homeassistant/packages/studio_command.yaml` to `/config/packages/` and add this once to `/config/configuration.yaml`:

   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```

7. Replace the two sample `mobile_app_...` phone names in the notify group with the real Companion-app notify services. Run Developer tools → YAML → **Check configuration**, then restart Home Assistant.
8. Test the alert route on every phone. Do not continue until fire, gas, leak and panic tests identify the correct input and ring every required phone.
9. Install Aangan Bridge:
   - Settings → Apps → App store → ⋮ → Repositories
   - add `https://github.com/jasonzacmusic/aangan`
   - install **Aangan Bridge**, enable Start on boot and Watchdog, then start it
   - open `http://homeassistant.local:8126`
10. Add the live app to each phone/tablet home screen. Use its **More → Install & test** page while commissioning.

Keep port 8126 LAN-only. Do not expose an unauthenticated house-control port to
the public internet; remote access needs a trusted HTTPS/VPN layer.

The bridge is a real Home Assistant app. It uses Home Assistant's Supervisor token and serves the PWA and API together. No long-lived token and no separate Linux/systemd host are required.

## Nodes and phases

| Phase | File | Board count | What it covers |
|---|---|---:|---|
| Critical | `studio-doors.yaml` | 1 | Four studio/teaching door leaves |
| Critical | `studio-sense.yaml` | 1 | Two sound meters, LD2410, tally strip |
| Critical | `kitchen-safety.yaml` | 1 | Certified LPG contact, flame, kitchen leak, four MQ-6 trends |
| Critical | `wet-zones.yaml` | 1 | Eight leak points |
| Critical | `perimeter.yaml` | 1 | Three doors, five vibration inputs, four PIRs |
| Critical | `panic-loop.yaml` | 1 | Isolated panic loop, two smoke contacts, three flame inputs |
| Expansion | `doorbell-cam.yaml` | ESP32-CAM ×1 | Entrance camera |
| Expansion | `air_node.yaml` | 3 | Studio, kitchen and bedroom air |
| Expansion | `house-pulse.yaml` | 1 | Tanks, LPG scale, climate |

Complete visual pin maps and breadboard tests: [../../docs/TOMORROW_INSTALL.md](../../docs/TOMORROW_INSTALL.md).

## Acceptance rules

- `binary_sensor.studio_ready` is the sole record-ready verdict: all four doors closed, room quiet for 20 seconds, all six critical nodes online, and all safety inputs clear.
- A critical node going offline blocks readiness. Optional air/camera/utility nodes show **Not connected**; they do not invent healthy values.
- Aangan Bridge must not report pre-flight ready until configured doorbell, AC and fan entities have actually confirmed off.
- Water-pump control stays locked unless a physical dry-run/high-level protection circuit is present and reporting.
- `allow_commissioning` in the Aangan Bridge options stays off except during a supervised test.

## Electrical boundary

- Breadboards are only for isolated 3.3 V/5 V sensor signals.
- A certified alarm reaches the ESP32 only through a volt-free contact or optocoupler.
- The 12 V panic loop, sounder, mains, AC, geyser and pump contactor are technician work.
- Never connect an MQ-6 analogue output or an ultrasonic 5 V echo directly to an ESP32 ADC pin; use the documented 10 kΩ/20 kΩ divider.
