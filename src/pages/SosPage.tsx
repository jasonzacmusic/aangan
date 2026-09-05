import React, { useState } from "react";
import { SOS_MESSAGES, SOS_PEOPLE } from "../api/types";
import HoldButton from "../components/HoldButton";
import { AlertIcon } from "../components/icons";
import { useStore } from "../state/store";
import { timeSince } from "../state/store";

/**
 * The family SOS page at /#/sos — designed to live as a home-screen bookmark
 * on Amma's (and everyone's) phone. One tap opens it, one hold raises the
 * whole house: every phone rings, all signs flash violet, every wall panel
 * shows who needs help.
 */
export default function SosPage() {
  const { sos, triggerSos, clearSos, setStudioState } = useStore();
  const [who, setWho] = useState(SOS_PEOPLE[0]);
  const [message, setMessage] = useState(SOS_MESSAGES[0]);
  const [raising, setRaising] = useState(false);

  const raise = async () => {
    if (raising) return;
    setRaising(true);
    await triggerSos(who, message);
    setRaising(false);
  };

  const standDown = async () => {
    const ok = await setStudioState("available");
    if (ok !== false) await clearSos();
  };

  if (sos?.active) {
    return (
      <div className="rise-in mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="emergency-flash flex h-20 w-20 items-center justify-center rounded-full border-2 border-st-emergency bg-st-emergency/20 text-st-emergency">
          <AlertIcon size={38} />
        </div>
        <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.4em] text-st-emergency">SOS is live</div>
        <h1 className="font-display mt-3 text-3xl leading-tight text-st-emergency sm:text-4xl">{sos.who} needs help</h1>
        {sos.message && <p className="mt-3 text-lg text-paper">“{sos.message}”</p>}
        <p className="mt-4 font-mono text-[11px] text-dim">
          raised {timeSince(sos.since) === "just now" ? "just now" : `${timeSince(sos.since)} ago`} · every family phone is ringing · all wall panels are showing this
        </p>
        <HoldButton big label="Hold — I'm OK, stand the house down" color="#2fbf71" durationMs={1600} onComplete={() => void standDown()} />
        <p className="mt-3 font-mono text-[10px] text-dim">Only press this when the person is actually safe.</p>
      </div>
    );
  }

  return (
    <div className="rise-in mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <div className="text-center">
        <img src="/nsm-white.png" alt="Nathaniel School of Music" className="mx-auto h-6 w-auto opacity-80" />
        <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.4em] text-st-emergency">Family SOS</div>
        <h1 className="font-display mt-2 text-3xl leading-tight">Need help?</h1>
        <p className="mt-1 font-display text-2xl text-paper/80">Hold the button.</p>
        <p className="mt-2 text-sm text-dim">
          Every phone in the family rings through silent mode, all room signs flash, and every wall screen shows who needs help — even mid-recording.
        </p>
      </div>

      <div className="mt-8">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-dim">Who is this</div>
        <div className="grid grid-cols-2 gap-2">
          {SOS_PEOPLE.map((p) => (
            <button
              key={p}
              onClick={() => setWho(p)}
              className={`rounded-2xl border px-4 py-4 text-lg font-semibold transition-colors ${
                who === p ? "border-st-emergency/60 bg-st-emergency/15 text-st-emergency" : "border-line bg-surface/70 text-paper"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-dim">What should everyone know</div>
        <div className="flex flex-wrap gap-2">
          {SOS_MESSAGES.map((m) => (
            <button
              key={m}
              onClick={() => setMessage(m)}
              className={`rounded-full border px-3.5 py-2 text-[13px] transition-colors ${
                message === m ? "border-st-emergency/60 bg-st-emergency/15 text-st-emergency" : "border-line text-dim"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8">
        <HoldButton big label={raising ? "Raising the house…" : "Hold for SOS"} color="#7c3aed" durationMs={1200} onComplete={() => void raise()} />
      </div>
      <p className="mt-4 text-center font-mono text-[10px] leading-relaxed text-dim">
        Add this page to your phone's home screen so it is always one tap away. Holding for just over a second prevents pocket presses.
      </p>
    </div>
  );
}
