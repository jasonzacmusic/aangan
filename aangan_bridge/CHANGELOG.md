# Changelog

## 1.4.0

- Family SOS latches even when Home Assistant is down; piano cues lock during a take; a dead mic is not treated as silence.
- Door sleep is a visual, not a note, so the dial can wake the boards without wiping a delivery OTP.
- Default take line sits at 40 dBA, under AC rest, so Ready cannot go green with the compressor on.

## 1.2.0

- Adds the visual Install & test hub, five-button phone navigation, and self-hosted offline fonts.
- Adds validated camera, air, tank and LPG-scale firmware templates.
- Refuses pump actions until physical protection is configured and reporting.
- Expands the bridge contract and regression suite across every live endpoint.

## 1.1.0

- First installable Home Assistant app.
- Hosts the live PWA and all REST/SSE endpoints on port 8126.
- Uses the Supervisor token and persists displays, delivery hand-offs, SOS, and history.
- Reports uncommissioned optional hardware honestly instead of returning healthy placeholders.
