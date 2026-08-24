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
    id: "studio",
    name: "1 · Studio",
    phase: "critical",
    file: "room-studio.yaml",
    parts: "ESP32 · 192.168.0.250 · reeds ×2, SEN0232, LD2410, leak probe, SHT31",
    wires: [
      { from: "Studio leaf A / B", to: "GPIO25 / 26", color: "green" },
      { from: "Sink leak probe", to: "GPIO27", color: "gold" },
      { from: "SEN0232 signal", to: "GPIO34", color: "green", note: "dBA = volts × 50" },
      { from: "LD2410 TX / RX", to: "GPIO16 / 17", color: "gold" },
    ],
    test: ["Open http://192.168.0.250 on a phone — type http://, Chrome will try https.", "Jumper GPIO25 to GND: leaf A must read closed. Remove it: open.", "Speak near the sound meter; the number must move. An unwired pin reporting 7 dBA is a lie.", "Stand in the room: presence stays on."],
  },
  {
    id: "music",
    name: "2 · Music room",
    phase: "critical",
    file: "room-music.yaml",
    parts: "ESP32 · 192.168.0.251 · teaching reeds ×2, leak, flame, SHT31 (needs soldering)",
    wires: [
      { from: "Teaching leaf A / B", to: "GPIO25 / 26", color: "green" },
      { from: "Leak probe", to: "GPIO27", color: "gold" },
      { from: "Flame D0", to: "GPIO33", color: "green" },
      { from: "SHT31 SDA / SCL", to: "GPIO21 / 22", color: "gold", note: "header must be soldered" },
    ],
    test: ["Open http://192.168.0.251.", "Each teaching leaf must identify itself when opened.", "No second sound meter exists for this room — do not wire GPIO34."],
  },
  {
    id: "bath-a",
    name: "3 · Bathrooms A + geyser",
    phase: "critical",
    file: "node-3-bath-a.yaml",
    parts: "ESP32 · 192.168.0.252 · leak probes ×3, DHT22",
    warning: "Keep the ESP32 and the small probe boards dry and high. Only the flat comb goes on the floor.",
    wires: [
      { from: "Bathroom A1 / A2", to: "GPIO25 / 26", color: "green" },
      { from: "Geyser overflow", to: "GPIO27", color: "gold" },
      { from: "DHT22 data", to: "GPIO32", color: "green" },
    ],
    test: ["Open http://192.168.0.252 — this board is already on its static address.", "Damp cloth on one comb at a time. Confirm the exact name, then dry it."],
  },
  {
    id: "bath-b",
    name: "4 · Bathrooms B + washer",
    phase: "critical",
    file: "node-4-bath-b.yaml",
    parts: "ESP32 · 192.168.0.253 · leak probes ×3, washer vibration, DHT22",
    wires: [
      { from: "Bathroom B1 / B2", to: "GPIO25 / 26", color: "green" },
      { from: "Washer leak", to: "GPIO27", color: "gold" },
      { from: "SW-420 washer", to: "GPIO32", color: "green" },
    ],
    test: ["Same damp-cloth test as board 3.", "Washer running holds for 3 minutes after the last shake."],
  },
  {
    id: "kitchen",
    name: "5 · Kitchen",
    phase: "critical",
    file: "node-5-kitchen.yaml",
    parts: "ESP32 · 192.168.0.254 · leak, flame, PIR, MQ-6 ×4 (need dividers), HX711",
    warning: "MQ-6 modules are trend sensors, not a safety device. Every analogue line needs a 10k/20k divider. The certified LPG detector is the alarm.",
    wires: [
      { from: "Sink leak / flame / PIR", to: "GPIO25 / 26 / 27", color: "green" },
      { from: "MQ-6 AO via divider", to: "GPIO34 / 35 / 36 / 39", color: "gold", note: "commented in firmware until soldered" },
      { from: "HX711 DT / SCK", to: "GPIO18 / 19", color: "green" },
    ],
    test: ["Do not publish analogue gas numbers until the dividers are in.", "Uncomment the certified LPG contact the day that relay is wired to GPIO32."],
  },
  {
    id: "hall",
    name: "6 · Hall / entrance",
    phase: "critical",
    file: "node-6-hall.yaml",
    parts: "ESP32 · 192.168.0.249 · main door, doorbell, PIR ×2, flame, vibration",
    wires: [
      { from: "Main door reed", to: "GPIO25", color: "green" },
      { from: "Doorbell button", to: "GPIO26", color: "gold" },
      { from: "Hall / entrance PIR", to: "GPIO27 / 32", color: "green" },
      { from: "Flame / vibration", to: "GPIO33 / 18", color: "gold" },
    ],
    test: ["Press the doorbell: the entity must hold for 2 seconds.", "This is awareness, not a certified alarm."],
  },
];

const INSTALL_STEPS = [
  "Power each ESP32 from its own USB charger on the school Wi-Fi",
  "Give boards 3–6 static addresses (.252 .253 .254 .249) and reflash",
  "Wire reeds, leak probes and the studio sound meter — push-fit only",
  "On the studio Mac, run the LAN app and open that address on every phone",
  "Calibrate: reed direction, quiet-enough dBA, radar gates",
  "Do not buy door tablets until this app shows real board data",
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
  const [open, setOpen] = useState("studio");
  const [done, setDone] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) ?? "[]"); } catch { return []; }
  });

  useEffect(() => localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(done)), [done]);

  const liveSignals = useMemo(() => [
    { label: "Boards", ok: connected, detail: connectionStatus },
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

      {dataSource === "mock" && <div className="mt-3 rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-xs text-gold">Demo data is active. On the school Wi-Fi, open the Mac LAN address (port 8126) to see the real boards.</div>}
      {anyAlert && <div className="mt-3 rounded-xl border border-st-audio/50 bg-st-audio/10 px-4 py-3 text-sm font-semibold text-st-audio">A safety input is active. Clear the physical cause before continuing.</div>}

      <section className="mt-6 rounded-3xl border border-line bg-surface/75 p-4 sm:p-5">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Installation order</div>
            <h3 className="font-display mt-1 text-xl">Six checkpoints</h3>
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
