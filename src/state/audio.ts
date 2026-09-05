import type { StudioState } from "../api/types";

/**
 * The house speaks music.
 *
 * Every studio state has its own signature chord — committing a state
 * plays it softly, like the room answering you. A musician's home
 * shouldn't beep; it should resolve.
 */
let ctx: AudioContext | null = null;
let chimeStop: (() => void) | null = null;
let toneStop: (() => void) | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Signature voicings (Hz). Gentle, low, felt more than heard. */
const CHORDS: Record<StudioState, number[]> = {
  available: [261.63, 329.63, 392.0, 523.25], // C major — home
  class: [293.66, 369.99, 440.0, 587.33], // D major — bright, pedagogical
  meeting: [233.08, 293.66, 349.23, 440.0], // Bb maj7 — polite jazz
  audio_rec: [130.81, 196.0], // bare low fifth — focus
  video_rec: [130.81, 196.0, 261.63], // fifth + octave — action
  emergency: [246.94, 349.23], // tritone — alarm, but musical
};

export function playStateChime(state: StudioState, enabled: boolean) {
  if (!enabled) return;
  const a = ac();
  if (!a) return;
  chimeStop?.();
  const now = a.currentTime;
  const master = a.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.14, now + 0.04);
  master.gain.exponentialRampToValueAtTime(0.0001, now + (state === "emergency" ? 0.5 : 1.4));
  master.connect(a.destination);

  const oscillators: OscillatorNode[] = [];
  CHORDS[state].forEach((f, i) => {
    const osc = a.createOscillator();
    const g = a.createGain();
    osc.type = state === "emergency" ? "square" : "triangle";
    osc.frequency.value = f;
    g.gain.value = 1 / (i + 1.5);
    osc.connect(g).connect(master);
    const start = now + i * (state === "emergency" ? 0 : 0.035); // soft roll, like an arpeggio
    osc.start(start);
    osc.stop(now + 1.6);
    oscillators.push(osc);
  });

  if (state === "emergency") {
    // Two urgent pulses.
    const g2 = a.createGain();
    g2.gain.setValueAtTime(0.0001, now + 0.3);
    g2.gain.exponentialRampToValueAtTime(0.12, now + 0.34);
    g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    g2.connect(a.destination);
    CHORDS.emergency.forEach((f) => {
      const o = a.createOscillator();
      o.type = "square";
      o.frequency.value = f * 2;
      o.connect(g2);
      o.start(now + 0.3);
      o.stop(now + 0.75);
      oscillators.push(o);
    });
  }

  chimeStop = () => {
    const t = a.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    } catch {
      /* already stopped */
    }
    oscillators.forEach((osc) => {
      try {
        osc.stop(t + 0.05);
      } catch {
        /* already stopped */
      }
    });
    chimeStop = null;
  };
}

/** Rotary detent tick — a tiny woodblock as the dial crosses a state. */
export function playTick(enabled: boolean) {
  if (!enabled) return;
  const a = ac();
  if (!a) return;
  const now = a.currentTime;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1400, now);
  osc.frequency.exponentialRampToValueAtTime(600, now + 0.03);
  g.gain.setValueAtTime(0.05, now);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
  osc.connect(g).connect(a.destination);
  osc.start(now);
  osc.stop(now + 0.06);
}

export function haptic(pattern: number | number[] = 8) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* not supported */
  }
}

/** Clean concert A (or another requested reference) with a gentle fade. */
export function playReferenceTone(hz = 440, seconds = 1.8) {
  const a = ac();
  if (!a) return;
  toneStop?.();
  const now = a.currentTime;
  const osc = a.createOscillator();
  const overtone = a.createOscillator();
  const master = a.createGain();
  const overtoneGain = a.createGain();
  osc.type = "sine";
  osc.frequency.value = hz;
  overtone.type = "sine";
  overtone.frequency.value = hz * 2;
  overtoneGain.gain.value = 0.06;
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.12, now + 0.08);
  master.gain.setValueAtTime(0.12, now + Math.max(0.1, seconds - 0.35));
  master.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  osc.connect(master);
  overtone.connect(overtoneGain).connect(master);
  master.connect(a.destination);
  osc.start(now);
  overtone.start(now);
  osc.stop(now + seconds + 0.05);
  overtone.stop(now + seconds + 0.05);
  toneStop = () => {
    const t = a.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
      master.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    } catch {
      /* already stopped */
    }
    [osc, overtone].forEach((node) => {
      try {
        node.stop(t + 0.05);
      } catch {
        /* already stopped */
      }
    });
    toneStop = null;
  };
}

/**
 * Optional emergency loop. It deliberately starts after the transition chord,
 * so an emergency has one musical acknowledgement before the repeating siren.
 */
export function startEmergencySiren(enabled: boolean): () => void {
  if (!enabled) return () => {};
  let stopped = false;
  let interval: ReturnType<typeof setInterval> | null = null;
  let first: ReturnType<typeof setTimeout> | null = null;

  const pulse = () => {
    if (stopped) return;
    // The siren setting intentionally overrides the general chime mute.
    playStateChime("emergency", true);
  };
  first = setTimeout(() => {
    pulse();
    interval = setInterval(pulse, 2800);
  }, 1700);

  return () => {
    stopped = true;
    if (first) clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
