import React from "react";
import { STATE_META, StudioState } from "../api/types";
import HoldButton from "./HoldButton";

/** Bottom sheet asking to arm a high-stakes state (Rec / Emergency). */
interface Props {
  state: StudioState;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmSheet({ state, onConfirm, onCancel }: Props) {
  const m = STATE_META[state];
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-center" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onCancel} />
      <div className="rise-in relative z-10 w-full max-w-md rounded-t-3xl border border-line bg-surface p-6 pb-10 safe-bottom lg:rounded-3xl lg:pb-6">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line lg:hidden" />
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Arm studio state</div>
        <div className="font-display text-3xl" style={{ color: m.color }}>
          {m.label}
        </div>
        <p className="mt-2 text-sm text-dim">
          {m.tagline} Every room sign turns{" "}
          <span style={{ color: m.color }}>{state === "emergency" ? "flashing violet" : "this color"}</span> and the family
          is notified.
        </p>
        <div className="mt-6 space-y-3">
          <HoldButton big label={`Hold to arm ${m.label}`} color={m.color} durationMs={state === "emergency" ? 1600 : 1100} onComplete={onConfirm} />
          <button className="h-12 w-full rounded-2xl border border-line text-sm text-dim active:scale-[0.98]" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
