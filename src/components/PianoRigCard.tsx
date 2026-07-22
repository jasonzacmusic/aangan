import React from "react";
import { useStore, timeSince } from "../state/store";

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
                aria-label="Previous piano preset"
                className="h-10 w-10 rounded-xl border border-line text-dim transition-all active:scale-95"
              >
                ‹
              </button>
              <button
                onClick={() => void sendPianoCue("next_preset")}
                aria-label="Next piano preset"
                className="h-10 w-10 rounded-xl border border-gold/40 bg-gold/10 text-gold transition-all active:scale-95"
              >
                ›
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

        <p className="mt-3 font-mono text-[9px] leading-relaxed text-dim/80">
          {p.sampleRate / 1000} kHz · balanced XLR to the console · cues are one-way and can never glitch the audio
        </p>
      </div>
    </section>
  );
}
