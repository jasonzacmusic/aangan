import React from "react";
import { useStore } from "../state/store";
import { DATA_SOURCE } from "../api/api";
import { LIVE_BASE_URL } from "../config";
import { STATE_META, STATE_ORDER, SceneDef, StudioState } from "../api/types";

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 rounded-full border transition-colors ${on ? "border-gold bg-gold/30" : "border-line bg-surface2"}`}
      role="switch"
      aria-checked={on}
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
  const { settings, updateSettings } = useStore();

  const updateScene = (idx: number, patch: Partial<SceneDef>) => {
    const scenes = settings.scenes.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    updateSettings({ scenes });
  };

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
            <Toggle on={settings.notifyStateChanges} onChange={(v) => updateSettings({ notifyStateChanges: v })} />
          </Row>
          <Row label="Emergency" hint="Ring every phone — cannot be missed">
            <Toggle on={settings.notifyEmergency} onChange={(v) => updateSettings({ notifyEmergency: v })} />
          </Row>
          <Row label="Doorbell" hint="Snapshot to the family group on every ring">
            <Toggle on={settings.notifyDoorbell} onChange={(v) => updateSettings({ notifyDoorbell: v })} />
          </Row>
          <Row label="State chimes" hint="Each state answers with its own chord">
            <Toggle on={settings.chimes} onChange={(v) => updateSettings({ chimes: v })} />
          </Row>
        </div>
      </section>

      {/* Scene editor */}
      <section className="mt-4 rounded-2xl border border-line bg-surface/80 px-4 pb-4 backdrop-blur">
        <div className="border-b border-line py-3 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">Scenes</div>
        <div className="space-y-3 pt-3">
          {settings.scenes.map((sc, i) => (
            <div key={sc.id} className="rounded-xl border border-line bg-surface2 p-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{sc.icon}</span>
                <input
                  value={sc.label}
                  onChange={(e) => updateScene(i, { label: e.target.value })}
                  className="w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-gold/60"
                />
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {STATE_ORDER.filter((s) => s !== "emergency").map((s) => {
                  const m = STATE_META[s];
                  const active = sc.state === s;
                  return (
                    <button
                      key={s}
                      onClick={() => updateScene(i, { state: s as StudioState })}
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
        </div>
      </section>

      <p className="mt-6 pb-4 text-center font-mono text-[9px] leading-relaxed text-dim/60">
        Studio Command v1 · Nathaniel School of Music
        <br />
        flip USE_MOCK in src/config.ts when the Pi wrapper is live
      </p>
    </div>
  );
}
