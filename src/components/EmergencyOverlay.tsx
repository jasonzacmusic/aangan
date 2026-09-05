import React from "react";
import HoldButton from "./HoldButton";

/**
 * When the house is in Emergency, nothing else matters.
 * Full-screen violet takeover; standing down needs a deliberate hold.
 */
export default function EmergencyOverlay({ onStandDown, cause }: { onStandDown: () => void; cause?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ink px-8 text-center">
      <div className="emergency-flash absolute inset-0" style={{ background: "radial-gradient(circle at 50% 35%, #7c3aed55, #7c3aed11 60%, transparent)" }} />
      <div className="relative z-10 flex flex-col items-center">
        <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border-2 border-st-emergency" style={{ boxShadow: "0 0 60px #7c3aed88" }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round">
            <path d="M12 3 L22 20 H2 Z" />
            <path d="M12 10v4" />
            <circle cx="12" cy="17" r="0.5" fill="#7c3aed" />
          </svg>
        </div>
        <div className="font-mono text-xs uppercase tracking-[0.4em] text-st-emergency">Emergency active</div>
        <h1 className="font-display mt-2 text-5xl text-paper">All family phones are ringing</h1>
        <p className="mt-3 max-w-sm text-sm text-dim">
          {cause ? `${cause}. ` : ""}Every room sign is flashing violet. Stand down only when everyone is actually safe.
        </p>
        <div className="mt-10 w-full max-w-xs">
          <HoldButton big label="Hold to stand down" color="#e6c36a" durationMs={2000} onComplete={onStandDown} />
        </div>
      </div>
    </div>
  );
}
