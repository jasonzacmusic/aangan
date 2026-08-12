# Aangan Bridge

This Home Assistant app hosts the live Aangan PWA and translates its API into
Home Assistant entities. It starts automatically after a reboot and uses the
Supervisor API token; no long-lived Home Assistant token is stored.

## Install

1. Home Assistant → Settings → Apps → App store → ⋮ → Repositories.
2. Add `https://github.com/jasonzacmusic/aangan`.
3. Install **Aangan Bridge**, enable **Start on boot**, then start it.
4. Open the web UI. Its LAN address is `http://homeassistant.local:8126/`.
5. On each phone/tablet, open that address and choose **Add to Home Screen**.

Keep port 8126 on the trusted home LAN; do not port-forward it to the internet.
For remote control, put it behind a trusted HTTPS/VPN endpoint. Full PWA
offline/update support also requires a browser secure context (trusted HTTPS;
localhost is the development exception). The controls still work as a LAN web
page or home-screen shortcut over plain HTTP.

Keep **Allow commissioning** off during normal use. Enable it only while a
technician is physically testing alarm inputs, then switch it off again.

If `piano.local` does not resolve inside the app, give the Piano Pi a DHCP
reservation and set `piano_url` to its LAN IP, for example
`http://192.168.1.40:8951`.

`fleet_targets` is optional JSON for extra TCP health checks:

```json
[
  {"id":"router","name":"Router","kind":"network","host":"192.168.1.1","port":80},
  {"id":"studio-mac","name":"Studio Mac","kind":"mac","host":"192.168.1.30","port":8952}
]
```
