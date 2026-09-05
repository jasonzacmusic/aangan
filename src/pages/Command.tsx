import React, { useState } from "react";
import { SceneDef, STATE_META, StudioState } from "../api/types";
import StateDial from "../components/StateDial";
import DbMeter from "../components/DbMeter";
import { timeSince, useStore } from "../state/store";
import { ArrowRightIcon, ChevronDownIcon, SceneIcon, TuningForkIcon } from "../components/icons";
import DoorCouple from "../components/DoorCouple";
import { STUDIO_REST_DBA_AC_ON } from "../door/studioDoorPresets";

interface Props {
  onSelect: (state: StudioState) => void;
  onScene: (scene: SceneDef) => void;
  onOpenDisplays: () => void;
  onOpenReady: () => void;
}

const SEVERITY_COLOR = {
  info: "#8b8b96",
  success: "#2fbf71",
  warning: "#f5a623",
  critical: "#e5484d",
};

export default function Command({ onSelect, onScene, onOpenDisplays, onOpenReady }: Props) {
  const { stateInfo, settings, committing, history, sceneRunning, playTone, rooms, preflight } = useStore();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [tonePlaying, setTonePlaying] = useState(false);
  if (!stateInfo) return null;
  const meta = STATE_META[stateInfo.state];
  const studio = rooms.find((r) => r.id === "music");
  const latestAge = history[0] ? timeSince(history[0].ts) : "";
  const latestWhen = latestAge === "just now" ? latestAge : `${latestAge} ago`;

  const soundA = async () => {
    setTonePlaying(true);
    await playTone(440);
    setTimeout(() => setTonePlaying(false), 1800);
  };

  return (
    <div className="rise-in page-shell page-shell--narrow flex flex-col items-center pt-2 lg:pt-8">
      <StateDial info={stateInfo} committing={committing} chimes={settings.chimes} onSelect={onSelect} />

      <p className="mt-3 text-center text-sm text-paper/70 lg:text-base">{meta.tagline}</p>
      <p className="mt-1 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-dim">turn the dial · light and screen move as one</p>

      <DoorCouple state={stateInfo.state} onOpenDisplays={onOpenDisplays} />

      {preflight && !preflight.ready && (stateInfo.state === "available" || stateInfo.state === "class" || stateInfo.state === "meeting") && (
        <button
          type="button"
          onClick={() => onOpenReady()}
          className="mt-4 w-full rounded-2xl border border-st-meeting/40 bg-st-meeting/10 px-4 py-3 text-left"
        >
          <span className="block font-mono text-[10px] uppercase tracking-[0.28em] text-st-meeting">Not ready to record</span>
          <span className="mt-1 block text-sm text-paper/80">
            {!preflight.doorsClosed
              ? "A studio door is open."
              : !preflight.quietEnough
                ? preflight.dbLevel == null
                  ? "The studio mic is not reporting."
                  : `Room is ${preflight.dbLevel.toFixed(0)} dBA — over the take line.`
                : !preflight.sensorsHealthy
                  ? "A sensor node has gone quiet."
                  : "A safety alert is live."}{" "}
            Open Ready for the full verdict.
          </span>
        </button>
      )}

      {studio?.dbLevel != null && (
        <div className="mt-6 w-full rounded-2xl border border-line bg-surface/80 p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Studio · Board 1 live</div>
            <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-dim">
              <span className="h-2 w-2 rounded-full" style={{ background: studio.signColor, boxShadow: `0 0 8px ${studio.signColor}` }} />
              {studio.doorOpen ? "door open" : "doors shut"}
            </span>
          </div>
          <div className="mt-3">
            <DbMeter value={studio.dbLevel} threshold={settings.doorWarnDb} />
          </div>
          <div className="mt-2 font-mono text-[10px] leading-relaxed text-dim">
            Rest with AC on is {STUDIO_REST_DBA_AC_ON} dBA · hall warns at {settings.doorWarnDb} dBA (puck + sign together)
          </div>
        </div>
      )}

      <div className="mt-7 w-full">
        <div className="mb-3 flex items-end justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Quick scenes</div>
          <button
            onClick={soundA}
            disabled={tonePlaying}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] transition-all ${tonePlaying ? "border-gold bg-gold/20 text-gold" : "border-line text-dim hover:border-gold/40 hover:text-gold active:scale-95"}`}
            aria-label="Play A 440 tuning tone"
          >
            <TuningForkIcon size={13} />
            {tonePlaying ? "A440 sounding" : "A440"}
          </button>
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          {settings.scenes.map((scene) => {
            const sceneMeta = STATE_META[scene.state];
            const running = sceneRunning === scene.id;
            return (
              <button
                key={scene.id}
                onClick={() => onScene(scene)}
                disabled={sceneRunning !== null}
                className={`scene-button flex items-center gap-3 overflow-hidden rounded-2xl border bg-surface/80 px-4 py-3.5 text-left backdrop-blur transition-all active:scale-[0.98] sm:flex-col sm:items-start sm:gap-2 ${running ? "scene-conducting" : "border-line"}`}
                style={running ? { borderColor: `${sceneMeta.color}88`, boxShadow: `0 0 24px ${sceneMeta.color}22` } : undefined}
              >
                <SceneIcon icon={scene.icon} size={22} className="scene-icon shrink-0 text-gold" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{running ? "Conducting…" : scene.label}</span>
                  <span className="mt-0.5 flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider" style={{ color: sceneMeta.color }}>
                    <ArrowRightIcon size={11} />
                    {sceneMeta.label}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <section className="mt-5 w-full overflow-hidden rounded-2xl border border-line bg-surface/65 backdrop-blur">
        <button
          className="flex w-full items-center justify-between px-4 py-3.5 text-left"
          onClick={() => setHistoryOpen((open) => !open)}
          aria-expanded={historyOpen}
        >
          <span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.28em] text-dim">Recent activity</span>
            {!historyOpen && history[0] && <span className="mt-1 block text-xs text-paper/70">{history[0].title} · {latestWhen}</span>}
          </span>
          <ChevronDownIcon size={18} className={`shrink-0 text-gold transition-transform ${historyOpen ? "rotate-180" : ""}`} />
        </button>
        {historyOpen && (
          <div className="border-t border-line px-4 py-1">
            {history.slice(0, 8).map((event, index) => (
              <div key={event.id} className={`relative flex gap-3 py-3 ${index < Math.min(history.length, 8) - 1 ? "border-b border-line/70" : ""}`}>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: SEVERITY_COLOR[event.severity], boxShadow: `0 0 8px ${SEVERITY_COLOR[event.severity]}66` }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{event.title}</span>
                  <span className="mt-0.5 block text-xs text-dim">{event.detail}</span>
                </span>
                <span className="shrink-0 font-mono text-[9px] text-dim/70">{timeSince(event.ts)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
