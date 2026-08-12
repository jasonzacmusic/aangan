import React, { useEffect, useMemo, useState } from "react";
import { ChevronDownIcon, CheckIcon, ChipIcon } from "../components/icons";
import { useStore } from "../state/store";

type Wire = { from: string; to: string; color: "red" | "black" | "green" | "gold"; note?: string };
type NodeGuide = {
  id: string;
  name: string;
  phase: "critical" | "expansion";
  file: string;
  parts: string;
  warning?: string;
  wires: Wire[];
  test: string[];
};

const WIRE_COLOR = { red: "#e5484d", black: "#8b8b96", green: "#2fbf71", gold: "#c9a84c" };

const NODES: NodeGuide[] = [
  {
    id: "doors",
    name: "1 · Studio doors",
    phase: "critical",
    file: "studio-doors.yaml",
    parts: "ESP32 + MC-38 reed switches ×4",
    wires: [
      { from: "Reed A/B", to: "GPIO25 / 26", color: "green" },
      { from: "Teaching A/B", to: "GPIO32 / 33", color: "gold" },
      { from: "Other reed lead", to: "GND rail", color: "black" },
    ],
    test: ["Flash the node and open its ESPHome logs.", "Jumper GPIO25 to GND: Studio leaf A must read closed.", "Remove the jumper: it must read open. Repeat 26, 32, and 33.", "Mount one reed on each leaf; test each leaf separately."],
  },
  {
    id: "sense",
    name: "2 · Studio sense",
    phase: "critical",
    file: "studio-sense.yaml",
    parts: "ESP32 + SEN0232 ×2 + LD2410 + WS2812B/74AHCT",
    wires: [
      { from: "SEN0232 A", to: "GPIO34 / 35", color: "green", note: "dBA = volts × 50" },
      { from: "LD2410 TX / RX", to: "GPIO16 / 17", color: "gold" },
      { from: "74AHCT output", to: "WS2812 DIN", color: "green" },
      { from: "All grounds", to: "Common GND", color: "black" },
    ],
    test: ["At ordinary speech, each sound sensor should move—not pin at 0 or 130 dBA.", "Stand still in front of LD2410 for 20 seconds; presence must stay on.", "Turn on the tally light in Home Assistant and check all LEDs.", "Measure 5 V at the strip before connecting data."],
  },
  {
    id: "kitchen",
    name: "3 · Kitchen safety",
    phase: "critical",
    file: "kitchen-safety.yaml",
    parts: "ESP32 + certified LPG relay + flame + leak + MQ-6 ×4",
    warning: "Never feed alarm mains/siren voltage into the ESP32. Use only a volt-free relay contact. Every MQ-6 AO needs a 10k/20k divider.",
    wires: [
      { from: "Certified alarm contact", to: "GPIO25 + GND", color: "green" },
      { from: "Flame D0 / leak", to: "GPIO26 / 32", color: "gold" },
      { from: "MQ-6 AO via divider", to: "GPIO34 / 35 / 36 / 39", color: "green" },
      { from: "MQ heaters", to: "5 V supply", color: "red", note: "not ESP32 3V3" },
    ],
    test: ["With no mains connected, close the dry relay contact: Gas must change to alert.", "Bridge flame D0 to GND: Kitchen flame must alert.", "Touch only the leak probe with a damp cloth; it must alert after 0.5 s.", "Leave MQ-6 readings as secondary trends; use the certified alarm test button for acceptance."],
  },
  {
    id: "wet",
    name: "4 · Wet zones",
    phase: "critical",
    file: "wet-zones.yaml",
    parts: "ESP32 + leak probes ×8",
    warning: "GPIO34/35/39 have no internal pull-up. Add 10k from each pin to 3.3 V.",
    wires: [
      { from: "Probe lead 1", to: "GPIO25/26/27/32/33/34/35/39", color: "green" },
      { from: "Probe lead 2", to: "GND rail", color: "black" },
      { from: "10k pull-ups", to: "3.3 V → GPIO34/35/39", color: "red" },
    ],
    test: ["Dry probe must read clear.", "Use a damp cloth—do not pour water on the breadboard.", "Verify the exact entity name, then dry the probe and confirm clear.", "Repeat every input before routing cables."],
  },
  {
    id: "perimeter",
    name: "5 · Perimeter",
    phase: "critical",
    file: "perimeter.yaml",
    parts: "ESP32 + reeds ×3 + SW-420 ×5 + PIR ×4",
    wires: [
      { from: "Door reeds", to: "GPIO25 / 26 / 27 + GND", color: "green" },
      { from: "SW-420 D0", to: "GPIO32 / 33 / 34 / 35 / 39", color: "gold" },
      { from: "PIR OUT", to: "GPIO13 / 14 / 18 / 19", color: "green" },
    ],
    test: ["Open each reed input and verify the named door.", "Tap each SW-420 once; the result should stay on for 3 seconds, then clear.", "Walk across each PIR field; verify it clears after the module's own delay.", "Run the test while Studio state = Audio Rec and confirm the perimeter notification."],
  },
  {
    id: "panic",
    name: "6 · Panic & alarm listener",
    phase: "critical",
    file: "panic-loop.yaml",
    parts: "ESP32 + optocoupler interface + smoke relay contacts + flame ×3",
    warning: "The 12 V NC panic loop is technician work. The ESP32 sees only the isolated optocoupler output.",
    wires: [
      { from: "Isolated panic output", to: "GPIO25", color: "green" },
      { from: "Smoke dry contacts", to: "GPIO26 / 27 + GND", color: "gold" },
      { from: "Flame D0", to: "GPIO32 / 33 / 21", color: "green" },
    ],
    test: ["Power the standalone sounder with the Pi off; each latching button must fire it.", "At the isolated ESP32 side only, open GPIO25: Panic must alert.", "Close each smoke dry contact and verify the correct alarm entity.", "Confirm every family phone rings before marking this node complete."],
  },
  {
    id: "camera",
    name: "7 · Entrance camera",
    phase: "expansion",
    file: "doorbell-cam.yaml",
    parts: "AI-Thinker ESP32-CAM + USB-to-serial adapter",
    wires: [
      { from: "Adapter 5 V / GND", to: "ESP32-CAM 5 V / GND", color: "red" },
      { from: "Adapter TX / RX", to: "U0R / U0T (crossed)", color: "green" },
      { from: "GPIO0", to: "GND while flashing only", color: "black" },
    ],
    test: ["Flash with GPIO0 tied to GND.", "Remove that jumper and reset.", "Adopt camera.entrance in Home Assistant.", "Open Safety → Refresh and confirm a current image."],
  },
  {
    id: "air",
    name: "8 · Air nodes ×3",
    phase: "expansion",
    file: "air_node.yaml",
    parts: "ESP32 ×3 + PMS5003 + SCD41 + SGP41 + SHT45 per room",
    wires: [
      { from: "I²C SDA / SCL", to: "GPIO21 / 22", color: "green" },
      { from: "PMS5003 TX", to: "GPIO16", color: "gold" },
      { from: "I²C sensors", to: "3.3 V + GND", color: "red" },
      { from: "PMS5003", to: "5 V + GND", color: "black" },
    ],
    test: ["Flash once per room after changing room/room_name substitutions.", "Check I²C scan finds SCD41, SGP41, and SHT45.", "Breathe near SCD41: CO₂ should rise after its update interval.", "Do not judge VOC/NOx until the algorithm has settled."],
  },
  {
    id: "pulse",
    name: "9 · House Pulse",
    phase: "expansion",
    file: "house-pulse.yaml",
    parts: "ESP32 + JSN-SR04T ×2 + HX711/load cells + DHT22",
    warning: "Each ultrasonic echo is 5 V. Use a 10k/20k divider before GPIO34/35.",
    wires: [
      { from: "Tank TRIG", to: "GPIO25 / 26", color: "green" },
      { from: "Tank ECHO via divider", to: "GPIO34 / 35", color: "gold" },
      { from: "HX711 DT / SCK", to: "GPIO18 / 19", color: "green" },
      { from: "DHT22 data", to: "GPIO23", color: "gold" },
    ],
    test: ["Point each ultrasonic sensor at a flat board and compare displayed metres to a tape measure.", "Edit the four empty/full distance substitutions after mounting.", "Record HX711 raw value empty, then with a known mass; add calibrate_linear.", "Do not enable pump control until physical dry-run and high-level cutoffs are tested."],
  },
];

