import React, { useEffect, useRef, useState } from "react";
import { STATE_META, StudioState } from "../api/types";
import { haptic } from "../state/audio";

/**
 * Persistent voice conductor. Tap, speak — "set studio to recording",
 * "class mode", "emergency". Recording & emergency still route through
 * the hold-to-confirm sheet for safety.
 */
interface Props {
  onCommand: (s: StudioState) => void;
}

function parseCommand(text: string): StudioState | null {
  const t = text.toLowerCase();
  if (/\b(emergency|panic|studio sos)\b/.test(t)) return "emergency";
  if (/\b(video rec|video recording|youtube|filming|cameras? hot)\b/.test(t)) return "video_rec";
  if (/\b(audio rec|audio recording|tape is rolling|start (audio )?record)\b/.test(t)) return "audio_rec";
  if (/\b(class mode|start class|lesson|teach)\b/.test(t) || /\bclass\b/.test(t)) return "class";
  if (/\b(meeting|on a call|zoom)\b/.test(t)) return "meeting";
  if (/\b(available|wind down|studio (is )?free|open the house)\b/.test(t)) return "available";
  return null;
}

export default function VoiceButton({ onCommand }: Props) {
  const [listening, setListening] = useState(false);
  const [toast, setToast] = useState<{ heard: string; result: string; color: string } | null>(null);
  const recRef = useRef<any>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (heard: string, result: string, color: string) => {
    setToast({ heard, result, color });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  const start = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      showToast("", "Voice isn't available here — the dial still works", "#8b8b96");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = new SR();
    recRef.current = rec;
    rec.lang = "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onstart = () => {
      setListening(true);
      haptic(10);
    };
    rec.onend = () => setListening(false);
    rec.onerror = (event: { error?: string }) => {
      setListening(false);
      showToast("", event.error === "not-allowed" ? "Microphone permission is off — use the dial" : "Didn't catch that — try “start class”", "#8b8b96");
    };
    rec.onresult = (e: any) => {
      const heard = e.results[0][0].transcript as string;
      const state = parseCommand(heard);
      if (state) {
        const m = STATE_META[state];
        showToast(`“${heard}”`, `→ ${m.label}`, m.color);
        onCommand(state);
      } else {
        showToast(`“${heard}”`, "No matching state — try “class mode”", "#8b8b96");
      }
    };
    rec.start();
  };

  useEffect(
    () => () => {
      recRef.current?.stop?.();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    []
  );

  return (
    <>
      {toast && (
        <div className="rise-in fixed bottom-36 left-1/2 z-30 w-[85%] max-w-sm -translate-x-1/2 rounded-2xl border border-line bg-surface/95 px-4 py-3 text-center backdrop-blur lg:bottom-24" role="status" aria-live="polite">
          {toast.heard && <div className="text-xs text-dim">{toast.heard}</div>}
          <div className="text-sm font-medium" style={{ color: toast.color }}>
            {toast.result}
          </div>
        </div>
      )}
      <button
        aria-label="Voice command"
        onClick={start}
        className={`fixed bottom-24 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full border shadow-2xl shadow-black/60 transition-all active:scale-95 lg:bottom-6 lg:right-6 ${
          listening ? "listening border-gold bg-gold text-ink" : "border-gold/50 bg-surface/90 text-gold backdrop-blur"
        }`}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
      </button>
    </>
  );
}
