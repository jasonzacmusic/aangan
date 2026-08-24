import React, { useState } from "react";
import { useStore } from "../state/store";
import RoomCard from "../components/RoomCard";
import DbMeter, { Sparkline } from "../components/DbMeter";
import { Room } from "../api/types";
import UtilitiesPanel from "../components/UtilitiesPanel";
import PianoRigCard from "../components/PianoRigCard";
import FleetCard from "../components/FleetCard";
import AirCard from "../components/AirCard";
import AirBanner from "../components/AirBanner";

export default function Home() {
  const { rooms, settings, dbHistory, preflight, fleet } = useStore();
  const [openRoom, setOpenRoom] = useState<Room | null>(null);
  const live = openRoom ? rooms.find((r) => r.id === openRoom.id) ?? openRoom : null;
  const studio = rooms.find((r) => r.id === "studio");
  const shownRooms = rooms.filter((r) => r.id !== "bedroom");
  const db = studio?.dbLevel ?? preflight?.dbLevel ?? null;
  const liveDb = typeof db === "number" ? db : null;
  const meterLive = liveDb != null;
  const boardLive = studio?.online === true;
  const boardsUp = fleet.filter((d) => d.kind === "esp32" && d.online).length;
  const boardsTotal = fleet.filter((d) => d.kind === "esp32").length || 6;
  const ready = preflight?.ready === true;
  const threshold = settings.dbThreshold;

  let studioLine = "Studio board is off. Plug board 1 in — sticker 1, studio.";
  if (boardLive && !meterLive) {
    studioLine = "Board is on Wi-Fi, but the number is not a real room yet. Speak next to the SEN0232. If this stays blank, the meter is not wired to GPIO34.";
  } else if (boardLive && liveDb != null && liveDb >= threshold) {
    studioLine = `${liveDb.toFixed(0)} dB — over your ${threshold} dB quiet line. Fan, AC, or traffic.`;
  } else if (boardLive && liveDb != null) {
    studioLine = `${liveDb.toFixed(0)} dB · under ${threshold} dB. ${ready ? "Doors and safety also clear." : "Quiet is fine — check doors below."}`;
  }

  return (
    <div className="rise-in page-shell">
      <h2 className="font-display mb-1 text-2xl lg:text-3xl">Studio</h2>
      <p className="mb-5 font-mono text-[11px] text-dim">
        {boardsUp} of {boardsTotal} boards on Wi-Fi · quiet line {threshold} dB
      </p>

      <section
        className={`relative overflow-hidden rounded-3xl border p-6 ${
          ready ? "border-st-available/40" : "border-line"
        }`}
        style={{
          background: ready
            ? "radial-gradient(circle at 80% 0%, #2fbf7120, transparent 55%)"
            : "radial-gradient(circle at 80% 0%, #c9a84c18, transparent 55%)",
        }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-dim">Recording gate</div>
            <div className={`font-display mt-1 text-4xl ${ready ? "text-st-available" : "text-paper"}`}>
              {ready ? "Ready" : "Not ready"}
            </div>
          </div>
          <span
            className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-wider ${
              boardLive ? "border-st-available/35 text-st-available" : "border-st-audio/40 text-st-audio"
            }`}
          >
            {boardLive ? "Board 1 live" : "Board 1 silent"}
          </span>
        </div>
        <p className="mt-3 max-w-xl text-sm text-dim">{studioLine}</p>
        <div className="mt-5">
          {meterLive ? (
            <>
              <DbMeter value={liveDb} threshold={threshold} />
              {dbHistory.length > 1 && (
                <div className="mt-4 rounded-xl border border-line bg-ink/40 p-3">
                  <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-dim">Last 90 seconds</div>
                  <Sparkline data={dbHistory} threshold={threshold} />
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-line px-4 py-8 text-center">
              <div className="font-display text-2xl text-dim">— dB</div>
              <p className="mt-2 text-xs text-dim">A real SEN0232 never sits under 30 dB. Blank is honest.</p>
            </div>
          )}
        </div>
        {preflight && (
          <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { k: "Doors", ok: preflight.doorsClosed, fail: preflight.openDoorNames?.[0] ?? "Open" },
              { k: "Quiet", ok: preflight.quietEnough, fail: meterLive ? "Too loud" : "No meter" },
              { k: "Studio board", ok: preflight.sensorsHealthy, fail: "Silent" },
              { k: "Safety", ok: preflight.safetyClear, fail: "Alert" },
            ].map((row) => (
              <div key={row.k} className="rounded-xl border border-line bg-ink/35 px-3 py-2.5">
                <dt className="font-mono text-[9px] uppercase tracking-widest text-dim">{row.k}</dt>
                <dd className={`mt-0.5 text-sm font-semibold ${row.ok ? "text-st-available" : "text-st-audio"}`}>
                  {row.ok ? "Clear" : row.fail}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      <h3 className="font-display mt-8 mb-3 text-lg">Rooms</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shownRooms.map((r) => (
          <RoomCard key={r.id} room={r} threshold={settings.dbThreshold} onOpen={() => setOpenRoom(r)} />
        ))}
      </div>

      <AirBanner />

      <div className="dash-grid">
        <div>
          <AirCard />
          <PianoRigCard />
        </div>
        <div>
          <FleetCard />
          <UtilitiesPanel />
        </div>
      </div>

      {/* Room detail sheet */}
      {live && (
        <div className="fixed inset-0 z-40 flex items-end justify-center lg:items-center" onClick={() => setOpenRoom(null)} role="dialog" aria-modal="true" aria-label={`${live.name} sensor details`}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            className="rise-in relative z-10 w-full max-w-md rounded-t-3xl border border-line bg-surface p-6 pb-10 safe-bottom lg:rounded-3xl lg:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-line lg:hidden" />
            <div className="flex items-center justify-between">
              <h3 className="font-display text-2xl">{live.name}</h3>
              <span className="pulse-dot h-3 w-3 rounded-full" style={{ background: live.signColor, boxShadow: `0 0 12px ${live.signColor}` }} />
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                { k: "Door", v: live.doorOpen ? "OPEN" : "Closed", warn: live.doorOpen },
                { k: "Presence", v: live.presence ? "Present" : "Empty", warn: false },
                { k: "Temp", v: live.tempC == null ? "Not fitted" : `${live.tempC.toFixed(1)}°C`, warn: false },
              ].map((c) => (
                <div key={c.k} className="rounded-xl border border-line bg-surface2 px-2 py-3">
                  <div className="font-mono text-[9px] uppercase tracking-widest text-dim">{c.k}</div>
                  <div className={`mt-1 text-sm font-semibold ${c.warn ? "text-st-meeting" : ""}`}>{c.v}</div>
                </div>
              ))}
            </div>

            {live.dbLevel != null && (
              <div className="mt-5">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Room microphone</div>
                <DbMeter value={live.dbLevel} threshold={settings.dbThreshold} />
                <div className="mt-4 rounded-xl border border-line bg-surface2 p-3">
                  <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-dim">Last 90 seconds</div>
                  <Sparkline data={dbHistory} threshold={settings.dbThreshold} />
                </div>
              </div>
            )}

            <button className="mt-6 h-12 w-full rounded-2xl border border-line text-sm text-dim active:scale-[0.98]" onClick={() => setOpenRoom(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
