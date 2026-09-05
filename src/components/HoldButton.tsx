import React, { useEffect, useRef, useState } from "react";
import { haptic } from "../state/audio";

/** Press-and-hold confirmation with one idempotent completion gate. */
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
  const fallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAt = useRef<number | null>(null);
  const holding = useRef(false);
  const completed = useRef(false);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;

  const clearDrivers = () => {
    cancelAnimationFrame(raf.current);
    if (fallback.current) clearTimeout(fallback.current);
    fallback.current = null;
  };

  const finish = () => {
    if (!holding.current || completed.current) return;
    completed.current = true;
    holding.current = false;
    clearDrivers();
    setProgress(1);
    haptic([30, 40, 60]);
    completeRef.current();
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => {
      completed.current = false;
      startedAt.current = null;
      setProgress(0);
    }, 600);
  };

  const tick = () => {
    if (!holding.current || startedAt.current === null) return;
    const next = Math.min(1, (performance.now() - startedAt.current) / durationMs);
    setProgress(next);
    if (next >= 1) finish();
    else raf.current = requestAnimationFrame(tick);
  };

  const begin = () => {
    if (holding.current || completed.current) return;
    holding.current = true;
    startedAt.current = performance.now();
    setProgress(0.01);
    haptic(10);
    raf.current = requestAnimationFrame(tick);
    // One backup driver only; finish() is idempotent if it races the rAF.
    fallback.current = setTimeout(finish, durationMs + 80);
  };

  const stop = () => {
    if (!holding.current) return;
    holding.current = false;
    startedAt.current = null;
    clearDrivers();
    if (!completed.current) setProgress(0);
  };

  useEffect(
    () => () => {
      clearDrivers();
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    []
  );

  const radius = 15;
  const circumference = 2 * Math.PI * radius;

  return (
    <button
      className={`relative flex items-center justify-center gap-3 rounded-2xl border font-semibold transition-transform active:scale-[0.98] ${
        big ? "h-16 w-full text-base" : "h-13 px-6 py-3.5 text-sm"
      } ${className}`}
      style={{ borderColor: `${color}66`, background: `${color}1a`, color }}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        begin();
      }}
      onPointerUp={stop}
      onPointerLeave={(event) => {
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) return;
        stop();
      }}
      onPointerCancel={stop}
      onKeyDown={(event) => {
        if ((event.key === " " || event.key === "Enter") && !event.repeat) {
          event.preventDefault();
          begin();
        }
      }}
      onKeyUp={(event) => {
        if (event.key === " " || event.key === "Enter") stop();
      }}
      onBlur={stop}
      onContextMenu={(event) => event.preventDefault()}
      aria-label={`${label}. Press and hold to confirm.`}
    >
      <svg width="36" height="36" viewBox="0 0 36 36" className="shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="18" cy="18" r={radius} fill="none" stroke={`${color}33`} strokeWidth="3" />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
        />
      </svg>
      <span>{progress > 0 && progress < 1 ? "Keep holding…" : label}</span>
    </button>
  );
}
