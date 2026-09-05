import React, { useEffect, useRef, useState } from "react";

/**
 * Breathing LED meter for the music-room mic.
 * Smoothly chases the live dB value; segments past the recording
 * threshold burn red. The tip segment breathes.
 */
const MIN_DB = 30;
const MAX_DB = 90;
const SEGMENTS = 26;

interface Props {
  value: number | null;
  threshold: number;
  compact?: boolean;
}

export default function DbMeter({ value, threshold, compact }: Props) {
  const [display, setDisplay] = useState(value ?? threshold);
  const target = useRef(value ?? threshold);
  if (value != null) target.current = value;

  // Chase the live value, then STOP. An asymptotic chase that never lands
  // would re-render at 60 fps forever — real heat on a 24/7 wall panel.
  useEffect(() => {
    if (value == null) return;
    let raf = 0;
    const loop = () => {
      let settled = false;
      setDisplay((d) => {
        const goal = target.current;
        const next = d + (goal - d) * 0.12;
        if (Math.abs(goal - next) < 0.05) {
          settled = true;
          return goal;
        }
        return next;
      });
      raf = settled ? 0 : requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  if (value == null) {
    return (
      <div className="w-full">
        <div className="flex items-end gap-[3px]" style={{ height: compact ? 26 : 44 }}>
          {Array.from({ length: SEGMENTS }).map((_, i) => (
            <div key={i} className="flex-1 rounded-[2px]" style={{ height: `${(0.45 + (i / SEGMENTS) * 0.55) * 100}%`, background: "#22222b", opacity: 0.7 }} />
          ))}
        </div>
        <div className="mt-1.5 font-mono text-[10px] text-st-meeting">Mic not reporting · not silence</div>
      </div>
    );
  }

  const frac = Math.max(0, Math.min(1, (display - MIN_DB) / (MAX_DB - MIN_DB)));
  const lit = Math.round(frac * SEGMENTS);
  const threshSeg = Math.round(((threshold - MIN_DB) / (MAX_DB - MIN_DB)) * SEGMENTS);
  const over = display >= threshold;

  return (
    <div className="w-full">
      <div className="flex items-end gap-[3px]" style={{ height: compact ? 26 : 44 }}>
        {Array.from({ length: SEGMENTS }).map((_, i) => {
          const on = i < lit;
          const isTip = i === lit - 1;
          const past = i >= threshSeg;
          const color = past ? "#e5484d" : i > threshSeg - 5 ? "#f5a623" : "#2fbf71";
          const hFrac = 0.45 + (i / SEGMENTS) * 0.55;
          return (
            <div
              key={i}
              className="flex-1 rounded-[2px]"
              style={{
                height: `${hFrac * 100}%`,
                background: on ? color : "#22222b",
                opacity: on ? 1 : 0.7,
                boxShadow: on && past ? `0 0 8px ${color}aa` : undefined,
                transformOrigin: "bottom",
                animation: isTip && on ? "breathe 1.2s ease-in-out infinite" : undefined,
                transition: "background 0.15s ease",
              }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex items-baseline justify-between font-mono text-[10px] text-dim">
        <span>
          <span className={over ? "text-st-audio font-medium" : "text-paper"} style={{ fontSize: compact ? 12 : 15 }}>
            {display.toFixed(0)}
          </span>{" "}
          dBA
        </span>
        <span className={over ? "text-st-audio" : ""}>{over ? "over threshold" : `quiet under ${threshold} dBA`}</span>
      </div>
    </div>
  );
}

/** Tiny 60-sample history line for the room detail sheet. */
export function Sparkline({ data, threshold }: { data: number[]; threshold: number }) {
  if (data.length < 2) return null;
  const w = 280;
  const h = 56;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - ((Math.min(Math.max(v, MIN_DB), MAX_DB) - MIN_DB) / (MAX_DB - MIN_DB)) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const ty = h - ((threshold - MIN_DB) / (MAX_DB - MIN_DB)) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }}>
      <line x1="0" y1={ty} x2={w} y2={ty} stroke="#e5484d" strokeWidth="1" strokeDasharray="4 4" opacity="0.6" />
      <polyline points={pts} fill="none" stroke="#c9a84c" strokeWidth="1.5" />
    </svg>
  );
}
