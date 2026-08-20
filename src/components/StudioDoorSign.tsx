import React, { useEffect, useRef, useState } from "react";
import { StudioState } from "../api/types";
import {
  DEFAULT_DOOR_WARN_DBA,
  DOOR_WARN_HOLD_MS,
  DoorVisualId,
  resolveStudioDoorPreset,
} from "../door/studioDoorPresets";

/**
 * G2 lintel sign. Top plate is the preset picture. Bottom strip is the
 * rolling line. Colour matches the puck. The two hall warnings from the
 * paper — puck and this plate — are the same row.
 */
export default function StudioDoorSign({
  state,
  dbLevel,
  doorWarnDb = DEFAULT_DOOR_WARN_DBA,
  doorOpen,
  visualOverride,
}: {
  state: StudioState;
  dbLevel?: number | null;
  doorWarnDb?: number;
  doorOpen: boolean;
  visualOverride?: DoorVisualId | null;
}) {
  const loudUntil = useRef(0);
  const [, tick] = useState(0);

  if (dbLevel != null && dbLevel >= doorWarnDb) {
    loudUntil.current = Date.now() + DOOR_WARN_HOLD_MS;
  }
  const acousticHold = Date.now() < loudUntil.current;

  useEffect(() => {
    if (!acousticHold) return;
    const t = window.setTimeout(() => tick((n) => n + 1), Math.max(50, loudUntil.current - Date.now()));
    return () => window.clearTimeout(t);
  }, [acousticHold, dbLevel]);

  const preset = resolveStudioDoorPreset({
    state,
    dbLevel,
    doorWarnDb,
    doorOpen,
    visualOverride,
    acousticHold,
  });
  const line = preset.tickers.join("    ·    ");
  const rec = preset.id === "dnd" || preset.id === "onair" || preset.id === "sos";

  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden bg-ink" style={{ ["--door-accent" as string]: preset.color }}>
      <section className="relative min-h-0 flex-[3]">
        <img src={preset.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: `radial-gradient(circle at 50% 48%, ${preset.color}55, transparent 62%)` }}
        />
        <div className={`absolute inset-0 flex items-center justify-center ${rec ? "panel-pulse" : ""}`}>
          <h1
            className="px-6 text-center font-display font-semibold leading-none tracking-[-0.04em]"
            style={{
              color: preset.color,
              fontSize: "clamp(4.25rem, 16vw, 8.5rem)",
              textShadow: `0 0 48px ${preset.color}88`,
            }}
          >
            {preset.mark}
          </h1>
        </div>
      </section>

      <section
        className="relative flex min-h-[22vh] flex-[2] items-center overflow-hidden border-t"
        style={{ borderColor: `${preset.color}66`, background: "#08080c" }}
      >
        <div className="door-ticker-mask w-full py-6">
          <div className="door-ticker-track font-display text-[clamp(1.6rem,4.6vw,2.75rem)] text-paper">
            <span>{line}</span>
            <span aria-hidden="true">{line}</span>
          </div>
        </div>
      </section>
    </div>
  );
}