const INSTALL_STEPS = [
  "Install ESPHome, File editor/Samba, and Aangan Bridge in Home Assistant",
  "Create secrets.yaml and flash the six critical ESP32 nodes",
  "Adopt nodes; copy and validate the Home Assistant package",
  "Install Companion on every phone and prove critical alerts",
  "Mount only after every breadboard input passes",
  "Run the power-cut and recording-gate acceptance tests",
];

const CHECKLIST_STORAGE_KEY = "aangan-install-checklist:v1";

function Wiring({ wires }: { wires: Wire[] }) {
  return (
    <div className="rounded-2xl border border-line bg-ink/70 p-3" aria-label="Wiring map">
      {wires.map((wire, index) => (
        <div key={`${wire.from}-${wire.to}`} className={`grid grid-cols-[1fr_2.5rem_1fr] items-center gap-2 py-2 ${index ? "border-t border-line/60" : ""}`}>
          <span className="text-xs text-paper">{wire.from}</span>
          <span className="relative h-2" aria-hidden>
            <span className="absolute inset-x-0 top-1/2 h-0.5 -translate-y-1/2" style={{ background: WIRE_COLOR[wire.color] }} />
            <span className="absolute left-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full" style={{ background: WIRE_COLOR[wire.color] }} />
            <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full" style={{ background: WIRE_COLOR[wire.color] }} />
          </span>
          <span className="text-right font-mono text-[10px] text-dim">{wire.to}</span>
          {wire.note && <span className="col-span-3 text-[10px] text-st-meeting">{wire.note}</span>}
        </div>
      ))}
    </div>
  );
}

