import React, { useRef } from "react";
import { useStore } from "../state/store";

/**
 * In-app banner when the studio meter crosses the recording-quiet line.
 * Phone banners (Settings → Studio too loud) fire from the store on the same edge.
 */
export function useNoiseAlert() {
  const { rooms, settings, preflight } = useStore();
  const wasLoud = useRef(false);
  const studio = rooms.find((r) => r.id === "studio");
  const db = studio?.dbLevel ?? preflight?.dbLevel ?? null;
  if (db == null) {
    wasLoud.current = false;
    return null;
  }
  const threshold = settings.dbThreshold;
  const on = db >= threshold;
  const off = db < threshold - 3;
  const loud = wasLoud.current ? !off : on;
  wasLoud.current = loud;
  if (!loud) return null;
  return { db: Math.round(db), threshold };
}

export default function NoiseBanner() {
  const alert = useNoiseAlert();
  if (!alert) return null;

  return (
    <div
      className="rise-in fixed inset-x-4 top-16 z-[29] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-st-audio/50 bg-surface/95 p-3.5 backdrop-blur sm:inset-x-auto sm:right-5 sm:top-5 sm:mx-0 sm:w-[21rem] lg:top-20"
      role="status"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-st-audio/20 font-mono text-[10px] text-st-audio">
        dB
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold text-st-audio">Studio is too loud</div>
        <div className="font-mono text-[10px] text-dim">
          {alert.db} dB · quiet line is {alert.threshold} dB
        </div>
      </div>
    </div>
  );
}
