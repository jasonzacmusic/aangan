import React from "react";
import { useStore, timeSince } from "../state/store";
import { ChevronLeftIcon, ChevronRightIcon, PlayIcon } from "./icons";

/** The PIANO Pi (Pianoteq stage rig) as a living card on the Home page. */
export default function PianoRigCard() {
  const { pianoRig, sendPianoCue } = useStore();
  if (!pianoRig) return null;
  const p = pianoRig;

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-lg">Piano Rig</h3>
        <span className={`font-mono text-[9px] uppercase tracking-[0.2em] ${p.online ? "text-st-available" : "text-st-audio"}`}>
          {p.online ? `online · seen ${timeSince(p.lastSeen)}` : "offline"}
        </span>
      </div>

      <div className={`rounded-2xl border p-4 ${p.online ? "border-line bg-surface/80" : "border-st-audio/40 bg-st-audio/5"} backdrop-blur`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Pianoteq · current preset</div>
            <div className="mt-1 truncate font-display text-xl">{p.preset}</div>
            <div className="mt-1 font-mono text-[10px] text-dim">{p.audioDevice}</div>
          </div>
          {p.online && (
            <div className="flex shrink-0 gap-2">
              <button
                onClick={() => void sendPianoCue("prev_preset")}
                disabled={!!p.tally}
                aria-label="Previous piano preset"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-line text-dim transition-all hover:border-gold/30 hover:text-paper active:scale-95 disabled:opacity-40"
              >
                <ChevronLeftIcon size={18} />
              </button>
              <button
                onClick={() => void sendPianoCue("next_preset")}
                disabled={!!p.tally}
                aria-label="Next piano preset"
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-gold/40 bg-gold/10 text-gold transition-all hover:bg-gold/20 active:scale-95 disabled:opacity-40"
              >
                <ChevronRightIcon size={18} />
              </button>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {[
            { k: "CPU", v: `${p.cpuPct}%`, warn: p.cpuPct > 70 },
            { k: "Temp", v: `${p.tempC.toFixed(0)}°C`, warn: p.tempC > 60 },
            { k: "Buffer", v: `${p.bufferFrames}`, warn: false },
            { k: "Latency", v: `~${p.latencyMs} ms`, warn: false },
          ].map((c) => (
            <div key={c.k} className="rounded-xl border border-line bg-surface2 px-1 py-2.5">
              <div className="font-mono text-[8px] uppercase tracking-widest text-dim">{c.k}</div>
              <div className={`mt-0.5 text-sm font-semibold ${c.warn ? "text-st-meeting" : ""}`}>{c.v}</div>
            </div>
          ))}
        </div>

        {p.blackbox && (
          <div className="mt-3 flex items-center gap-3 rounded-xl border border-line bg-surface2 px-3 py-2.5">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${p.blackbox.recording ? "bg-st-audio pulse-dot" : "bg-dim/40"}`}
              style={p.blackbox.recording ? { boxShadow: "0 0 10px #e5484d" } : undefined}
            />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-gold">MIDI black-box</div>
              <div className="mt-0.5 truncate text-xs text-paper">
                {p.blackbox.recording
                  ? "capturing now — every note is being saved"
                  : p.blackbox.lastTakeAt
                    ? `${p.blackbox.takesToday} take${p.blackbox.takesToday === 1 ? "" : "s"} today · last ${timeSince(p.blackbox.lastTakeAt)} ago · ${p.blackbox.lastTakeMinutes} min, ${p.blackbox.lastTakeNotes.toLocaleString()} notes`
                    : "listening · nothing captured yet"}
              </div>
            </div>
            {p.online && p.blackbox.lastTakeAt && !p.blackbox.recording && !p.tally && (
              <button
                onClick={() => void sendPianoCue("replay_last")}
                className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-gold transition-all hover:bg-gold/20 active:scale-95"
              >
                <PlayIcon size={11} />
                Replay
              </button>
            )}
          </div>
        )}

        <p className="mt-3 font-mono text-[9px] leading-relaxed text-dim/80">
          {p.sampleRate / 1000} kHz · balanced XLR to the console
          {p.tally ? " · tally on — preset and replay locked until Rec is off" : " · preset changes cut the instrument, so they lock during a take"}
        </p>
      </div>
    </section>
  );
}
