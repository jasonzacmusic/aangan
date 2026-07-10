import React from "react";
import { useStore } from "../state/store";

function LevelBar({ label, value, color = "#3b82f6" }: { label: string; value: number; color?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between font-mono text-[9px] uppercase tracking-wider text-dim">
        <span>{label}</span>
        <span style={{ color }}>{Math.round(value)}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink">
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color, boxShadow: `0 0 8px ${color}66` }} />
      </div>
    </div>
  );
}

export default function UtilitiesPanel() {
  const { utilities, runUtilityAction } = useStore();
  if (!utilities) return null;
  const { water, power, lpg, air } = utilities;
  const airColor = air.aqi <= 50 ? "#2fbf71" : air.aqi <= 100 ? "#f5a623" : "#e5484d";
  const gasColor = lpg.remainingPct < 20 ? "#e5484d" : "#c9a84c";

  return (
    <section className="mt-7">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <h3 className="font-display text-xl">House Pulse</h3>
          <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Bangalore essentials · live</p>
        </div>
        <span className="rounded-full border border-st-available/30 bg-st-available/5 px-2.5 py-1 font-mono text-[8px] uppercase tracking-wider text-st-available">Pi-ready</span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <article className="rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Water system</div>
              <div className="font-display mt-1 text-xl">Tanks protected</div>
            </div>
            <span className={`rounded-full px-2 py-1 font-mono text-[8px] uppercase tracking-wider ${water.pumpRunning ? "bg-st-class/15 text-st-class" : "bg-surface2 text-dim"}`}>
              {water.pumpRunning ? "Pump filling" : "Pump idle"}
            </span>
          </div>
          <div className="mt-4 space-y-3">
            <LevelBar label="Overhead" value={water.overheadPct} color="#3b82f6" />
            <LevelBar label="Sump" value={water.sumpPct} color="#2fbf71" />
          </div>
          <button
            onClick={() => runUtilityAction("water_pump_toggle")}
            className="mt-4 w-full rounded-xl border border-st-class/35 bg-st-class/10 px-3 py-2.5 text-xs font-semibold text-st-class active:scale-[0.99]"
          >
            {water.pumpRunning ? "Stop pump" : "Fill overhead tank"}
          </button>
          <div className="mt-2 text-center font-mono text-[8px] uppercase tracking-wider text-dim">dry-run cutoff {water.dryRunProtected ? "armed" : "unavailable"}</div>
        </article>

        <article className={`rounded-2xl border bg-surface/80 p-4 backdrop-blur ${power.mainsOnline ? "border-line" : "emergency-flash border-st-meeting/60"}`}>
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Power & inverter</div>
          <div className="mt-2 flex items-end justify-between">
            <div>
              <div className={`font-display text-2xl ${power.mainsOnline ? "text-st-available" : "text-st-meeting"}`}>{power.mainsOnline ? "Mains stable" : "On inverter"}</div>
              <div className="mt-1 text-xs text-dim">{power.mainsOnline ? `${power.voltage.toFixed(0)} V · surge guard online` : `${power.estimatedMinutes} min estimated runtime`}</div>
            </div>
            <div className="font-mono text-xl text-gold">{Math.round(power.inverterPct)}%</div>
          </div>
          <div className="mt-4"><LevelBar label="Inverter battery" value={power.inverterPct} color={power.mainsOnline ? "#c9a84c" : "#f5a623"} /></div>
          <div className="mt-4 rounded-xl border border-line bg-ink/60 px-3 py-2 text-xs text-dim">Recording guard: {power.mainsOnline ? "full power available" : "finish the take or pause safely"}</div>
        </article>

        <article className="rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur">
          <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">LPG cylinder</div>
          <div className="mt-2 flex items-baseline justify-between">
            <div className="font-display text-2xl" style={{ color: gasColor }}>{lpg.estimatedDays} days</div>
            <div className="font-mono text-xs" style={{ color: gasColor }}>{Math.round(lpg.remainingPct)}% left</div>
          </div>
          <div className="mt-3"><LevelBar label="Load-cell estimate" value={lpg.remainingPct} color={gasColor} /></div>
          <p className="mt-3 text-xs text-dim">A low-cylinder nudge arrives before the flame runs out.</p>
        </article>

        <article className="rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-dim">Music-room air</div>
              <div className="font-display mt-1 text-2xl" style={{ color: airColor }}>AQI {air.aqi}</div>
            </div>
            <div className="text-right font-mono text-[9px] leading-relaxed text-dim">PM2.5 {air.pm25}<br />{air.humidityPct}% RH</div>
          </div>
          <p className="mt-2 text-xs text-dim">{air.aqi <= 50 ? "Clean air for a long session." : air.aqi <= 100 ? "Moderate — purifier can freshen the room." : "Poor air — purification recommended now."}</p>
          <button
            onClick={() => runUtilityAction("purifier_toggle")}
            className="mt-4 w-full rounded-xl border px-3 py-2.5 text-xs font-semibold active:scale-[0.99]"
            style={{ borderColor: `${airColor}55`, color: airColor, background: `${airColor}12` }}
          >
            Turn purifier {air.purifierOn ? "off" : "on"}
          </button>
        </article>
      </div>
    </section>
  );
}
