import React from "react";
import { FleetDevice } from "../api/types";
import { timeSince, useStore } from "../state/store";
import { ChipIcon, IconProps, MonitorIcon, PlugIcon, SignIcon, WifiIcon } from "./icons";

const KIND_ICON: Record<FleetDevice["kind"], (p: IconProps) => React.JSX.Element> = {
  mac: MonitorIcon,
  pi: ChipIcon,
  panel: SignIcon,
  network: WifiIcon,
  other: PlugIcon,
};

/** One glance answers: is everything in the school alive? */
export default function FleetCard() {
  const { fleet } = useStore();
  if (!fleet.length) return null;
  const down = fleet.filter((d) => !d.online);
  const allUp = down.length === 0;

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-lg">Fleet</h3>
        <span className={`font-mono text-[9px] uppercase tracking-[0.2em] ${allUp ? "text-st-available" : "text-st-audio"}`}>
          {allUp ? `all ${fleet.length} machines alive` : `${down.length} down`}
        </span>
      </div>
      <div className={`rounded-2xl border p-2 backdrop-blur ${allUp ? "border-line bg-surface/80" : "border-st-audio/40 bg-st-audio/5"}`}>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {fleet.map((d) => {
            const KindIcon = KIND_ICON[d.kind];
            return (
            <div key={d.id} className={`flex items-center gap-3 rounded-xl px-3 py-2 ${d.online ? "" : "bg-st-audio/10"}`}>
              <KindIcon size={18} className={d.online ? "shrink-0 text-dim" : "shrink-0 text-st-audio"} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold text-paper">{d.name}</span>
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${d.online ? "bg-st-available" : "bg-st-audio pulse-dot"}`}
                    style={{ boxShadow: d.online ? "0 0 6px #2fbf7188" : "0 0 8px #e5484d" }}
                  />
                </div>
                <div className="truncate font-mono text-[9px] text-dim">
                  {d.online ? d.detail : `offline · last seen ${timeSince(d.lastSeen)} ago`}
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
