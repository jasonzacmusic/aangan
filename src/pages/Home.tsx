import React, { useState } from "react";
import { useStore } from "../state/store";
import RoomCard from "../components/RoomCard";
import DbMeter, { Sparkline } from "../components/DbMeter";
import { Room } from "../api/types";
import UtilitiesPanel from "../components/UtilitiesPanel";

export default function Home() {
  const { rooms, settings, dbHistory } = useStore();
  const [openRoom, setOpenRoom] = useState<Room | null>(null);
  const live = openRoom ? rooms.find((r) => r.id === openRoom.id) ?? openRoom : null;

  return (
    <div className="rise-in mx-auto max-w-md px-5 lg:max-w-3xl">
      <h2 className="font-display mb-1 text-2xl lg:text-3xl">The House</h2>
      <p className="mb-5 font-mono text-[11px] text-dim">5 zones · live from the room sensors</p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rooms.map((r) => (
          <RoomCard key={r.id} room={r} threshold={settings.dbThreshold} onOpen={() => setOpenRoom(r)} />
        ))}
      </div>

      <UtilitiesPanel />

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
                { k: "Temp", v: `${live.tempC.toFixed(1)}°C`, warn: false },
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
