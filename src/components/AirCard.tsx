import React, { useEffect, useState } from "react";
import { AirRoomReading, PURIFIER_MODE_META, PurifierMode } from "../api/types";
import { useStore } from "../state/store";

const MODES: PurifierMode[] = ["off", "silent", "auto", "max"];

function co2Tone(co2: number, threshold: number) {
  if (co2 >= threshold + 400) return { color: "text-st-audio", word: "stuffy" };
  if (co2 >= threshold) return { color: "text-st-meeting", word: "close" };
  return { color: "text-st-available", word: "fresh" };
}

function dustWord(pm25: number) {
  if (pm25 >= 55) return { color: "text-st-audio", word: "dusty" };
  if (pm25 >= 30) return { color: "text-st-meeting", word: "hazy" };
  return { color: "text-st-available", word: "clean" };
}

function RoomRow({ room }: { room: AirRoomReading }) {
  const { settings } = useStore();
  const co2 = co2Tone(room.co2, settings.co2Threshold);
  const dust = dustWord(room.pm25);
  const rhOut = room.humidityPct > settings.rhMax || room.humidityPct < settings.rhMin;
  const smelly = room.vocIndex >= 160;

  return (
    <div className="rounded-xl border border-line bg-surface2 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-sm font-semibold text-paper">{room.name}</span>
        {!room.online && <span className="font-mono text-[9px] uppercase tracking-wider text-st-audio">node offline</span>}
      </div>
      <div className="mt-1.5 grid grid-cols-4 gap-1.5 text-center">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-widest text-dim">CO₂</div>
          <div className={`text-sm font-semibold ${co2.color}`}>{room.co2}</div>
          <div className="font-mono text-[8px] text-dim">{co2.word}</div>
        </div>
        <div>
          <div className="font-mono text-[8px] uppercase tracking-widest text-dim">PM2.5</div>
          <div className={`text-sm font-semibold ${dust.color}`}>{room.pm25.toFixed(0)}</div>
          <div className="font-mono text-[8px] text-dim">{dust.word}</div>
        </div>
        <div>
          <div className="font-mono text-[8px] uppercase tracking-widest text-dim">Odour</div>
          <div className={`text-sm font-semibold ${smelly ? "text-st-meeting" : "text-paper"}`}>{room.vocIndex}</div>
          <div className="font-mono text-[8px] text-dim">{smelly ? "stale" : "ok"}</div>
        </div>
        <div>
          <div className="font-mono text-[8px] uppercase tracking-widest text-dim">RH</div>
          <div className={`text-sm font-semibold ${rhOut ? "text-st-meeting" : "text-paper"}`}>{room.humidityPct.toFixed(0)}%</div>
          <div className="font-mono text-[8px] text-dim">{rhOut ? "watch" : "safe"}</div>
        </div>
      </div>
    </div>
  );
}

/** Air, ventilation and the purifiers — readings, purge, and per-purifier control. */
export default function AirCard() {
  const { air, stateInfo, setPurifierMode, startAirPurge, stopAirPurge } = useStore();
  const [, tickNow] = useState(0);

  // The purge countdown needs its own second hand.
  useEffect(() => {
    if (!air?.purgeUntil) return;
    const t = setInterval(() => tickNow((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [air?.purgeUntil]);

  if (!air) return null;
  const purging = !!air.purgeUntil && air.purgeUntil > Date.now();
  const minsLeft = purging ? Math.max(1, Math.ceil((air.purgeUntil! - Date.now()) / 60000)) : 0;
  const recording = stateInfo?.state === "audio_rec" || stateInfo?.state === "video_rec";

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-lg">Air</h3>
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">
          {air.hushed ? "hushed for the take" : purging ? `purging · ${minsLeft} min left` : "watching every room"}
        </span>
      </div>

      <div className="rounded-2xl border border-line bg-surface/80 p-3 backdrop-blur">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {air.rooms.map((r) => (
            <RoomRow key={r.id} room={r} />
          ))}
        </div>

        {/* Purge / hush banner */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {air.hushed ? (
            <div className="flex-1 rounded-xl border border-st-audio/40 bg-st-audio/10 px-3 py-2.5">
              <div className="text-xs font-semibold text-st-audio">Purifiers hushed — a take is rolling</div>
              <div className="font-mono text-[9px] text-dim">they go back to their exact previous modes when the studio is Available</div>
            </div>
          ) : purging ? (
            <>
              <div className="flex-1 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2.5">
                <div className="text-xs font-semibold text-gold">Purging the rooms · {minsLeft} min left</div>
                <div className="font-mono text-[9px] text-dim">every purifier on max, then straight back to auto</div>
              </div>
              <button
                onClick={() => void stopAirPurge()}
                className="rounded-xl border border-line px-3 py-2.5 font-mono text-[10px] uppercase tracking-wider text-dim transition-all active:scale-95"
              >
                Stop
              </button>
            </>
          ) : (
            <>
              <span className="font-mono text-[9px] uppercase tracking-widest text-dim">Purge before a class or take</span>
              {[10, 20].map((m) => (
                <button
                  key={m}
                  onClick={() => void startAirPurge(m)}
                  disabled={recording}
                  className="rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-gold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {m} min
                </button>
              ))}
              {recording && <span className="font-mono text-[9px] text-dim">not while tape is rolling</span>}
            </>
          )}
        </div>

        {/* Per-purifier control */}
        <div className="mt-3 space-y-2">
          {air.purifiers.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-sm font-semibold text-paper">{p.name}</span>
                  <span className="font-mono text-[8px] uppercase tracking-wider text-dim">{p.brand}</span>
                </div>
                <div className="font-mono text-[9px] text-dim">
                  {p.online ? `${PURIFIER_MODE_META[p.mode].hint} · filter ${p.filterPct}%` : "offline"}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {MODES.map((m) => (
                  <button
                    key={m}
                    onClick={() => void setPurifierMode(p.id, m)}
                    aria-label={`${p.name} ${PURIFIER_MODE_META[m].label}`}
                    className={`rounded-lg border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-wider transition-colors ${
                      p.mode === m ? "border-gold/60 bg-gold/15 text-gold" : "border-line text-dim"
                    }`}
                  >
                    {PURIFIER_MODE_META[m].label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-2 font-mono text-[9px] leading-relaxed text-dim/80">
          CO₂ is measured, never guessed — a purifier cannot fix it, only fresh air can
        </p>
      </div>
    </section>
  );
}
