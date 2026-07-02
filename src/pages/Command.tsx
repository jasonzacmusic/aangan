import React from "react";
import { useStore } from "../state/store";
import StateDial from "../components/StateDial";
import { STATE_META, StudioState } from "../api/types";

interface Props {
  onSelect: (s: StudioState) => void;
}

export default function Command({ onSelect }: Props) {
  const { stateInfo, settings, runScene, committing } = useStore();
  if (!stateInfo) return null;
  const meta = STATE_META[stateInfo.state];

  return (
    <div className="rise-in mx-auto flex max-w-md flex-col items-center px-5 pt-2 lg:max-w-2xl lg:pt-10">
      <StateDial info={stateInfo} committing={committing} chimes={settings.chimes} onSelect={onSelect} />

      <p className="font-display mt-2 text-center text-[15px] italic text-paper/70 lg:text-lg">{meta.tagline}</p>

      {/* Quick scenes */}
      <div className="mt-8 w-full">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Scenes</div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {settings.scenes.map((sc) => {
            const m = STATE_META[sc.state];
            return (
              <button
                key={sc.id}
                onClick={() => onSelect(sc.state)}
                className="flex items-center gap-3 rounded-2xl border border-line bg-surface/80 px-4 py-3.5 text-left backdrop-blur transition-transform active:scale-[0.98] sm:flex-col sm:items-start sm:gap-2"
              >
                <span className="text-xl">{sc.icon}</span>
                <span>
                  <span className="block text-sm font-medium">{sc.label}</span>
                  <span className="font-mono text-[10px] uppercase tracking-wider" style={{ color: m.color }}>
                    → {m.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
