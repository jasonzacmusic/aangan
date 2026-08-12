# Aangan readiness audit

Audit date: 12 August 2026 · target: sensor commissioning on 13 August 2026.

## Go / no-go

| Area | Status | Evidence / remaining dependency |
|---|---|---|
| React app | Ready | TypeScript and production build pass |
| Phone / tablet navigation | Ready | Five large phone tabs; direct tablet rail; no six-item overflow |
| Live API | Ready | Complete REST/SSE bridge; optional-node failures no longer blank the app |
| Bridge deployment | Ready | Installable Home Assistant app; no systemd workaround on HA OS |
| Bridge tests | Ready | Every boot endpoint and representative write action covered by unit tests |
| Six critical ESP32 files | Ready to flash | Current ESPHome validation passes |
| Camera firmware | Ready to flash | AI-Thinker pin map included and validated |
| Air firmware | Ready to flash | One template, flashed once per room |
| House Pulse firmware | Ready to prototype | Tank, HX711 and DHT configuration included; physical calibration still required |
| HA package | Ready to load | All fire/leak inputs included; repeat alerts and emergency-state automation present |
| Certified life-safety hardware | External acceptance required | Technician must prove alarms, isolation, panic sounder and phone route |
| AC/fan/doorbell silence scene | Entity-dependent | Create `script.studio_silence_room` and `script.studio_restore_room` after device adoption |
| Pump control | Locked by design | Add only after physical high-level/dry-run cut-offs are installed and proved |
| Utility power/inverter data | Optional hardware integration | UI remains honest and shows Not connected until entities exist |

## Critical faults found and fixed

1. Live mode requested `/api/fleet`, `/api/air` and `/api/sos`, but the Python wrapper did not implement them. One 404 could leave the entire app on its loading screen. The bridge now implements the full contract and treats expansion endpoints as optional during boot.
2. Live configuration targeted port 8123, which is Home Assistant itself, not the Aangan bridge. The live app now uses same-origin port 8126 in the Home Assistant app build.
3. Home Assistant OS cannot host an arbitrary systemd service. The wrapper is now a proper Home Assistant app using the Supervisor token, with the PWA bundled inside it.
4. SEN0232 conversion was twice the correct level. Firmware now uses `volts × 50`, matching the module's 0.6–2.6 V / 30–130 dBA range.
5. Four MQ-6 analogue signals can exceed the ESP32 input range. The configuration and guide now require a 10 kΩ/20 kΩ divider on every AO line and external 5 V heater power.
6. ESPHome framework selection was implicit and WS2812 compilation failed under one default path. All ESP32 nodes now pin the ESP-IDF framework and validate on ESPHome 2026.7.4.
7. The optional utility UI displayed plausible healthy values even when sensors did not exist. Every section now carries an online flag and shows Not connected.
8. The package omitted several leak/flame inputs and the phone notification nesting was wrong. Both were corrected; all critical input types now drive Emergency and repeating alerts.
9. There was no camera or combined tank/LPG firmware. `doorbell-cam.yaml` and `house-pulse.yaml` are included.
10. Six tiny phone navigation buttons overflowed and the voice button covered unrelated content. The phone bar is now five 64 px controls; secondary pages live under More; voice appears only on Command.
11. Front-end dependencies included known Vite audit findings. Vite, the React plugin and Tailwind were upgraded; `npm audit` reports zero vulnerabilities.

## Physical facts code cannot finish in advance

- Exact Home Assistant entity IDs are created during adoption. The committed names should match, but compare them before restarting the package.
- Sound threshold is room-specific. Start around 45 dBA, record actual clean/noisy takes, then train it with the existing Mac agent.
- Ultrasonic empty/full distances and HX711 scale factors require measurements after final mounting.
- Companion notification service names depend on each phone. Replace the two samples and test with locked, silent phones.
- The pre-flight silence scripts depend on the chosen AC, fan and doorbell integrations. The bridge deliberately refuses to claim success while any of those are missing.

## Tomorrow's minimum useful finish line

```text
6 critical nodes adopted
        +
package validates
        +
every safety input rings every phone
        +
studio_ready drops for one open door / loud room / dead node / safety input
        +
Aangan live app opens from :8126 on phone and tablet
```

Camera, air, tank, LPG weight, displays, smart appliances and pump control are phase two. They should not delay the six-node safety and recording gate.

## Strong additions for music sessions

1. **Physical Take button + tally:** a footswitch or guarded desk button starts a session countdown only after `studio_ready`; hallway and boom-arm LEDs turn red. This avoids touching a phone while seated at the instrument.
2. **Session card:** on Audio/Video Rec, show elapsed take time, last take marker and a one-tap “mark this take” button. The existing Piano Pi black-box and activity history provide the base.
3. **Five-minute reset scene:** after a class, restore AC/fan/doorbell, purge the room, save a session summary and return signs to Available.
4. **Power-loss rehearsal:** a monthly automation briefly verifies House Pi, router and alarms on backup power, then records the result. It is more valuable than another dashboard tile.
5. **Arrival-to-class flow:** entrance presence while Class is scheduled gives Jason a private student-arrival nudge; it never rings through a take.
6. **Instrument climate guard:** sustained humidity outside a chosen band alerts before piano/guitar storage becomes a problem; use the air nodes after their readings stabilize.

Recommended implementation order after commissioning: physical Take button, session card, reset scene, then climate guard. Pump automation comes last because it has the highest physical consequence.
