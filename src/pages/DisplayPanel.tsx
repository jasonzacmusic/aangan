import React, { useEffect, useState } from "react";
import { STATE_META, StudioState } from "../api/types";
import { useStore } from "../state/store";
import DbMeter from "../components/DbMeter";
import NudgeBanner from "../components/NudgeBanner";
import GuestQr from "../components/GuestQr";
import AirBanner from "../components/AirBanner";
import StudioDoorSign from "../components/StudioDoorSign";
import { AlertIcon } from "../components/icons";

/**
 * Full-screen kiosk view for a wall/door display.
 * Opened at /#/display/<id> on any old iPad / cheap panel in a browser or
 * kiosk app. Content follows the assignment made on the Displays page, and an
 * active Delivery targeted at this display always takes over.
 */

const DOOR_WORDING: Record<StudioState, { big: string; small: string }> = {
  available: { big: "COME ON IN", small: "The house is open — ring once and enter" },
  class: { big: "LESSON IN PROGRESS", small: "Enter softly · a student is playing" },
  meeting: { big: "ON A CALL", small: "Knock gently and wait" },
  audio_rec: { big: "RECORDING — PLEASE WAIT", small: "Absolute silence · do not ring the bell" },
  video_rec: { big: "ON AIR — DO NOT ENTER", small: "Cameras are rolling · please wait outside" },
  emergency: { big: "EMERGENCY", small: "Please call the family before entering" },
};

function useClock() {
  // Everything a panel shows from the clock is minute-resolution (HH:MM,
  // date, delivery minutes). Holding the epoch minute means React skips the
  // re-render on 59 of every 60 ticks — a kiosk was repainting its whole
  // tree (door sign, room grid, QR) every second for no visible change.
  const [minute, setMinute] = useState(() => Math.floor(Date.now() / 60000));
  useEffect(() => {
    const t = setInterval(() => setMinute(Math.floor(Date.now() / 60000)), 1000);
    return () => clearInterval(t);
  }, []);
  return new Date(minute * 60000);
}

function PanelChrome({ children, accent, pulse }: { children: React.ReactNode; accent: string; pulse?: boolean }) {
  const now = useClock();
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-8 text-center">
      <div
        className={`pointer-events-none absolute inset-0 transition-colors duration-700 ${pulse ? "panel-pulse" : ""}`}
        style={{ background: `radial-gradient(circle at 50% -20%, ${accent}33, transparent 60%), radial-gradient(circle at 50% 120%, ${accent}22, transparent 55%)` }}
      />
      <div className="relative z-10 flex w-full max-w-4xl flex-col items-center">{children}</div>
      <div className="absolute bottom-8 left-0 right-0 z-10 flex items-center justify-between px-10">
        <img src="/nsm-white.png" alt="Nathaniel School of Music" className="h-7 w-auto opacity-80" />
        <div className="font-mono text-sm tracking-[0.2em] text-dim">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </div>
    </div>
  );
}

