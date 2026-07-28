import React, { useState } from "react";
import { DISPLAY_CONTENT_META, DEFAULT_DISPLAYS, DisplayContent } from "../api/types";
import { useStore } from "../state/store";

const COURIERS = ["Swiggy", "Instamart", "Blinkit", "Zepto", "Zomato", "Amazon", "BigBasket", "Porter"];
const NOTES = [
  "Leave it at the door",
  "Take the OTP — no need to ring",
  "Please don't ring the bell — class in session",
  "Ring once and wait — coming out",
  "Hand it to whoever opens the door",
  "Leave it with building security",
];
const DURATIONS = [10, 20, 30, 60];

const CONTENT_ORDER: DisplayContent[] = ["door", "state", "house", "doorbell", "message", "clock"];

/** Displays page — per-panel content assignment + the delivery OTP hand-off. */
export default function Displays() {
  const { displays, delivery, settings, updateSettings, updateDisplay, addDisplay, removeDisplay, postDelivery, clearDelivery } = useStore();

  const [courier, setCourier] = useState("Swiggy");
  const [customCourier, setCustomCourier] = useState("");
  const [otp, setOtp] = useState("");
  const [note, setNote] = useState(NOTES[0]);
  const [minutes, setMinutes] = useState(20);
  const [targetId, setTargetId] = useState("front-house");
  const [newName, setNewName] = useState("");
  const [sending, setSending] = useState(false);

  const effectiveCourier = courier === "Other" ? customCourier : courier;
  const canSend = otp.trim().length >= 3 && effectiveCourier.trim().length > 0 && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    const directions = settings.deliveryDirections.trim();
    const fullNote = directions ? `${note} · ${directions}` : note;
    await postDelivery({ courier: effectiveCourier, otp: otp.trim(), note: fullNote, displayId: targetId, minutes });
    setOtp("");
    setSending(false);
  };

  const minsLeft = delivery ? Math.max(0, Math.ceil((delivery.expiresAt - Date.now()) / 60000)) : 0;

  return (
    <div className="rise-in mx-auto max-w-md px-5 lg:max-w-3xl">
      <h2 className="font-display mb-1 text-2xl lg:text-3xl">Displays</h2>
      <p className="mb-5 font-mono text-[11px] text-dim">every screen shows exactly what you assign</p>

      {/* ── Delivery OTP hand-off ─────────────────────────────── */}
      <section className="rounded-3xl border border-gold/30 bg-gold/5 p-5">
        <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-gold">Delivery at the door</div>
        <h3 className="mt-1 font-display text-xl">Put the OTP on the door display</h3>
        <p className="mt-1 text-xs text-dim">
          Swiggy or Amazon at the gate mid-take? Send the code to the door screen — the delivery partner reads it there and nobody has to open the door.
        </p>

        {delivery?.active ? (
          <div className="mt-4 rounded-2xl border border-gold/40 bg-ink/60 p-4 text-center">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-gold">{delivery.courier} · live on {displays.find((d) => d.id === delivery.displayId)?.name ?? "door display"}</div>
            <div className="font-display mt-2 text-4xl tracking-[0.2em] text-gold">{delivery.otp}</div>
            {delivery.note && <div className="mt-2 text-sm text-paper">{delivery.note}</div>}
            <div className="mt-2 font-mono text-[10px] text-dim">clears itself in {minsLeft} min</div>
            <button
              onClick={() => void clearDelivery()}
              className="mt-4 w-full rounded-xl border border-line px-4 py-3 text-sm text-dim transition-all active:scale-[0.99]"
            >
              Done — take it off the display
            </button>
          </div>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {[...COURIERS, "Other"].map((c) => (
                <button
                  key={c}
                  onClick={() => setCourier(c)}
                  className={`rounded-full border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                    courier === c ? "border-gold/60 bg-gold/15 text-gold" : "border-line text-dim"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {courier === "Other" && (
              <input
                value={customCourier}
                onChange={(e) => setCustomCourier(e.target.value)}
                placeholder="Courier name"
                className="mt-3 w-full rounded-xl border border-line bg-ink/60 px-4 py-3 text-sm text-paper placeholder:text-dim/60 focus:border-gold/50 focus:outline-none"
              />
            )}

            <input
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/[^0-9a-zA-Z]/g, ""))}
              inputMode="numeric"
              placeholder="OTP · e.g. 4829"
              aria-label="Delivery OTP"
              className="font-display mt-3 w-full rounded-xl border border-line bg-ink/60 px-4 py-4 text-center text-3xl tracking-[0.3em] text-gold placeholder:text-lg placeholder:tracking-normal placeholder:text-dim/50 focus:border-gold/50 focus:outline-none"
            />

            <div className="mt-3 flex flex-wrap gap-2">
              {NOTES.map((n) => (
                <button
                  key={n}
                  onClick={() => setNote(n)}
                  className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${note === n ? "border-gold/60 bg-gold/15 text-gold" : "border-line text-dim"}`}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="mt-3">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-dim">Standing directions · shown under every hand-off</div>
              <input
                value={settings.deliveryDirections}
                onChange={(e) => updateSettings({ deliveryDirections: e.target.value })}
                placeholder="e.g. Blue gate · lift to 2nd floor · door on the right"
                className="w-full rounded-xl border border-line bg-ink/60 px-4 py-3 text-sm text-paper placeholder:text-dim/60 focus:border-gold/50 focus:outline-none"
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-dim">Show on</div>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-paper focus:border-gold/50 focus:outline-none"
                >
                  {displays.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-dim">For</div>
                <select
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="w-full rounded-xl border border-line bg-ink/60 px-3 py-2.5 text-sm text-paper focus:border-gold/50 focus:outline-none"
                >
                  {DURATIONS.map((m) => (
                    <option key={m} value={m}>{m} minutes</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={() => void send()}
              disabled={!canSend}
              className="mt-4 w-full rounded-xl border border-gold/50 bg-gold/15 px-4 py-3.5 text-sm font-semibold text-gold transition-all active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Send to the door display
            </button>
          </>
        )}
      </section>

      {/* ── Per-display assignment ────────────────────────────── */}
      <section className="mt-6 space-y-4">
        {displays.map((d) => {
          const takenOver = delivery?.active && delivery.displayId === d.id;
          return (
            <div key={d.id} className="rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-display text-lg">{d.name}</div>
                  <div className="font-mono text-[9px] uppercase tracking-widest text-dim">
                    {takenOver ? "· delivery hand-off is live here ·" : `showing · ${DISPLAY_CONTENT_META[d.content].label}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={`#/display/${d.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-lg border border-line px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-dim transition-colors hover:text-gold"
                  >
                    Open panel
                  </a>
                  {!DEFAULT_DISPLAYS.some((x) => x.id === d.id) && (
                    <button
                      onClick={() => void removeDisplay(d.id)}
                      aria-label={`Remove ${d.name}`}
                      className="rounded-lg border border-line px-2.5 py-2 text-xs text-dim hover:text-st-audio"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2">
                {CONTENT_ORDER.map((c) => (
                  <button
                    key={c}
                    onClick={() => void updateDisplay(d.id, { content: c })}
                    className={`rounded-xl border px-2 py-2.5 text-center transition-colors ${
                      d.content === c ? "border-gold/50 bg-gold/10 text-gold" : "border-line text-dim"
                    }`}
                  >
                    <div className="font-mono text-[9px] uppercase tracking-wider">{DISPLAY_CONTENT_META[c].label}</div>
                  </button>
                ))}
              </div>
              <p className="mt-2 font-mono text-[9px] text-dim/80">{DISPLAY_CONTENT_META[d.content].hint}</p>

              {d.content === "message" && (
                <input
                  value={d.message}
                  onChange={(e) => void updateDisplay(d.id, { message: e.target.value })}
                  placeholder="Type the message this screen should show…"
                  className="mt-3 w-full rounded-xl border border-line bg-ink/60 px-4 py-3 text-sm text-paper placeholder:text-dim/60 focus:border-gold/50 focus:outline-none"
                />
              )}
            </div>
          );
        })}

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name a new display (e.g. Kitchen panel)"
            className="flex-1 rounded-xl border border-line bg-ink/60 px-4 py-3 text-sm text-paper placeholder:text-dim/60 focus:border-gold/50 focus:outline-none"
          />
          <button
            onClick={() => {
              if (!newName.trim()) return;
              void addDisplay(newName.trim());
              setNewName("");
            }}
            className="rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-sm font-semibold text-gold transition-all active:scale-[0.98]"
          >
            Add
          </button>
        </div>
        <p className="font-mono text-[9px] leading-relaxed text-dim/70">
          Any tablet or screen becomes a panel: open Studio Command on it, tap “Open panel”, and add it to the home screen. Each panel keeps its own assignment.
        </p>
      </section>
    </div>
  );
}
