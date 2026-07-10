import React, { useEffect, useState } from "react";
import { SceneDef, STATE_META, StudioState } from "./api/types";
import ConfirmSheet from "./components/ConfirmSheet";
import EmergencyOverlay from "./components/EmergencyOverlay";
import Nav, { Tab } from "./components/Nav";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import VoiceButton from "./components/VoiceButton";
import Command from "./pages/Command";
import Home from "./pages/Home";
import Preflight from "./pages/Preflight";
import Safety from "./pages/Safety";
import Settings from "./pages/Settings";
import { startEmergencySiren } from "./state/audio";
import { useStore } from "./state/store";

type PendingCommand = { state: StudioState; scene?: SceneDef };

export default function App() {
  const {
    stateInfo,
    safety,
    dataSource,
    connected,
    connectionStatus,
    settings,
    lastError,
    clearError,
    setStudioState,
    runScene,
  } = useStore();
  const [tab, setTab] = useState<Tab>("command");
  const [pending, setPending] = useState<PendingCommand | null>(null);

  useEffect(() => {
    if (!stateInfo) return;
    const color = STATE_META[stateInfo.state].color;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", color);
    document.documentElement.style.setProperty("--active-state-color", color);
  }, [stateInfo?.state]);

  useEffect(() => {
    if (stateInfo?.state !== "emergency") return;
    return startEmergencySiren(settings.emergencySiren);
  }, [stateInfo?.state, settings.emergencySiren]);

  if (!stateInfo) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <img src="/nsm-white.png" alt="Nathaniel School of Music" className="mx-auto mb-4 w-40 opacity-80" />
          <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-gold">Studio Command</div>
          <div className="mt-2 font-mono text-[10px] text-dim">
            {connectionStatus === "connecting" ? "tuning in…" : dataSource === "live" ? "Pi unreachable · retrying…" : "restarting the house…"}
          </div>
        </div>
        <PwaUpdatePrompt />
      </div>
    );
  }

  const meta = STATE_META[stateInfo.state];

  const requestState = (state: StudioState) => {
    if (state === stateInfo.state) return;
    if (STATE_META[state].needsConfirm) setPending({ state });
    else void setStudioState(state);
  };

  const requestScene = (scene: SceneDef) => {
    if (STATE_META[scene.state].needsConfirm) setPending({ state: scene.state, scene });
    else void runScene(scene);
  };

  const confirmPending = () => {
    if (!pending) return;
    if (pending.scene) void runScene(pending.scene);
    else void setStudioState(pending.state);
    setPending(null);
  };

  const emergencyCause = safety?.gas
    ? "Kitchen gas sensor triggered"
    : safety?.leakKitchen
      ? "Kitchen water sensor triggered"
      : safety?.leakBath
        ? "Bathroom water sensor triggered"
        : "Emergency was triggered manually";

  const statusLabel = connected
    ? "online"
    : connectionStatus === "reconnecting"
      ? "reconnecting…"
      : dataSource === "live"
        ? "Pi unreachable"
        : "offline";

  return (
    <div className="relative min-h-dvh" style={{ ["--state-rgb" as string]: meta.rgb }}>
      <div className="living-bg" />

      <header className="safe-top relative z-10 lg:hidden">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <img src="/nsm-white.png" alt="Nathaniel School of Music" className="h-6 w-auto opacity-90" />
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 backdrop-blur">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-st-available" : connectionStatus === "reconnecting" ? "bg-st-meeting" : "bg-st-audio"} pulse-dot`} />
            <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-dim">{dataSource} · {statusLabel}</span>
          </div>
        </div>
        <div className="px-5 pb-3 font-mono text-[10px] uppercase tracking-[0.42em] text-gold">Studio Command</div>
      </header>

      <div className="fixed right-6 top-6 z-20 hidden items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 py-2 backdrop-blur lg:flex">
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-st-available" : connectionStatus === "reconnecting" ? "bg-st-meeting" : "bg-st-audio"} pulse-dot`} />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">{dataSource} · {statusLabel}</span>
      </div>

      <main className="relative z-10 pb-32 pt-2 lg:pl-56 lg:pt-16">
        {tab === "command" && <Command onSelect={requestState} onScene={requestScene} />}
        {tab === "home" && <Home />}
        {tab === "preflight" && <Preflight onSelect={requestState} />}
        {tab === "safety" && <Safety />}
        {tab === "settings" && <Settings />}
      </main>

      <Nav tab={tab} setTab={setTab} />
      <VoiceButton onCommand={requestState} />
      <PwaUpdatePrompt />

      {lastError && (
        <div className="rise-in fixed inset-x-4 bottom-24 z-[35] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-st-meeting/40 bg-surface/95 p-4 shadow-2xl backdrop-blur lg:bottom-6" role="alert">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-st-meeting" />
          <span className="flex-1 text-sm text-paper">{lastError}</span>
          <button onClick={clearError} className="text-xs text-dim" aria-label="Dismiss message">Close</button>
        </div>
      )}

      {pending && <ConfirmSheet state={pending.state} onConfirm={confirmPending} onCancel={() => setPending(null)} />}
      {stateInfo.state === "emergency" && <EmergencyOverlay cause={emergencyCause} onStandDown={() => void setStudioState("available")} />}
    </div>
  );
}
