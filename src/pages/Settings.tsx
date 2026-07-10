import React from "react";
import { useStore } from "../state/store";
import { DATA_SOURCE } from "../api/api";
import { LIVE_BASE_URL } from "../config";
import { STATE_META, STATE_ORDER, SceneDef, StudioState } from "../api/types";

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full border transition-colors ${on ? "border-gold bg-gold/30" : "border-line bg-surface2"}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
    >
      <span
        className={`absolute top-0.5 h-5.5 w-5.5 rounded-full transition-all ${on ? "left-6 bg-gold" : "left-0.5 bg-dim"}`}
        style={{ width: 22, height: 22 }}
      />
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint && <div className="mt-0.5 text-xs text-dim">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const { settings, updateSettings, notificationPermission, requestNotificationPermission } = useStore();

  const icons = ["🎬", "🎹", "🎙️", "🎧", "💡", "🌙", "☕", "🎸", "🎼", "🔴"];

  const updateScene = (idx: number, patch: Partial<SceneDef>) => {
    const scenes = settings.scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    updateSettings({ scenes });
  };

  const addScene = () => {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? `custom-${crypto.randomUUID()}` : `custom-${Date.now()}`;
    updateSettings({ scenes: [...settings.scenes, { id, label: "New house scene", state: "available", icon: "💡" }] });
  };

  const removeScene = (idx: number) => updateSettings({ scenes: settings.scenes.filter((_, i) => i !== idx) });

  return (
    <div className="rise-in mx-auto max-w-md px-5 lg:max-w-2xl">
      <h2 className="font-display mb-1 text-2xl lg:text-3xl">Settings</h2>
      <p className="mb-5 font-mono text-[11px] text-dim">
        data source: <span className="text-gold uppercase">{DATA_SOURCE}</span>
        {DATA_SOURCE === "live" ? ` · ${LIVE_BASE_URL}` : " · simulated house"}
      </p>

      {/* Recording threshold */}
      <section className="rounded-2xl border border-line bg-surface/80 px-4 py-2 backdrop-blur">
        <div className="py-3.5">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-medium">Recording quiet threshold</div>
            <div className="font-mono text-lg text-gold">{settings.dbThreshold} dB</div>
          </div>
          <div className="mt-1 text-xs text-dim">Pre-flight goes red when the music-room mic reads above this.</div>
          <input
            type="range"
            min={35}
            max={70}
            step={1}
            value={settings.dbThreshold}
            onChange={(e) => updateSettings({ dbThreshold: Number(e.target.value) })}
            className="mt-4 w-full accent-[#c9a84c]"
            aria-label="Recording quiet threshold in decibels"
            aria-valuetext={`${settings.dbThreshold} decibels`}
          />
          <div className="flex justify-between font-mono text-[9px] text-dim">
            <span>35 · studio silence</span>
            <span>70 · traffic loud</span>
          </div>
        </div>
      </section>

      {/* Family notifications */}
      <section className="mt-4 rounded-2xl border border-line bg-surface/80 px-4 backdrop-blur">
        <div className="border-b border-line py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Family notifications</div>
        <div className="divide-y divide-line">
          <Row label="State changes" hint="WhatsApp ping when the studio state flips">
            <Toggle label="State change notifications" on={settings.notifyStateChanges} onChange={(v) => updateSettings({ notifyStateChanges: v })} />
          </Row>
          <Row label="Emergency" hint="Ring every phone — cannot be missed">
            <Toggle label="Emergency notifications" on={settings.notifyEmergency} onChange={(v) => updateSettings({ notifyEmergency: v })} />
          </Row>
          <Row label="Doorbell" hint="Snapshot to the family group on every ring">
            <Toggle label="Doorbell notifications" on={settings.notifyDoorbell} onChange={(v) => updateSettings({ notifyDoorbell: v })} />
          </Row>
          <Row label="State chimes" hint="Each state answers with its own chord">
            <Toggle label="State chimes" on={settings.chimes} onChange={(v) => updateSettings({ chimes: v })} />
          </Row>
          <Row label="Emergency siren loop" hint="Repeats until stand-down, even when state chimes are muted">
            <Toggle label="Emergency siren loop" on={settings.emergencySiren} onChange={(v) => updateSettings({ emergencySiren: v })} />
          </Row>
          <Row label="Device safety alerts" hint={notificationPermission === "granted" ? "Gas and leak alerts can appear outside the app" : notificationPermission === "denied" ? "Blocked in this browser's settings" : notificationPermission === "unsupported" ? "Not supported by this browser" : "Allow urgent gas and leak notifications"}>
            <button
              onClick={requestNotificationPermission}
              disabled={notificationPermission === "granted" || notificationPermission === "unsupported"}
              className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider ${notificationPermission === "granted" ? "border-st-available/30 bg-st-available/10 text-st-available" : "border-gold/40 text-gold disabled:opacity-60"}`}
            >
              {notificationPermission === "granted" ? "Enabled" : "Enable"}
            </button>
          </Row>
        </div>
      </section>

      {/* Scene editor */}
      <section className="mt-4 rounded-2xl border border-line bg-surface/80 px-4 pb-4 backdrop-blur">
        <div className="flex items-center justify-between border-b border-line py-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Scenes</span>
          <button onClick={addScene} className="rounded-full border border-gold/35 bg-gold/5 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-gold">+ Add scene</button>
        </div>
        <div className="space-y-3 pt-3">
          {settings.scenes.map((sc, i) => (
            <div key={sc.id} className="rounded-xl border border-line bg-surface2 p-3">
              <div className="flex items-center gap-2">
                <select
                  value={sc.icon}
                  onChange={(e) => updateScene(i, { icon: e.target.value })}
                  aria-label={`Icon for ${sc.label}`}
                  className="h-10 w-12 rounded-lg border border-line bg-ink px-1 text-center text-lg outline-none focus:border-gold/60"
                >
                  {icons.map((icon) => <option key={icon} value={icon}>{icon}</option>)}
                </select>
                <input
                  value={sc.label}
                  onChange={(e) => updateScene(i, { label: e.target.value })}
                  aria-label={`Scene name for ${sc.label}`}
                  className="min-w-0 flex-1 rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-gold/60"
                />
                <button onClick={() => removeScene(i)} className="h-10 rounded-lg border border-line px-3 text-xs text-dim hover:text-st-audio" aria-label={`Remove ${sc.label}`}>Remove</button>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STATE_ORDER.filter((s) => s !== "emergency").map((s) => {
                  const m = STATE_META[s];
                  const active = sc.state === s;
                  return (
                    <button
                      key={s}
                      onClick={() => updateScene(i, { state: s as StudioState })}
                      aria-label={`Set ${sc.label} to ${m.label}`}
                      className="rounded-full border px-2.5 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors"
                      style={{
                        borderColor: active ? m.color : "#2a2a33",
                        color: active ? m.color : "#8b8b96",
                        background: active ? `${m.color}1a` : "transparent",
                      }}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {settings.scenes.length === 0 && <div className="rounded-xl border border-dashed border-line p-5 text-center text-xs text-dim">No quick scenes yet. Add one to the Command page.</div>}
        </div>
      </section>

      <p className="mt-6 pb-4 text-center font-mono text-[9px] leading-relaxed text-dim/60">
        Studio Command · House + Studio · Nathaniel School of Music
        <br />
        flip USE_MOCK in src/config.ts when the Pi wrapper is live
      </p>
    </div>
  );
}
