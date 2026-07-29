import React from "react";
import { STATE_META, StudioState } from "../api/types";
import { useStore, timeSince } from "../state/store";

/**
 * The visitor page at /#/guest — reached by scanning the QR on the door
 * display. Read-only, nothing to install: tells the guest what's happening
 * inside and how to behave, live.
 */
const GUEST_WORDING: Record<StudioState, { head: string; body: string; wait: boolean }> = {
  available: { head: "Come on in", body: "The house is open — ring once and someone will welcome you.", wait: false },
  class: { head: "A lesson is in progress", body: "Please enter softly, or wait here — a student is playing right now.", wait: true },
  meeting: { head: "On a call", body: "Knock gently and wait — someone will be with you shortly.", wait: true },
  audio_rec: { head: "Recording in progress", body: "Absolute silence please — do not ring the bell. We know you're here; someone will come out between takes.", wait: true },
  video_rec: { head: "Filming in progress", body: "Cameras are rolling — please wait outside the frame. Someone will come out between takes.", wait: true },
  emergency: { head: "Please call the family", body: "Something needs attention inside — please phone before entering.", wait: true },
};

export default function GuestPage() {
  const { stateInfo, delivery } = useStore();
  if (!stateInfo) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="font-mono text-xs uppercase tracking-[0.4em] text-gold">Nathaniel School of Music</div>
      </div>
    );
  }
  const meta = STATE_META[stateInfo.state];
  const w = GUEST_WORDING[stateInfo.state];

  return (
    <div className="rise-in mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 py-10 text-center">
      <img src="/nsm-white.png" alt="Nathaniel School of Music" className="h-8 w-auto opacity-90" />
      <div className="mt-6 flex items-center gap-3">
        <span className="pulse-dot h-3 w-3 rounded-full" style={{ background: meta.color, boxShadow: `0 0 16px ${meta.color}` }} />
        <span className="font-mono text-[10px] uppercase tracking-[0.35em] text-dim">live · {meta.label}</span>
      </div>
      <h1 className="font-display mt-4 text-4xl leading-tight" style={{ color: meta.color }}>{w.head}</h1>
      <p className="mt-4 max-w-sm text-base text-paper/90">{w.body}</p>
      {w.wait && (
        <p className="mt-3 font-mono text-[10px] text-dim">
          in this state for {timeSince(stateInfo.since)} — this page updates by itself, no need to refresh
        </p>
      )}
      {delivery?.active && (
        <div className="mt-6 w-full rounded-2xl border border-gold/40 bg-gold/5 p-4">
          <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-gold">Delivery partner?</div>
          <p className="mt-1 text-sm text-paper">Your OTP is on the door screen — no need to ring.</p>
        </div>
      )}
      <p className="mt-10 font-mono text-[9px] leading-relaxed text-dim/70">
        Nathaniel School of Music · Bangalore<br />nothing to install — this page is just for your visit
      </p>
    </div>
  );
}
