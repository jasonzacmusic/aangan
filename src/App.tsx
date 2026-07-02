import React, { useState } from "react";
import { useStore } from "./state/store";
import { STATE_META, StudioState } from "./api/types";
import Nav, { Tab } from "./components/Nav";
import Command from "./pages/Command";
import Home from "./pages/Home";
import Preflight from "./pages/Preflight";
import Safety from "./pages/Safety";
import Settings from "./pages/Settings";
import ConfirmSheet from "./components/ConfirmSheet";
import VoiceButton from "./components/VoiceButton";
import EmergencyOverlay from "./components/EmergencyOverlay";

export default function App() {
  const { stateInfo, dataSource, connected, setStudioState } = useStore();
  const [tab, setTab] = useState<Tab>("command");
  const [pendingState, setPendingState] = useState<StudioState | null>(null);

  if (!stateInfo) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <img src="/nsm-white.png" alt="" className="mx-auto mb-4 w-40 opacity-80" />
          <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-gold">Studio Command</div>
          <div className="mt-2 font-mono text-[10px] text-dim">tuning in…</div>
        </div>
      </div>
    );
  }

  const meta = STATE_META[stateInfo.state];

  /** Central gate: high-stakes states need a hold-confirm. */
  const requestState = (s: StudioState) => {
    if (s === stateInfo.state) return;
    if (STATE_META[s].needsConfirm) setPendingState(s);
    else setStudioState(s);
  };

  const confirmPending = () => {
    if (pendingState) setStudioState(pendingState);
    setPendingState(null);
  };

  return (
    <div className="relative min-h-dvh" style={{ ["--state-rgb" as string]: meta.rgb }}>
      <div className="living-bg" />

      {/* Header (phone) */}
      <header className="safe-top relative z-10 lg:hidden">
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <img src="/nsm-white.png" alt="Nathaniel School of Music" className="h-6 w-auto opacity-90" />
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface/70 px-3 py-1.5 backdrop-blur">
            <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-st-available" : "bg-st-audio"} pulse-dot`} />
            <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-dim">
              {dataSource} · {connected ? "online" : "offline"}
            </span>
          </div>
        </div>
        <div className="px-5 pb-3 font-mono text-[10px] uppercase tracking-[0.42em] text-gold">Studio Command</div>
      </header>

      {/* Header (iPad rail handles branding; show status top-right) */}
      <div className="fixed right-6 top-6 z-20 hidden items-center gap-2 rounded-full border border-line bg-surface/70 px-3.5 py-2 backdrop-blur lg:flex">
        <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-st-available" : "bg-st-audio"} pulse-dot`} />
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
          {dataSource} · {connected ? "online" : "offline"}
        </span>
      </div>

      <main className="relative z-10 pb-32 pt-2 lg:pl-56 lg:pt-16">
        {tab === "command" && <Command onSelect={requestState} />}
        {tab === "home" && <Home />}
        {tab === "preflight" && <Preflight onSelect={requestState} />}
        {tab === "safety" && <Safety />}
        {tab === "settings" && <Settings />}
      </main>

      <Nav tab={tab} setTab={setTab} />
      <VoiceButton onCommand={requestState} />

      {pendingState && <ConfirmSheet state={pendingState} onConfirm={confirmPending} onCancel={() => setPendingState(null)} />}

      {stateInfo.state === "emergency" && <EmergencyOverlay onStandDown={() => setStudioState("available")} />}
    </div>
  );
}
