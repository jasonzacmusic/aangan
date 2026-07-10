import React from "react";
import { useStore } from "../state/store";
import DbMeter from "../components/DbMeter";
import { ROOM_NAMES, StudioState } from "../api/types";

interface Props {
  onSelect: (s: StudioState) => void;
}

function CheckRow({ ok, title, detail }: { ok: boolean; title: string; detail: string }) {
  return (
    <div className={`flex items-start gap-3 rounded-2xl border p-4 transition-colors ${ok ? "border-st-available/30 bg-st-available/5" : "border-st-audio/40 bg-st-audio/10"}`}>
      <div
        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${ok ? "bg-st-available/20 text-st-available" : "bg-st-audio/25 text-st-audio"}`}
      >
        {ok ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        )}
      </div>
      <div>
        <div className={`text-sm font-semibold ${ok ? "text-paper" : "text-st-audio"}`}>{title}</div>
        <div className="mt-0.5 text-xs text-dim">{detail}</div>
      </div>
    </div>
  );
}

export default function Preflight({ onSelect }: Props) {
  const { preflight, preflightPrep, rooms, settings, prepareStudio, restoreStudio } = useStore();
  if (!preflight) return null;

  const music = rooms.find((r) => r.id === "music");
  const db = music?.dbLevel ?? preflight.dbLevel;
  const quiet = db < settings.dbThreshold;
  const doorsClosed = preflight.doorsClosed;
  const ready = doorsClosed && quiet;

  const openList = preflight.openDoors.map((id) => ROOM_NAMES[id]).join(", ");

  return (
    <div className="rise-in mx-auto max-w-md px-5 lg:max-w-2xl">
      <h2 className="font-display mb-1 text-2xl lg:text-3xl">Pre-flight</h2>
      <p className="mb-5 font-mono text-[11px] text-dim">go / no-go before tape rolls</p>

      {/* The verdict */}
      <div
        className={`relative overflow-hidden rounded-3xl border p-8 text-center transition-colors duration-500 ${
          ready ? "border-st-available/50" : "border-st-audio/50"
        }`}
        style={{ background: ready ? "radial-gradient(circle at 50% 0%, #2fbf7126, transparent 70%)" : "radial-gradient(circle at 50% 0%, #e5484d26, transparent 70%)" }}
        aria-live="polite"
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-dim">Studio status</div>
        <div className={`font-display mt-2 text-5xl lg:text-6xl ${ready ? "text-st-available" : "text-st-audio"}`} style={{ textShadow: ready ? "0 0 30px #2fbf7155" : "0 0 30px #e5484d55" }}>
          {ready ? "READY" : "NOT READY"}
        </div>
        <div className="mt-2 text-sm text-dim">
          {ready ? "The room is sealed and silent. Roll when you are." : "Fix the items below before recording."}
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <CheckRow
          ok={doorsClosed}
          title={doorsClosed ? "All doors closed" : `Door open: ${openList}`}
          detail={doorsClosed ? "Every reed switch reads shut." : `Close the ${openList} door${preflight.openDoors.length > 1 ? "s" : ""} to seal the room.`}
        />
        <CheckRow
          ok={quiet}
          title={quiet ? "Room is quiet" : `Too loud — ${db.toFixed(0)} dB`}
          detail={quiet ? `Holding under your ${settings.dbThreshold} dB threshold.` : `Needs to drop under ${settings.dbThreshold} dB. Check the fan, AC, or traffic noise.`}
        />
      </div>

      {/* Live meter */}
      <div className="mt-4 rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Music room · live</div>
        <DbMeter value={db} threshold={settings.dbThreshold} />
      </div>

      {/* The pre-flight can act, not only diagnose. */}
      <div className={`mt-4 rounded-2xl border p-4 transition-colors ${preflightPrep?.active ? "border-st-available/35 bg-st-available/5" : "border-gold/25 bg-gold/5"}`}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold">One-touch quiet</div>
            <div className="mt-1 text-sm font-semibold">
              {preflightPrep?.status === "preparing" ? "Silencing the room…" : preflightPrep?.status === "restoring" ? "Restoring studio devices…" : preflightPrep?.active ? "Room silence is armed" : "Let the house fix the noise"}
            </div>
            <p className="mt-1 text-xs text-dim">
              {preflightPrep?.active ? "Doorbell is muted; AC and fan stay off until you return to Available." : "Mutes the doorbell, cuts the AC and fan, then waits for the live meter to prove the drop."}
            </p>
          </div>
          <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${preflightPrep?.active ? "bg-st-available" : preflightPrep?.status === "preparing" ? "pulse-dot bg-gold" : "bg-dim"}`} />
        </div>

        {(preflightPrep?.status === "preparing" || preflightPrep?.active) && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              ["Doorbell", preflightPrep.mutedDoorbell],
              ["AC", preflightPrep.acOff],
              ["Fan", preflightPrep.fanOff],
            ].map(([label, done]) => (
              <div key={String(label)} className={`rounded-lg border px-2 py-2 text-center font-mono text-[8px] uppercase tracking-wider ${done ? "border-st-available/30 bg-st-available/10 text-st-available" : "border-line text-dim"}`}>
                {done ? "✓ " : "… "}{label}
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => preflightPrep?.active ? restoreStudio() : prepareStudio()}
          disabled={preflightPrep?.status === "preparing" || preflightPrep?.status === "restoring"}
          className="mt-4 w-full rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold transition-all active:scale-[0.99] disabled:cursor-wait disabled:opacity-60"
        >
          {preflightPrep?.status === "preparing" ? "Listening for silence…" : preflightPrep?.status === "restoring" ? "Restoring…" : preflightPrep?.active ? "Restore doorbell, AC & fan" : "Silence the room"}
        </button>
        {!doorsClosed && <p className="mt-2 text-center font-mono text-[9px] text-st-meeting">The house cannot close a physical door — {openList} still needs you.</p>}
      </div>

      {/* Gated start */}
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button
          disabled={!ready}
          onClick={() => onSelect("audio_rec")}
          className={`h-16 rounded-2xl border font-semibold transition-all ${
            ready ? "border-st-audio/60 bg-st-audio/15 text-st-audio active:scale-[0.98]" : "cursor-not-allowed border-line bg-surface/50 text-dim/50"
          }`}
        >
          ● Start Audio Rec
        </button>
        <button
          disabled={!ready}
          onClick={() => onSelect("video_rec")}
          className={`h-16 rounded-2xl border font-semibold transition-all ${
            ready ? "border-st-video/60 bg-st-video/15 text-st-video active:scale-[0.98]" : "cursor-not-allowed border-line bg-surface/50 text-dim/50"
          }`}
        >
          ▶ Start Video Rec
        </button>
      </div>
      {!ready && <p className="mt-2 text-center font-mono text-[10px] text-dim">recording unlocks when everything is green</p>}
    </div>
  );
}
