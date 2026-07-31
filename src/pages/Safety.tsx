import React, { useEffect, useRef, useState } from "react";
import { useStore } from "../state/store";
import HoldButton from "../components/HoldButton";
import { SafetyAlertKind, STATE_META } from "../api/types";
import { RefreshIcon } from "../components/icons";

function SafetyTile({ label, alert, okText, alertText }: { label: string; alert: boolean; okText: string; alertText: string }) {
  return (
    <div className={`rounded-2xl border p-4 transition-colors ${alert ? "emergency-flash border-st-audio bg-st-audio/15" : "border-line bg-surface/80"}`}>
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-dim">{label}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${alert ? "bg-st-audio" : "bg-st-available"}`} style={{ boxShadow: alert ? "0 0 10px #e5484d" : "0 0 8px #2fbf7188" }} />
      </div>
      <div className={`mt-2 text-sm font-semibold ${alert ? "text-st-audio" : "text-paper"}`}>{alert ? alertText : okText}</div>
    </div>
  );
}

export default function Safety() {
  const { safety, sos, doorbell, stateInfo, triggerPanic, refreshDoorbell, dataSource, triggerSafetyDemo, clearSos } = useStore();
  const [demoActive, setDemoActive] = useState(false);
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoIndex = useRef(0);
  const anyAlert = !!safety && Object.values(safety).some(Boolean);

  const cancelDemoHold = () => {
    if (demoTimer.current) clearTimeout(demoTimer.current);
    demoTimer.current = null;
  };

  const startDemoHold = () => {
    if (dataSource !== "mock") return;
    cancelDemoHold();
    demoTimer.current = setTimeout(() => {
      const kinds: SafetyAlertKind[] = ["gas", "leakKitchen", "leakBath"];
      void triggerSafetyDemo(kinds[demoIndex.current % kinds.length]);
      demoIndex.current += 1;
      setDemoActive(true);
    }, 1200);
  };

  useEffect(() => {
    if (!anyAlert) setDemoActive(false);
  }, [anyAlert]);

  useEffect(() => () => cancelDemoHold(), []);

  if (!safety || !stateInfo) return null;

  const recording = stateInfo.state === "audio_rec" || stateInfo.state === "video_rec";
  const meta = STATE_META[stateInfo.state];

  return (
    <div className="rise-in page-shell page-shell--narrow">
      <h2
        className="font-display mb-1 w-fit text-2xl lg:text-3xl"
        onPointerDown={startDemoHold}
        onPointerUp={cancelDemoHold}
        onPointerCancel={cancelDemoHold}
        onPointerLeave={cancelDemoHold}
        onContextMenu={(event) => event.preventDefault()}
        title={dataSource === "mock" ? "Hold to run the next sensor demo" : undefined}
      >Safety</h2>
      <p className="mb-5 font-mono text-[11px] text-dim">gas · water · front door</p>

      {demoActive && anyAlert && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-st-meeting/40 bg-st-meeting/10 px-3 py-2.5">
          <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-st-meeting">Sensor demo · visible and notification-ready</span>
          <button onClick={() => triggerSafetyDemo("clear")} className="ml-3 shrink-0 text-xs font-semibold text-paper">Reset</button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SafetyTile label="Gas · Kitchen" alert={safety.gas} okText="No gas detected" alertText="GAS DETECTED" />
        <SafetyTile label="Leak · Kitchen" alert={safety.leakKitchen} okText="Floor is dry" alertText="WATER LEAK" />
        <SafetyTile label="Leak · Bathroom" alert={safety.leakBath} okText="Floor is dry" alertText="WATER LEAK" />
      </div>

      {/* Doorbell — state-aware */}
      <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-surface/80">
        <div className="flex items-center justify-between px-4 py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-dim">Doorbell · Entrance cam</span>
          <button onClick={refreshDoorbell} className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-gold transition-opacity hover:opacity-80 active:opacity-60">
            <RefreshIcon size={13} />
            Refresh
          </button>
        </div>
        {doorbell && (
          <div className="relative">
            <img src={doorbell.snapshotUrl} alt="Doorbell snapshot" className="aspect-video w-full object-cover" draggable={false} />
            <div className="absolute bottom-0 inset-x-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-4 pb-2.5 pt-8">
              <span className="font-mono text-[10px] text-paper/80">
                {new Date(doorbell.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
              {recording ? (
                <span className="rounded-full border border-st-audio/60 bg-st-audio/20 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-st-audio">
                  chime muted — {meta.label} in progress
                </span>
              ) : (
                <span className="rounded-full border border-line bg-black/40 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-dim">
                  chime active
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Family SOS */}
      <div className="mt-6 rounded-3xl border border-st-emergency/30 bg-surface/80 p-5">
        <div className="mb-1 flex items-center justify-between">
          <div className="font-display text-lg text-paper">Family SOS</div>
          {sos?.active && <span className="emergency-flash rounded-full border border-st-emergency/60 bg-st-emergency/20 px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider text-st-emergency">live · {sos.who}</span>}
        </div>
        <p className="mb-4 text-xs text-dim">
          One page, one hold — anyone in the family can raise the whole house from their phone. Open it once on Amma's and everyone's phone and add it to the home screen.
        </p>
        <div className="flex gap-2">
          <a
            href="#/sos"
            className="flex-1 rounded-xl border border-st-emergency/50 bg-st-emergency/10 px-4 py-3 text-center text-sm font-semibold text-st-emergency transition-all active:scale-[0.99]"
          >
            Open the SOS page
          </a>
          {sos?.active && (
            <button
              onClick={() => void clearSos()}
              className="rounded-xl border border-st-available/50 bg-st-available/10 px-4 py-3 text-sm font-semibold text-st-available"
            >
              Mark safe
            </button>
          )}
        </div>
      </div>

      {/* Guarded emergency */}
      <div className="mt-6 rounded-3xl border border-st-emergency/40 bg-st-emergency/5 p-5">
        <div className="mb-1 font-display text-lg text-st-emergency">Emergency</div>
        <p className="mb-4 text-xs text-dim">
          Rings every family phone, flashes all room signs violet, and sends the doorbell snapshot. Hold to trigger — releasing early cancels.
        </p>
        <HoldButton big label="Hold for Emergency" color="#7c3aed" durationMs={1600} onComplete={triggerPanic} />
      </div>
    </div>
  );
}
