# HOUSE Pi — Home Assistant + ESPHome + the wrapper

The second Raspberry Pi 5 (in stock at Silverline) runs **Home Assistant OS** and watches
both apartments. The certified alarms stay primary; everything here is the smart overlay.

## Install order

1. **Flash HA OS** with Raspberry Pi Imager → "Other specific-purpose OS → Home Assistant".
   32 GB+ A2 microSD. Boot with Ethernet if possible, open `http://homeassistant.local:8123`,
   create the admin account. (NVMe boot exists but is not in the official install doc —
   start on SD.)
2. **Add-ons**: install the official **ESPHome** add-on (Settings → Add-ons).
3. **ESPHome nodes**: copy `esphome/secrets.example.yaml` → `secrets.yaml` in the ESPHome
   add-on config, generate the api keys (`openssl rand -base64 32` each), then flash the six
   YAMLs in `esphome/` onto the six ESP32s over USB the first time (OTA after that).
   Adopt each node in Settings → Devices & Services.
4. **Package**: copy `homeassistant/packages/studio_command.yaml` to `/config/packages/`
   (Samba or File editor add-on) and add to `configuration.yaml`:
   ```yaml
   homeassistant:
     packages: !include_dir_named packages
   ```
   Fix any entity ids that got different names during adoption, then restart HA.
5. **Phones**: everyone installs the **Home Assistant Companion** app (iOS + Android), logs
   into `http://homeassistant.local:8123` on the home Wi-Fi. Edit the `notify:` group in the
   package so it lists every real phone (`notify.mobile_app_<device_name>`). iOS users must
   allow **Critical Alerts** when the app asks — that is what rings through silent mode.
6. **Wrapper** (feeds the Studio Command app):
   ```bash
   sudo install -m 755 wrapper/studio_wrapper.py /usr/local/bin/
   echo 'HA_TOKEN=<long-lived token from your HA profile>' | sudo tee /etc/studio-wrapper.env
   sudo cp wrapper/studio-wrapper.service /etc/systemd/system/ && sudo systemctl enable --now studio-wrapper
   ```
   On HA OS itself you cannot run systemd services — run the wrapper on any always-on
   Linux box/Pi on the LAN (the piano Pi is fine: it's Nice=10, network-only), or ask for
   it to be packaged as a local HA add-on. Then set in the app repo:
   `src/config.ts → USE_MOCK = false; LIVE_BASE_URL = "http://<wrapper-host>:8126"`.
7. **Displays**: any old iPad/tablet → open the app → Displays → "Open panel" → add to home
   screen (or use the Companion app's native kiosk mode on current iPads).

## The one authoritative verdict

`binary_sensor.studio_ready` in the package is **the** studio_ready:
doors closed AND trained-quiet (with hysteresis) AND every ESP32 node online AND no
fire/gas/leak/panic. The app's Pre-flight shows all four checks; the Mac agent (see
`mac-agent/`) blocks Record on the same sensor.

## Safety wiring rules (non-negotiable)

- Certified smoke/heat + LPG alarms are mounted and tested FIRST, standalone.
- ESP32s read only **volt-free relay contacts** from certified units.
- The panic loop is wired NC through latching switches to a battery-backed sounder by a
  **low-voltage/fire-alarm technician** — the ESP32 only observes it.
- Nothing in this folder switches mains. Pumps/AC/geyser get electrician-fitted
  contactors with physical protection; HA only asks politely.