export default function DisplayPanel({ id }: { id: string }) {
  const { stateInfo, displays, delivery, sos, rooms, utilities, doorbell, settings, dbHistory } = useStore();
  const now = useClock();

  if (!stateInfo) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="font-mono text-xs uppercase tracking-[0.4em] text-gold">Studio Command · panel waking…</div>
      </div>
    );
  }

  const display = displays.find((d) => d.id === id);
  const meta = STATE_META[stateInfo.state];

  if (!display) {
    return (
      <PanelChrome accent="#C9A84C">
        <div className="font-mono text-xs uppercase tracking-[0.35em] text-gold">Unknown display</div>
        <div className="font-display mt-4 text-4xl">“{id}” is not configured</div>
        <p className="mt-4 max-w-md text-dim">Open Studio Command → Displays and add this panel, then reload.</p>
      </PanelChrome>
    );
  }

  // A live family SOS takes over every panel in the house.
  if (sos?.active) {
    return (
      <PanelChrome accent="#7C3AED" pulse>
        <AlertIcon size={92} className="emergency-flash text-st-emergency" />
        <div className="mt-6 font-mono text-sm uppercase tracking-[0.4em] text-st-emergency">Family SOS</div>
        <div className="font-display mt-4 text-7xl leading-tight lg:text-8xl" style={{ color: "#a78bfa", textShadow: "0 0 50px #7C3AED88" }}>
          {sos.who} NEEDS HELP
        </div>
        {sos.message && <div className="mt-8 text-3xl text-paper">“{sos.message}”</div>}
        <div className="mt-8 font-mono text-sm text-dim">Go to them now · every family phone is ringing</div>
      </PanelChrome>
    );
  }

  // A targeted, unexpired delivery always wins.
  if (delivery?.active && delivery.displayId === id && delivery.expiresAt > now.getTime()) {
    const minsLeft = Math.max(0, Math.ceil((delivery.expiresAt - now.getTime()) / 60000));
    return (
      <PanelChrome accent="#C9A84C" pulse>
        <div className="font-mono text-sm uppercase tracking-[0.4em] text-gold">{delivery.courier} · delivery hand-off</div>
        <div className="mt-6 font-display text-3xl text-paper">Your code</div>
        <div className="font-display mt-4 rounded-3xl border border-gold/50 bg-gold/10 px-12 py-6 text-8xl tracking-[0.25em] text-gold" style={{ textShadow: "0 0 40px #C9A84C55" }}>
          {delivery.otp}
        </div>
        {delivery.note && <div className="mt-8 text-3xl text-paper">{delivery.note}</div>}
        <div className="mt-8 font-mono text-sm text-dim">
          Please take this code — no need to ring the bell · expires in {minsLeft} min
        </div>
      </PanelChrome>
    );
  }

  const studio = rooms.find((r) => r.id === "music");
  if (id === "front-studio" || display.content === "studio_door") {
    return (
      <StudioDoorSign
        state={stateInfo.state}
        dbLevel={studio?.dbLevel}
        doorWarnDb={settings.doorWarnDb}
        doorOpen={!!studio?.doorOpen}
        visualOverride={studio?.signVisual}
      />
    );
  }

  switch (display.content) {
    case "door": {
      const wording = DOOR_WORDING[stateInfo.state];
      const rec = stateInfo.state === "audio_rec" || stateInfo.state === "video_rec";
      return (
        <PanelChrome accent={meta.color} pulse={rec || stateInfo.state === "emergency"}>
          <div className="flex items-center gap-4">
            <span className="pulse-dot h-5 w-5 rounded-full" style={{ background: meta.color, boxShadow: `0 0 24px ${meta.color}` }} />
            <span className="font-mono text-sm uppercase tracking-[0.4em] text-dim">{meta.label}</span>
          </div>
          <div className="font-display mt-8 text-7xl leading-tight lg:text-8xl" style={{ color: meta.color, textShadow: `0 0 50px ${meta.color}66` }}>
            {wording.big}
          </div>
          <div className="mt-8 text-2xl text-paper/90">{wording.small}</div>
          <NudgeBanner variant="panel" />
          <AirBanner variant="panel" />
          <GuestQr />
        </PanelChrome>
      );
    }
    case "state":
      return (
        <PanelChrome accent={meta.color} pulse={stateInfo.state === "audio_rec" || stateInfo.state === "video_rec"}>
          <div className="font-mono text-sm uppercase tracking-[0.45em] text-dim">Studio state</div>
          <div className="font-display mt-6 text-9xl" style={{ color: meta.color, textShadow: `0 0 60px ${meta.color}66` }}>
            {meta.short}
          </div>
          <div className="mt-6 text-3xl text-paper">{meta.tagline}</div>
          <div className="mt-8 font-mono text-sm text-dim">set by {stateInfo.setBy}</div>
          <NudgeBanner variant="panel" />
        </PanelChrome>
      );
    case "house": {
      const music = rooms.find((r) => r.dbLevel != null);
      return (
        <PanelChrome accent={meta.color}>
          <div className="mb-8 flex items-center gap-4">
            <span className="pulse-dot h-4 w-4 rounded-full" style={{ background: meta.color, boxShadow: `0 0 20px ${meta.color}` }} />
            <span className="font-display text-3xl">{meta.label}</span>
          </div>
          <div className="grid w-full grid-cols-2 gap-3 lg:grid-cols-3">
            {rooms.map((r) => (
              <div key={r.id} className={`rounded-2xl border p-4 text-left ${r.doorOpen ? "border-st-meeting/50 bg-st-meeting/10" : "border-line bg-surface/70"}`}>
                <div className="font-display text-xl">{r.name}</div>
                <div className="mt-1 font-mono text-xs text-dim">
                  {r.doorOpen ? "door OPEN" : "door closed"} · {r.presence ? "occupied" : "empty"} · {r.tempC == null ? "temp not fitted" : `${r.tempC.toFixed(1)}°C`}
                </div>
              </div>
            ))}
            {utilities && (
              <div className="rounded-2xl border border-line bg-surface/70 p-4 text-left">
                <div className="font-display text-xl">House pulse</div>
                <div className="mt-1 font-mono text-xs leading-relaxed text-dim">
                  {utilities.water.online ? `water ${Math.round(utilities.water.overheadPct)}%` : "water not fitted"} · {utilities.power.online ? (utilities.power.mainsOnline ? `mains ${Math.round(utilities.power.voltage)}V` : "ON INVERTER") : "power not fitted"} · {utilities.lpg.online ? `LPG ${utilities.lpg.remainingPct}%` : "LPG scale not fitted"} · {utilities.air.online ? `AQI ${utilities.air.aqi}` : "air not fitted"}
                </div>
              </div>
            )}
          </div>
          {music?.dbLevel != null && (
            <div className="mt-6 w-full max-w-xl">
              <DbMeter value={music.dbLevel} threshold={settings.dbThreshold} />
              <div className="mt-1 font-mono text-[10px] text-dim">{dbHistory.length ? "music room · live" : ""}</div>
            </div>
          )}
          <NudgeBanner variant="panel" />
        </PanelChrome>
      );
    }
    case "doorbell":
      return (
        <PanelChrome accent={meta.color}>
          <div className="font-mono text-sm uppercase tracking-[0.4em] text-dim">Entrance camera</div>
          {doorbell ? (
            <img src={doorbell.snapshotUrl} alt="Latest entrance snapshot" className="mt-6 w-full max-w-3xl rounded-3xl border border-line" />
          ) : (
            <div className="mt-6 text-dim">No snapshot yet</div>
          )}
          <div className="mt-5 font-display text-2xl" style={{ color: meta.color }}>{meta.label}</div>
        </PanelChrome>
      );
    case "message":
      return (
        <PanelChrome accent={meta.color}>
          <div className="font-display text-6xl leading-tight text-paper lg:text-7xl">{display.message || "…"}</div>
        </PanelChrome>
      );
    case "clock":
      return (
        <PanelChrome accent={meta.color}>
          <div className="font-display text-9xl tracking-tight" style={{ textShadow: `0 0 60px ${meta.color}44` }}>
            {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
          <div className="mt-4 font-mono text-lg text-dim">
            {now.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" })}
          </div>
          <div className="mt-8 flex items-center gap-3">
            <span className="h-3 w-3 rounded-full" style={{ background: meta.color, boxShadow: `0 0 16px ${meta.color}` }} />
            <span className="font-mono text-sm uppercase tracking-[0.3em] text-dim">{meta.label}</span>
          </div>
        </PanelChrome>
      );
  }
}
