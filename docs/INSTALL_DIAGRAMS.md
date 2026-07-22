# Install diagrams

## The whole system

```mermaid
flowchart LR
  KB[USB MIDI keyboard] --> PP
  subgraph PP["🎹 PIANO Pi — piano.local"]
    PT[Pianoteq 9 Pro<br/>48 kHz · 192 frames · multicore max] --> DAC[HiFiBerry DAC2 Pro XLR]
    ST[piano_status_server.py :8951]
  end
  DAC -->|balanced XLR| CONSOLE[Studio console]
  subgraph HP["🏠 HOUSE Pi — homeassistant.local"]
    HA[Home Assistant OS 2026.7<br/>studio_ready verdict] --- WR[studio_wrapper.py :8126]
  end
  ST <-->|status + cues only<br/>never audio| WR
  E1[ESP32 studio-doors] & E2[ESP32 studio-sense] & E3[ESP32 kitchen-safety] & E4[ESP32 wet-zones] & E5[ESP32 perimeter] & E6[ESP32 panic-loop] -->|ESPHome encrypted API| HA
  WR --> APP[Studio Command app<br/>every iPhone · Android · panels]
  HA --> COMP[HA Companion app<br/>critical alerts through silent mode]
  APP --> D1[Front-of-house display] & D2[Front-of-studio display] & D3[Wall iPad]
  MAC[Recording Mac<br/>record_gate.py + GuardedRecord.lua] -->|reads studio_ready| HA
```

## Reed switches on a double door (the double-door trap)

```
        leaf A                    leaf B
   ┌──────────────┐         ┌──────────────┐
   │            [M]│⟍     ⟋│[M]            │   M = magnet, on each LEAF, top rail
   │               │ [R] [R]│               │   R = MC-38 reed, on the FRAME between
   └──────────────┘         └──────────────┘       the leaves — one per leaf
```
Two reeds per double door. If either leaf drifts open, that reed opens → studio_ready
drops. Never one reed across both leaves: it goes blind when one leaf opens alone.

## Acoustic sensor placement (per independently-recording room)

```
   door ✗  (between the doors measures the GAP — reeds live there, mics don't)
   ┌───────────────────────────────┐
   │   AC vent ✗                   │
   │            [SEN0232] ✓        │  ← ear height (~1.2–1.5 m), near the
   │            recording position │     recording position, open air,
   │   speaker blast ✗             │     away from vents/door/monitors
   └───────────────────────────────┘
```
One SEN0232 in the recording studio, one in the teaching room. Signal: 5 V → SEN0232 →
0.6–2.6 V analog → ESP32 GPIO34 (12 db attenuation). 10 mV = 1 dBA.

## Panic loop (wired by the low-voltage technician)

```
  12V battery-backed PSU ──[sounder relay NC]──[P1]──[P2]──[P3]──[P4]──┐
        │                                                              │
        └────────────────────────── loop return ───────────────────────┘
  P1..P4 = latching panic switches, wired NORMALLY-CLOSED in series.
  Any press breaks the loop → sounder fires. No Pi, no Wi-Fi, no software.
  ESP32 panic-loop node watches the same loop voltage through an opto — observe only.
```

## Certified alarm → app alerts (without touching the alarm)

```
  Certified LPG / smoke alarm ──(its own siren, standalone)──► the actual protection
            │
            └─ volt-free relay contact ──► ESP32 GPIO (pullup) ──► HA ──► phones ring
```

## WS2812B tally strip

```
  5V SMPS ──► strip 5V + ESP32 VIN (grounds COMMON)
  ESP32 GPIO18 ──► 74AHCT level shifter ──► strip DIN
  Strip in the aluminium channel above the studio door; color = studio state.
```
