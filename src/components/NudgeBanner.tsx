import React, { useRef } from "react";
import { useStore } from "../state/store";
import { DoorIcon } from "./icons";

/**
 * The "close the door" nudge: when any monitored door is open AND the music
 * room is louder than the recording-quiet threshold, the house asks for the
 * door to be closed. Computed client-side from live rooms data with a little
 * hysteresis so the banner never flickers on dB jitter.
 */
export function useDoorNudge() {
  const { rooms, settings } = useStore();
  const wasActive = useRef(false);
  const music = rooms.find((r) => r.dbLevel != null);
  const openDoors = rooms.filter((r) => r.doorOpen);
  const db = music?.dbLevel ?? 0;
  const threshold = settings.doorWarnDb;
  const on = db >= threshold;
  const off = db < threshold - 3;
  const active = openDoors.length > 0 && (wasActive.current ? !off : on);
  wasActive.current = active;
  if (!active) return null;
  const names = openDoors.map((r) => r.name).join(" + ");
  return { names, db: Math.round(db), count: openDoors.length };
}

export default function NudgeBanner({ variant = "app" }: { variant?: "app" | "panel" }) {
  const nudge = useDoorNudge();
  if (!nudge) return null;

  if (variant === "panel") {
    return (
      <div className="emergency-flash mt-8 flex items-center justify-center gap-4 rounded-2xl border border-st-meeting/60 bg-st-meeting/15 px-8 py-5">
        <DoorIcon size={34} className="shrink-0 text-st-meeting" />
        <div className="text-left">
          <div className="font-display text-3xl text-st-meeting">Please close the {nudge.count > 1 ? "doors" : "door"}</div>
          <div className="mt-1 font-mono text-sm text-paper/80">{nudge.names} open · {nudge.db} dB in the music room</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rise-in fixed inset-x-4 top-16 z-[30] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-st-meeting/50 bg-surface/95 p-3.5 shadow-2xl shadow-black/50 backdrop-blur sm:inset-x-auto sm:right-5 sm:top-5 sm:mx-0 sm:w-[21rem] lg:top-20"
      role="status"
    >
      <DoorIcon size={22} className="shrink-0 text-st-meeting" />
      <div className="flex-1">
        <div className="text-sm font-semibold text-st-meeting">Please close the {nudge.count > 1 ? "doors" : "door"}</div>
        <div className="font-mono text-[10px] text-dim">{nudge.names} open · {nudge.db} dB with sound in the room</div>
      </div>
    </div>
  );
}
