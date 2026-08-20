import React, { useEffect, useState } from "react";
import { SceneDef, STATE_META, StudioState } from "./api/types";
import ConfirmSheet from "./components/ConfirmSheet";
import EmergencyOverlay from "./components/EmergencyOverlay";
import Nav, { Tab } from "./components/Nav";
import LedEspBadge from "./components/LedEspBadge";
import PwaUpdatePrompt from "./components/PwaUpdatePrompt";
import VoiceButton from "./components/VoiceButton";
import NudgeBanner from "./components/NudgeBanner";
import Command from "./pages/Command";
import DisplayPanel from "./pages/DisplayPanel";
import Displays from "./pages/Displays";
import Home from "./pages/Home";
import More from "./pages/More";
import Preflight from "./pages/Preflight";
import Safety from "./pages/Safety";
import Setup from "./pages/Setup";
import Settings from "./pages/Settings";
import SosPage from "./pages/SosPage";
import GuestPage from "./pages/GuestPage";
import { startEmergencySiren } from "./state/audio";
import { useStore } from "./state/store";

type PendingCommand = { state: StudioState; scene?: SceneDef };

type Route = { kind: "app" } | { kind: "panel"; id: string } | { kind: "sos" } | { kind: "guest" };

function useRoute(): Route {
  const read = (): Route => {
    const m = /^#\/display\/(.+)$/.exec(window.location.hash);
    if (m) return { kind: "panel", id: decodeURIComponent(m[1]) };
    if (/^#\/sos\/?$/.test(window.location.hash)) return { kind: "sos" };
    if (/^#\/guest\/?$/.test(window.location.hash)) return { kind: "guest" };
    return { kind: "app" };
  };
  const [route, setRoute] = useState<Route>(read);
  useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return route;
}

export default function App() {
  const {
    stateInfo,
    safety,
    sos,
    dataSource,
    connected,
    connectionStatus,
    settings,
    lastError,
    clearError,
    setStudioState,
    clearSos,
    runScene,
  } = useStore();
  const [tab, setTab] = useState<Tab>("command");
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const route = useRoute();
  const panelId = route.kind === "panel" ? route.id : null;

  useEffect(() => {
    if (!stateInfo) return;
    const color = STATE_META[stateInfo.state].color;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", color);
    document.documentElement.style.setProperty("--active-state-color", color);
  }, [stateInfo?.state]);

  useEffect(() => {
    if (stateInfo?.state !== "emergency" || panelId) return;
    return startEmergencySiren(settings.emergencySiren);
  }, [stateInfo?.state, settings.emergencySiren, panelId]);

  // The family SOS page — a home-screen bookmark on every family phone.
  if (route.kind === "sos") {
    return (
      <div className="relative min-h-dvh" style={{ ["--state-rgb" as string]: STATE_META.emergency.rgb }}>
        <div className="living-bg" />
        <div className="relative z-10">
          <SosPage />
        </div>
        <PwaUpdatePrompt />
      </div>
    );
  }

  // The visitor page reached from the door display's QR — read-only.
  if (route.kind === "guest") {
    const meta = stateInfo ? STATE_META[stateInfo.state] : STATE_META.available;
    return (
      <div className="relative min-h-dvh" style={{ ["--state-rgb" as string]: meta.rgb }}>
        <div className="living-bg" />
        <div className="relative z-10">
          <GuestPage />
        </div>
      </div>
    );
  }

  // Kiosk panels render only their assigned content — no nav, no dial.
  if (panelId) {
    const meta = stateInfo ? STATE_META[stateInfo.state] : STATE_META.available;
    return (
      <div className="relative min-h-dvh" style={{ ["--state-rgb" as string]: meta.rgb }}>
        <div className="living-bg" />
        <div className="relative z-10">
          <DisplayPanel id={panelId} />
        </div>
      </div>
    );
  }

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

  const emergencyCause = sos?.active
    ? `SOS — ${sos.who}${sos.message ? `: “${sos.message}”` : " needs help"}`
    : safety?.fire
      ? "Smoke or flame sensor triggered"
      : safety?.gas
      ? "Kitchen gas sensor triggered"
      : safety?.panic
        ? "Wired panic button triggered"
      : safety?.leakKitchen
        ? "Kitchen water sensor triggered"
        : safety?.leakBath
          ? "Bathroom water sensor triggered"
          : safety?.leakGeyser
            ? "Geyser water sensor triggered"
            : safety?.perimeter
              ? "Perimeter vibration sensor triggered"
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

      <main className="relative z-10 pb-32 pt-2 lg:pl-56 lg:pb-28 lg:pt-16">
        {tab === "command" && <Command onSelect={requestState} onScene={requestScene} />}
        {tab === "home" && <Home />}
        {tab === "preflight" && <Preflight onSelect={requestState} />}
        {tab === "displays" && <Displays />}
        {tab === "safety" && <Safety />}
        {tab === "setup" && <Setup />}
        {tab === "settings" && <Settings />}
        {tab === "more" && <More onOpen={setTab} />}
      </main>

      {/* Whether the real door light is answering. Fixed, always visible,
          because "is it connected?" was previously unanswerable. */}
      <div className="pointer-events-auto fixed right-4 top-14 z-[40]">
        <LedEspBadge />
      </div>

      <NudgeBanner />
      <Nav tab={tab} setTab={setTab} />
      {tab === "command" ? <VoiceButton onCommand={requestState} /> : null}
      <PwaUpdatePrompt />

      {lastError && (
        <div className="rise-in fixed inset-x-4 bottom-24 z-[35] mx-auto flex max-w-md items-start gap-3 rounded-2xl border border-st-meeting/40 bg-surface/95 p-4 shadow-2xl backdrop-blur lg:bottom-6" role="alert">
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-st-meeting" />
          <span className="flex-1 text-sm text-paper">{lastError}</span>
          <button onClick={clearError} className="text-xs text-dim" aria-label="Dismiss message">Close</button>
        </div>
      )}

      {pending && <ConfirmSheet state={pending.state} onConfirm={confirmPending} onCancel={() => setPending(null)} />}
      {stateInfo.state === "emergency" && (
        <EmergencyOverlay
          cause={emergencyCause}
          onStandDown={() => {
            void clearSos();
            void setStudioState("available");
          }}
        />
      )}
    </div>
  );
}