export default function Setup() {
  const { connected, connectionStatus, preflight, safety, notificationPermission, dataSource } = useStore();
  const [open, setOpen] = useState("doors");
  const [done, setDone] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) ?? "[]"); } catch { return []; }
  });

  useEffect(() => localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(done)), [done]);

  const liveSignals = useMemo(() => [
    { label: "Bridge", ok: connected, detail: connectionStatus },
    { label: "Critical nodes", ok: !!preflight?.sensorsHealthy, detail: preflight?.sensorsHealthy ? "reporting" : "not all online" },
    { label: "Safety inputs", ok: !!preflight?.safetyClear, detail: preflight?.safetyClear ? "clear" : "check Safety" },
    { label: "This device", ok: notificationPermission === "granted", detail: notificationPermission === "granted" ? "alerts enabled" : "alerts not enabled" },
  ], [connected, connectionStatus, notificationPermission, preflight]);
  const anyAlert = safety && Object.values(safety).some(Boolean);

  const toggleDone = (id: string) => setDone((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);

  return (
    <div className="rise-in page-shell">
      <h2 className="font-display mb-1 text-2xl lg:text-3xl">Install & test</h2>
      <p className="mb-5 font-mono text-[11px] text-dim">breadboard first · mount second · mains never on the board</p>

      <section className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {liveSignals.map((signal) => (
          <div key={signal.label} className={`rounded-xl border p-3 ${signal.ok ? "border-st-available/30 bg-st-available/5" : "border-st-meeting/35 bg-st-meeting/5"}`}>
            <div className="flex items-center gap-2">
              <span className={`h-2 w-2 rounded-full ${signal.ok ? "bg-st-available" : "bg-st-meeting"}`} />
              <span className="font-mono text-[9px] uppercase tracking-wider text-dim">{signal.label}</span>
            </div>
            <div className={`mt-2 text-xs font-semibold ${signal.ok ? "text-paper" : "text-st-meeting"}`}>{signal.detail}</div>
          </div>
        ))}
      </section>

      {dataSource === "mock" && <div className="mt-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-gold">Demo data is active. Install the Home Assistant Aangan Bridge and open port 8126 to see physical sensors.</div>}
      {anyAlert && <div className="mt-3 rounded-xl border border-st-audio/50 bg-st-audio/10 px-4 py-3 text-sm font-semibold text-st-audio">A safety input is active. Clear the physical cause before continuing.</div>}

      <section className="mt-6 rounded-3xl border border-line bg-surface/75 p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Installation order</div>
            <h3 className="font-display mt-1 text-xl">Tomorrow's six checkpoints</h3>
          </div>
          <span className="font-mono text-[10px] text-dim">{done.filter((id) => id.startsWith("step-")).length}/6</span>
        </div>
        <div className="mt-4 space-y-2">
          {INSTALL_STEPS.map((step, index) => {
            const id = `step-${index}`;
            const checked = done.includes(id);
            return (
              <button key={id} onClick={() => toggleDone(id)} className="flex w-full items-start gap-3 rounded-xl border border-line bg-ink/50 p-3 text-left active:scale-[0.995]">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border ${checked ? "border-st-available bg-st-available/20 text-st-available" : "border-line text-dim"}`}>{checked ? <CheckIcon size={14} /> : index + 1}</span>
                <span className={`text-sm ${checked ? "text-dim line-through" : "text-paper"}`}>{step}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Node-by-node</div>
          <h3 className="font-display mt-1 text-2xl">Breadboard guide</h3>
        </div>
        <div className="font-mono text-[9px] text-dim"><span className="text-st-audio">red</span> power · <span className="text-st-available">green</span> signal · grey ground</div>
      </div>

      <div className="mt-4 space-y-3">
        {NODES.map((node) => {
          const expanded = open === node.id;
          const checked = done.includes(`node-${node.id}`);
          return (
            <article key={node.id} className={`overflow-hidden rounded-2xl border bg-surface/80 ${expanded ? "border-gold/40" : "border-line"}`}>
              <button onClick={() => setOpen(expanded ? "" : node.id)} className="flex min-h-20 w-full items-center gap-3 p-4 text-left" aria-expanded={expanded} aria-controls={`node-guide-${node.id}`}>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${node.phase === "critical" ? "bg-st-audio/10 text-st-audio" : "bg-gold/10 text-gold"}`}><ChipIcon size={20} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block font-display text-lg">{node.name}</span>
                  <span className="mt-0.5 block truncate text-xs text-dim">{node.parts}</span>
                  <span className={`mt-1 block font-mono text-[8px] uppercase tracking-wider ${node.phase === "critical" ? "text-st-audio" : "text-gold"}`}>{node.phase} · {node.file}</span>
                </span>
                <ChevronDownIcon size={18} className={`text-dim transition-transform ${expanded ? "rotate-180" : ""}`} />
              </button>
              {expanded && (
                <div id={`node-guide-${node.id}`} className="border-t border-line p-4">
                  {node.warning && <div className="mb-3 rounded-xl border border-st-meeting/40 bg-st-meeting/5 px-3 py-2.5 text-xs leading-relaxed text-st-meeting">{node.warning}</div>}
                  <Wiring wires={node.wires} />
                  <div className="mt-4">
                    <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Breadboard test</div>
                    <ol className="mt-2 space-y-2">
                      {node.test.map((test, index) => <li key={test} className="flex gap-3 text-xs leading-relaxed text-paper"><span className="font-mono text-gold">{index + 1}</span><span>{test}</span></li>)}
                    </ol>
                  </div>
                  <button onClick={() => toggleDone(`node-${node.id}`)} className={`mt-4 flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${checked ? "border-st-available/40 bg-st-available/10 text-st-available" : "border-line text-dim"}`}>
                    {checked && <CheckIcon size={16} />}{checked ? "Breadboard test passed" : "Mark breadboard test passed"}
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className="mt-6 rounded-2xl border border-st-audio/30 bg-st-audio/5 p-4 text-xs leading-relaxed text-dim">
        <strong className="text-st-audio">Stop here for mains, 12 V alarm loops, pumps, AC, geysers, or unknown relay outputs.</strong> A low-voltage/fire-alarm technician handles those. The team breadboards only isolated 3.3/5 V sensor-side signals.
      </div>
    </div>
  );
}
