# Commissioning test checklist

Run every test with the family present. The system is NOT "safe" until the certified
alarms are physically mounted and every row here passes.

## Certified layer first (no Pi involved)

- [ ] Each certified smoke/heat alarm: press TEST — sounds locally, loud everywhere.
- [ ] LPG detector: test button (or unlit lighter gas at a safe distance per manual) —
      its own siren fires with Wi-Fi OFF.
- [ ] Panic loop: press each latching switch in turn — battery sounder fires with the
      house Pi POWERED OFF. Reset each switch.

## Smart overlay

- [ ] **Double-door trap**: open ONE leaf of the studio door a few cm. The app's
      Pre-flight names that exact door; studio_ready drops; Record in REAPER is refused.
      Repeat for the other leaf, then the teaching door.
- [ ] **Noise blocks record**: play the AC/fan at normal level — after training, Pre-flight
      shows "too loud" with the live dBA; GuardedRecord refuses with the reason. Silence
      the room — verdict goes green only after ~20 s of quiet (hysteresis working).
- [ ] **Sensor-health gate**: pull power on any one ESP32 → within its timeout,
      "Every sensor is reporting" goes red and Record is blocked.
- [ ] **Each alarm rings phones**: trigger each certified-alarm relay input (jumper the
      volt-free contact briefly) — every family phone rings THROUGH silent mode (iOS
      critical / Android alarm channel), and repeats until acknowledged.
- [ ] **Perimeter/imposter trip**: with state = Audio Rec, rattle the main door —
      vibration + reed produce one clean critical notification.
- [ ] **Delivery OTP**: from a phone, send a test OTP to the front-of-house panel; verify
      it appears big and readable at the door, then expires on its own.
- [ ] **Displays**: reassign each panel's content from the app and watch it change live.
- [ ] **Piano link**: arm Audio Rec — the piano rig's status server receives the
      recording_started cue; kill the house Pi mid-note — the piano keeps playing
      (decoupling proven).

## Power-cut drill (monthly)

- [ ] Kill the mains breaker. Certified alarms still test OK (their batteries).
      Panic sounder still fires (its battery). Note what the Pis/router did.
- [ ] Restore power: both Pis boot unattended to full function (HA up, wrapper up,
      Pianoteq auto-started); no service needs a human.

## Recording-gate acceptance (the one that matters)

- [ ] With everything green: GuardedRecord rolls instantly, zero friction.
- [ ] With ANY single fault (door/noise/sensor/safety): Record is refused and the
      reason on screen matches reality. No false greens across one full week of use.
