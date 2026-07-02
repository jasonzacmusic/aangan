import React from "react";
import { Room } from "../api/types";
import DbMeter from "./DbMeter";

interface Props {
  room: Room;
  threshold: number;
  onOpen: () => void;
}

function DoorGlyph({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 21h16" />
      {open ? (
        <>
          <path d="M6 21V4l8 2v15" style={{ transition: "all .3s" }} />
          <circle cx="11.5" cy="13" r="0.6" fill="currentColor" />
        </>
      ) : (
        <>
          <rect x="7" y="4" width="10" height="17" rx="1" />
          <circle cx="14.5" cy="13" r="0.6" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

export default function RoomCard({ room, threshold, onOpen }: Props) {
  return (
    <button
      onClick={onOpen}
      className="w-full rounded-2xl border border-line bg-surface/80 p-4 text-left backdrop-blur transition-transform active:scale-[0.99]"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {/* Live WS2812B sign color */}
          <span className="pulse-dot h-2.5 w-2.5 rounded-full" style={{ background: room.signColor, boxShadow: `0 0 10px ${room.signColor}` }} />
          <span className="font-display text-lg">{room.name}</span>
        </div>
        <span className="font-mono text-xs text-dim">{room.tempC.toFixed(1)}°C</span>
      </div>

      <div className="mt-3 flex items-center gap-4 font-mono text-[11px]">
        <span className={`flex items-center gap-1.5 ${room.doorOpen ? "text-st-meeting" : "text-dim"}`}>
          <DoorGlyph open={room.doorOpen} />
          {room.doorOpen ? "DOOR OPEN" : "closed"}
        </span>
        <span className={`flex items-center gap-1.5 ${room.presence ? "text-st-available" : "text-dim"}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
            <circle cx="12" cy="7.5" r="3" />
            <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
          </svg>
          {room.presence ? "PRESENT" : "empty"}
        </span>
      </div>

      {room.dbLevel != null && (
        <div className="mt-3">
          <DbMeter value={room.dbLevel} threshold={threshold} compact />
        </div>
      )}
    </button>
  );
}
