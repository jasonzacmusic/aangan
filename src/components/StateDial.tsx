import React, { useCallback, useEffect, useRef, useState } from "react";
import { STATE_META, STATE_ORDER, StudioState, StudioStateInfo } from "../api/types";
import { playTick, haptic } from "../state/audio";
import { timeSince } from "../state/store";

/**
 * The soul of the app: a rotary state dial.
 * Six arc segments around a glass hub. Drag around the ring (or tap a
 * segment) — detents tick like a real rotary switch. Releasing on a new
 * state commits it (recording & emergency ask for a hold-confirm first).
 */

const SIZE = 360;
const C = SIZE / 2;
const R_OUT = 158;
const R_IN = 112;
const SEG_SWEEP = 52; // degrees of arc per segment (gap = 8)

function polar(r: number, deg: number): [number, number] {
  const rad = (deg * Math.PI) / 180;
  return [C + r * Math.cos(rad), C + r * Math.sin(rad)];
}

function arcPath(r0: number, r1: number, a0: number, a1: number): string {
  const [x0, y0] = polar(r1, a0);
  const [x1, y1] = polar(r1, a1);
  const [x2, y2] = polar(r0, a1);
  const [x3, y3] = polar(r0, a0);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0} ${y0} A${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`;
}

const centerAngle = (i: number) => i * 60 - 90; // Available at 12 o'clock

interface Props {
  info: StudioStateInfo;
  committing: boolean;
  chimes: boolean;
  onSelect: (s: StudioState) => void;
}

export default function StateDial({ info, committing, chimes, onSelect }: Props) {
  const currentIdx = STATE_ORDER.indexOf(info.state);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false); // state alone is stale for fast tap (down+up same frame)
  const svgRef = useRef<SVGSVGElement>(null);
  const segmentRefs = useRef<Array<SVGGElement | null>>([]);
  const lastHover = useRef<number | null>(null);
  const [, forceTick] = useState(0);

  // Keep "since 12 min" fresh.
  useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  const indexFromEvent = useCallback((e: React.PointerEvent): number | null => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = SIZE / rect.width;
    const x = (e.clientX - rect.left) * scale - C;
    const y = (e.clientY - rect.top) * scale - C;
    const dist = Math.hypot(x, y);
    if (dist < R_IN - 18 || dist > R_OUT + 30) return null;
    const deg = (Math.atan2(y, x) * 180) / Math.PI; // -180..180, 0 = 3 o'clock
    const idx = Math.round((deg + 90) / 60);
    return ((idx % 6) + 6) % 6;
  }, []);

  const handleDown = (e: React.PointerEvent) => {
    if (committing) return;
    const idx = indexFromEvent(e);
    if (idx === null) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    setDragging(true);
    setHoverIdx(idx);
    lastHover.current = idx;
    if (idx !== currentIdx) {
      playTick(chimes);
      haptic(6);
    }
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || committing) return;
    const idx = indexFromEvent(e);
    if (idx === null || idx === lastHover.current) return;
    lastHover.current = idx;
    setHoverIdx(idx);
    playTick(chimes); // rotary detent
    haptic(6);
  };

  const handleUp = () => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);
    const idx = lastHover.current;
    setHoverIdx(null);
    lastHover.current = null;
    if (idx !== null && idx !== currentIdx && !committing) {
      onSelect(STATE_ORDER[idx]);
    }
  };

  const handleKey = (event: React.KeyboardEvent<SVGGElement>, index: number) => {
    if (committing) return;
    let target = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") target = (index + 1) % STATE_ORDER.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") target = (index - 1 + STATE_ORDER.length) % STATE_ORDER.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = STATE_ORDER.length - 1;
    else if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (target !== currentIdx) {
      playTick(chimes);
      haptic(6);
      setHoverIdx(target);
      requestAnimationFrame(() => segmentRefs.current[target]?.focus());
      onSelect(STATE_ORDER[target]);
    }
  };

  const needleIdx = hoverIdx ?? currentIdx;
  const needleAngle = centerAngle(needleIdx);
  const meta = STATE_META[info.state];
  const previewMeta = STATE_META[STATE_ORDER[needleIdx]];

  return (
    <div className="relative mx-auto w-full max-w-[380px] select-none touch-none lg:max-w-[460px]">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="w-full"
        onPointerDown={handleDown}
        onPointerMove={handleMove}
        onPointerUp={handleUp}
        onPointerCancel={handleUp}
        style={{ touchAction: "none" }}
        role="radiogroup"
        aria-label="Studio state selector. Use arrow keys or choose a state."
        aria-busy={committing}
      >
        <defs>
          <radialGradient id="hub" cx="50%" cy="42%" r="65%">
            <stop offset="0%" stopColor="#1c1c24" />
            <stop offset="100%" stopColor="#0a0a0e" />
          </radialGradient>
        </defs>

        {/* Outer engraved ring */}
        <circle cx={C} cy={C} r={R_OUT + 14} fill="none" stroke="#2a2a33" strokeWidth="1" />
        {Array.from({ length: 60 }).map((_, i) => {
          const a = i * 6 - 90;
          const [x0, y0] = polar(R_OUT + 8, a);
          const [x1, y1] = polar(R_OUT + (i % 5 === 0 ? 13 : 10), a);
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#3a3a45" strokeWidth="1" />;
        })}

        {/* Segments */}
        {STATE_ORDER.map((s, i) => {
          const m = STATE_META[s];
          const a = centerAngle(i);
          const active = i === currentIdx;
          const hovered = i === hoverIdx && i !== currentIdx;
          const [lx, ly] = polar((R_OUT + R_IN) / 2, a);
          return (
            <g
              key={s}
              ref={(node) => { segmentRefs.current[i] = node; }}
              className="cursor-pointer outline-none"
              role="radio"
              aria-checked={active}
              aria-label={`${m.label}. ${m.tagline}`}
              aria-disabled={committing}
              tabIndex={0}
              onFocus={() => setHoverIdx(i)}
              onBlur={() => setHoverIdx(null)}
              onKeyDown={(event) => handleKey(event, i)}
            >
              <path
                d={arcPath(R_IN, R_OUT, a - SEG_SWEEP / 2, a + SEG_SWEEP / 2)}
                fill={m.color}
                fillOpacity={active ? 0.92 : hovered ? 0.42 : 0.13}
                stroke={hovered ? "#e6c36a" : active ? m.color : "transparent"}
                strokeWidth={hovered ? 2 : 1}
                style={{
                  transition: "fill-opacity 0.25s ease, stroke 0.2s ease",
                  filter: active ? `drop-shadow(0 0 14px ${m.color}88)` : undefined,
                }}
              />
              <text
                x={lx}
                y={ly + 4}
                textAnchor="middle"
                fontFamily="IBM Plex Mono, monospace"
                fontSize="12"
                letterSpacing="0.14em"
                fill={active ? "#0a0a0e" : hovered ? "#e6c36a" : "#8b8b96"}
                fontWeight={active ? 600 : 400}
                style={{ pointerEvents: "none", transition: "fill 0.25s ease" }}
              >
                {m.short}
              </text>
            </g>
          );
        })}

        {/* Needle — snaps between detents */}
        <g
          style={{
            transform: `rotate(${needleAngle}deg)`,
            transformOrigin: `${C}px ${C}px`,
            transition: dragging ? "transform 0.18s cubic-bezier(0.16,1,0.3,1)" : "transform 0.4s cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          <path
            d={`M ${C + R_OUT + 24} ${C - 7} L ${C + R_OUT + 8} ${C} L ${C + R_OUT + 24} ${C + 7} Z`}
            fill="#c9a84c"
            style={{ filter: "drop-shadow(0 0 6px #c9a84c99)" }}
          />
        </g>

        {/* Commit ripple */}
        {committing && (
          <circle key={info.since} cx={C} cy={C} r={R_OUT} fill="none" stroke={meta.color} strokeWidth="3" className="commit-ripple" style={{ transformOrigin: `${C}px ${C}px` }} />
        )}

        {/* Hub */}
        <circle cx={C} cy={C} r={R_IN - 24} fill="url(#hub)" stroke="#2a2a33" strokeWidth="1.5" />
      </svg>

      {/* Center readout (HTML for real typography) */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-mono text-[10px] tracking-[0.3em] text-dim uppercase">Studio is</div>
        <div
          className="font-display text-[34px] leading-tight lg:text-[42px]"
          style={{ color: meta.color, fontVariationSettings: '"opsz" 60', fontWeight: 550, textShadow: `0 0 24px ${meta.color}55` }}
        >
          {meta.label}
        </div>
        <div className="mt-1 font-mono text-[10px] text-dim">
          for {timeSince(info.since)} · by {info.setBy}
        </div>
      </div>

      <div
        className="mx-auto -mt-1 min-h-9 max-w-[350px] rounded-full border px-4 py-2 text-center font-mono text-[9px] uppercase tracking-[0.12em] text-dim transition-colors"
        style={{ borderColor: `${previewMeta.color}44`, color: `${previewMeta.color}cc`, background: `${previewMeta.color}0d` }}
        aria-live="polite"
      >
        {previewMeta.houseAction}
      </div>
    </div>
  );
}
