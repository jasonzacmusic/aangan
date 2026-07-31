import React, { useEffect, useState } from "react";
import { useStore } from "../state/store";
import { PianoIcon, WindowIcon } from "./icons";

export interface AirAlert {
  kind: "co2" | "climate";
  title: string;
  detail: string;
}

/**
 * The two air alerts that matter enough to interrupt:
 *   • CO₂ — nobody can smell it, a purifier cannot fix it, only fresh air can.
 *   • Instrument climate — sustained damp or dryness is what warps pianos.
 * Both hold on for a margin below the threshold so a jittery sensor cannot
 * flicker the banner.
 */
export function useAirAlerts(): AirAlert[] {
  const { air, settings, stateInfo } = useStore();
  const [latched, setLatched] = useState({ co2: false, climate: false });

  const rooms = air?.rooms ?? [];
  const worstCo2 = rooms.reduce((worst, r) => (r.co2 > (worst?.co2 ?? 0) ? r : worst), rooms[0]);
  const offBand = rooms.filter((r) => r.humidityPct > settings.rhMax || r.humidityPct < settings.rhMin);

  const co2On = !!worstCo2 && worstCo2.co2 >= settings.co2Threshold;
  const co2Off = !worstCo2 || worstCo2.co2 < settings.co2Threshold - 100;
  const climateOn = offBand.length > 0;
  const climateOff = offBand.length === 0;

  useEffect(() => {
    setLatched((prev) => {
      const co2 = prev.co2 ? !co2Off : co2On;
      const climate = prev.climate ? !climateOff : climateOn;
      return co2 === prev.co2 && climate === prev.climate ? prev : { co2, climate };
    });
  }, [co2On, co2Off, climateOn, climateOff]);

  const alerts: AirAlert[] = [];
  if (latched.co2 && worstCo2) {
    const inClass = stateInfo?.state === "class" || stateInfo?.state === "meeting";
    alerts.push({
      kind: "co2",
      title: inClass ? "Crack the door — the room is going stale" : "Let some fresh air in",
      detail: `${worstCo2.name} is at ${worstCo2.co2} ppm CO₂${inClass ? " — this is what makes students dull" : ""}`,
    });
  }
  if (latched.climate && offBand.length) {
    const r = offBand[0];
    const damp = r.humidityPct > settings.rhMax;
    alerts.push({
      kind: "climate",
      title: damp ? "Too damp for the instruments" : "Too dry for the instruments",
      detail: `${r.name} at ${r.humidityPct.toFixed(0)}% humidity · safe band is ${settings.rhMin}–${settings.rhMax}%`,
    });
  }
  return alerts;
}

export default function AirBanner({ variant = "app" }: { variant?: "app" | "panel" }) {
  const alerts = useAirAlerts();
  if (!alerts.length) return null;

  if (variant === "panel") {
    return (
      <div className="mt-6 flex flex-col items-center gap-3">
        {alerts.map((a) => (
          <div key={a.kind} className="flex items-center justify-center gap-4 rounded-2xl border border-st-meeting/50 bg-st-meeting/10 px-8 py-4">
            {a.kind === "co2" ? <WindowIcon size={34} className="shrink-0 text-st-meeting" /> : <PianoIcon size={34} className="shrink-0 text-st-meeting" />}
            <div className="text-left">
              <div className="font-display text-2xl text-st-meeting">{a.title}</div>
              <div className="mt-0.5 font-mono text-sm text-paper/80">{a.detail}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-2">
      {alerts.map((a) => (
        <div key={a.kind} className="rise-in flex items-center gap-3 rounded-2xl border border-st-meeting/50 bg-st-meeting/10 p-3.5" role="status">
          {a.kind === "co2" ? <WindowIcon size={22} className="shrink-0 text-st-meeting" /> : <PianoIcon size={22} className="shrink-0 text-st-meeting" />}
          <div className="flex-1">
            <div className="text-sm font-semibold text-st-meeting">{a.title}</div>
            <div className="font-mono text-[10px] text-dim">{a.detail}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
