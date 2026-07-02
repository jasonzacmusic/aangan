import React, { useEffect, useRef, useState } from "react";
import { haptic } from "../state/audio";

/**
 * Press-and-hold to confirm. A gold ring fills while held;
 * releasing early cancels. Used for arming Rec and Emergency.
 */
interface Props {
  label: string;
  color?: string;
  durationMs?: number;
  onComplete: () => void;
  className?: string;
  big?: boolean;
}

export default function HoldButton({ label, color = "#c9a84c", durationMs = 1200, onComplete, className = "", big }: Props) {
  const [progress, setProgress] = useState(0);
  const raf = useRef<number>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<number | null>(null);
  const done = useRef(false);

  const clearDrivers = () => {
    cancelAnimationFrame(raf.current);
    if (timer.current) clearTimeout(timer.current);
  };

  const stop = () => {
    clearDrivers();
    start.current = null;
    if (!done.current) setProgress(0);
  };

  const begin = () => {
    if (done.current) return;
    haptic(10);
    start.current = performance.now();
    // Driven by rAF for smoothness, with a timeout fallback so the hold
    // still completes if rAF is throttled (background/in-app webviews).
    const tick = () => {
      clearDrivers();
      if (start.current === null) return;
      const p = Math.min(1, (performance.now() - start.current) / durationMs);
      setProgress(p);
      if (p >= 1) {
        done.current = true;
        haptic([30, 40, 60]);
        onComplete();
        setTimeout(() => {
          done.current = false;
          setProgress(0);
        }, 600);
        return;
      }
      raf.current = requestAnimationFrame(tick);
      timer.current = setTimeout(tick, 60);
    };
    tick();
  };

  useEffect(() => () => clearDrivers(), []);

  const r = 15;
  const circ = 2 * Math.PI * r;

  return (
    <button
      className={`relative flex items-center justify-center gap-3 rounded-2xl border font-semibold transition-transform active:scale-[0.98] ${
        big ? "h-16 w-full text-base" : "h-13 px-6 py-3.5 text-sm"
      } ${className}`}
      style={{ borderColor: `${color}66`, background: `${color}1a`, color }}
      onPointerDown={begin}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0 -rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke={`${color}33`} strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - progress)}
        />
      </svg>
      <span>{progress > 0 && progress < 1 ? "Keep holding…" : label}</span>
    </button>
  );
}
