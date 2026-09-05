import { useEffect, useState } from "react";
import { STATE_META, type StudioState } from "../api/types";
import { pushDoorSleep, pushLedEspState, refreshDoorStatus, subscribeDoorStatus } from "../api/ledesp";
import { useStore } from "../state/store";

const LOOK: Record<string, { word: string; sub: string; color: string }> = {
  available: { word: "COME IN", sub: "The studio is free", color: STATE_META.available.color },
  class: { word: "CLASS", sub: "Lesson in progress", color: STATE_META.class.color },
  meeting: { word: "MEETING", sub: "Please wait", color: STATE_META.meeting.color },
  audio_rec: { word: "ON AIR", sub: "Recording — please do not enter", color: STATE_META.audio_rec.color },
  video_rec: { word: "FILMING", sub: "Cameras hot — please do not enter", color: STATE_META.video_rec.color },
  emergency: { word: "EMERGENCY", sub: "Do not enter", color: STATE_META.emergency.color },
  delivery: { word: "DELIVERY", sub: "Courier OTP at the door", color: "#2D72E6" },
  preflight: { word: "PREP", sub: "Silencing the room", color: "#0E7A88" },
  sos: { word: "SOS", sub: "Opens the family SOS page", color: "#7C3AED" },
  off: { word: "SLEEP", sub: "Door is dark · turn the dial to wake", color: "#3a3a42" },
};

/**
 * The couple: one sign, one light, same colour. Lives under the Command dial
 * so this page IS the door — nobody leaves to another link.
 */
export default function DoorCouple({
  state,
  onOpenDisplays,
}: {
  state: StudioState;
  onOpenDisplays: () => void;
}) {
  const { prepareStudio } = useStore();
  const [visual, setVisual] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeDoorStatus((next) => {
      if (!next.reachable) return;
      const vis =
        next.visual === "off" || next.visual === "sleep"
          ? "off"
          : next.visual && LOOK[next.visual] && !["ok", "wait", "onair"].includes(next.visual)
            ? next.visual
            : next.state;
      if (vis) setVisual(vis);
    });
    return unsub;
  }, []);

  // A dial turn should reflect on the couple promptly — one extra read, not a
  // faster poll.
  useEffect(() => {
    refreshDoorStatus();
  }, [state]);

  const key = visual && LOOK[visual] ? visual : state;
  const look = LOOK[key] ?? LOOK[state] ?? LOOK.available;

  return (
    <section className="mt-5 w-full">
      <div
        className="overflow-hidden rounded-3xl border border-white/10 px-5 pb-5 pt-8 text-center transition-colors duration-500"
        style={{ background: `radial-gradient(circle at 50% 0%, ${look.color}55, ${look.color}22 42%, #121214 100%)` }}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-white/55">The studio door</div>
        <div
          className="font-display mt-3 text-5xl leading-none lg:text-6xl"
          style={{ color: "#f4f2ef", textShadow: `0 0 40px ${look.color}` }}
        >
          {look.word}
        </div>
        <div className="mt-3 text-sm text-white/75">{look.sub}</div>
        <div className="mx-auto mt-7 flex max-w-sm justify-between px-2" aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <i
              key={i}
              className="block h-3 w-3 rounded-full"
              style={{ background: look.color, boxShadow: `0 0 10px ${look.color}` }}
            />
          ))}
        </div>
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.2em] text-white/45">light + screen · one door</p>
      </div>

      <button
        onClick={() => {
          void pushDoorSleep();
          setVisual("off");
        }}
        className="mt-3 w-full rounded-2xl border border-line bg-ink/80 px-4 py-3.5 text-sm font-semibold text-paper/90 transition-transform active:scale-[0.99]"
      >
        Door off · save power
      </button>
      <p className="mt-1.5 text-center font-mono text-[10px] uppercase tracking-[0.18em] text-dim">
        strip and screen go dark · Wi-Fi stays so the dial can wake them
      </p>

      <div className="mt-3 grid grid-cols-4 gap-2">
        {[
          { id: "delivery", label: "OTP", action: () => onOpenDisplays() },
          {
            id: "preflight",
            label: "Prep",
            action: () => {
              void prepareStudio();
              setVisual("preflight");
            },
          },
          { id: "sos", label: "SOS", action: () => { window.location.hash = "#/sos"; } },
          {
            id: "ok",
            label: "Clear",
            action: () => {
              void pushLedEspState(state, { force: true });
              setVisual(state);
            },
          },
        ].map((a) => {
          const color = LOOK[a.id]?.color ?? "#26262b";
          return (
            <button
              key={a.id}
              onClick={a.action}
              className="rounded-xl px-2 py-2.5 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
              style={{ background: color }}
            >
              {a.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
