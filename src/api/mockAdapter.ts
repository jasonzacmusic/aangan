import {
  ActivityEvent,
  ApiAdapter,
  Doorbell,
  Preflight,
  PreflightPrep,
  Room,
  Safety,
  SafetyAlertKind,
  STATE_META,
  StreamEvent,
  StudioState,
  StudioStateInfo,
  Utilities,
  UtilityAction,
} from "./types";
import { idbGet, idbSet } from "../state/idb";

/** A living simulation of the Pi + Home Assistant wrapper. */

const MOCK_STATE_KEY = "mock-studio-state";

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function doorbellSvg(ts: number): string {
  const hue = 200 + ((ts / 60000) % 40);
  const t = new Date(ts);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="hsl(${hue} 25% 16%)"/><stop offset="1" stop-color="hsl(${hue} 20% 8%)"/></linearGradient></defs>
    <rect width="640" height="360" fill="url(#sky)"/><rect x="60" y="90" width="220" height="270" rx="6" fill="hsl(${hue} 12% 22%)"/>
    <rect x="90" y="130" width="70" height="90" rx="4" fill="hsl(${hue} 30% 30%)"/><rect x="185" y="130" width="70" height="90" rx="4" fill="hsl(${hue} 30% 27%)"/>
    <rect x="330" y="150" width="130" height="210" rx="8" fill="hsl(${hue} 10% 26%)"/><circle cx="440" cy="255" r="7" fill="#C9A84C"/>
    <rect x="0" y="330" width="640" height="30" fill="hsl(${hue} 10% 12%)"/>
    <text x="616" y="34" text-anchor="end" font-family="monospace" font-size="22" fill="#e8e6df" opacity="0.9">CAM 01 · ${hh}:${mm}</text>
    <text x="24" y="34" font-family="monospace" font-size="22" fill="#e8e6df" opacity="0.6">ENTRANCE</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export class MockAdapter implements ApiAdapter {
  private state: StudioStateInfo = {
    state: "available",
    setBy: "Jason Zac",
    since: Date.now() - 42 * 60 * 1000,
  };

  private rooms: Room[] = [
    { id: "entrance", name: "Entrance", doorOpen: false, presence: false, tempC: 25.4, signColor: STATE_META.available.color },
    { id: "music", name: "Music Room", doorOpen: false, presence: true, tempC: 24.1, signColor: STATE_META.available.color, dbLevel: 41 },
    { id: "bedroom", name: "Bedroom", doorOpen: false, presence: false, tempC: 24.8, signColor: STATE_META.available.color },
    { id: "kitchen", name: "Kitchen", doorOpen: false, presence: true, tempC: 26.2, signColor: STATE_META.available.color },
    { id: "bathroom", name: "Bathroom", doorOpen: false, presence: false, tempC: 25.0, signColor: STATE_META.available.color },
  ];

  private safety: Safety = { gas: false, leakKitchen: false, leakBath: false };
  private doorbell: Doorbell = { snapshotUrl: doorbellSvg(Date.now() - 3 * 60 * 1000), ts: Date.now() - 3 * 60 * 1000 };
  private prep: PreflightPrep = { active: false, status: "idle", mutedDoorbell: false, acOff: false, fanOff: false };
  private utilities: Utilities = {
    water: { sumpPct: 74, overheadPct: 61, pumpRunning: false, dryRunProtected: true, lastFillTs: Date.now() - 7 * 60 * 60 * 1000 },
    power: { mainsOnline: true, voltage: 231, inverterPct: 86, estimatedMinutes: 128, surgeProtected: true },
    lpg: { remainingPct: 38, estimatedDays: 12 },
    air: { aqi: 62, pm25: 21, tempC: 24.3, humidityPct: 58, purifierOn: false },
  };
  private history: ActivityEvent[] = [
    { id: "welcome", type: "system", title: "House online", detail: "All five zones checked in", ts: Date.now() - 44 * 60 * 1000, severity: "success" },
    { id: "doorbell-seen", type: "doorbell", title: "Entrance doorbell", detail: "Snapshot captured · chime delivered", ts: this.doorbell.ts, severity: "info" },
  ];
  private dbThreshold = 45;
  private listeners = new Set<(ev: StreamEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private safetyReset: ReturnType<typeof setTimeout> | null = null;
  private powerReset: ReturnType<typeof setTimeout> | null = null;
  private hydration: Promise<void> | null = null;
  private quietMode = false;
  private tick = 0;
  private eventSeq = 0;

  private emit(ev: StreamEvent) {
    this.listeners.forEach((cb) => cb(ev));
  }

  private cloneUtilities(): Utilities {
    return {
      water: { ...this.utilities.water },
      power: { ...this.utilities.power },
      lpg: { ...this.utilities.lpg },
      air: { ...this.utilities.air },
    };
  }

  private clonePrep(): PreflightPrep {
    return { ...this.prep };
  }

  private addHistory(event: Omit<ActivityEvent, "id" | "ts"> & { ts?: number }) {
    const next: ActivityEvent = {
      ...event,
      id: `mock-${Date.now()}-${this.eventSeq++}`,
      ts: event.ts ?? Date.now(),
    };
    this.history = [next, ...this.history].slice(0, 40);
    this.emit({ type: "history", event: next });
  }

  private async hydrateState() {
    if (!this.hydration) {
      this.hydration = (async () => {
        const saved = await idbGet<StudioStateInfo>(MOCK_STATE_KEY);
        if (saved && saved.state in STATE_META && Number.isFinite(saved.since)) this.state = saved;
        const color = STATE_META[this.state.state].color;
        this.rooms.forEach((room) => (room.signColor = color));
      })();
    }
    await this.hydration;
  }

  private musicBase(): number {
    if (this.quietMode) return 33;
    const music = this.rooms.find((r) => r.id === "music")!;
    if (this.state.state === "audio_rec" || this.state.state === "video_rec") return 36;
    if (this.state.state === "class") return 54;
    return music.presence ? 48 : 34;
  }

  private getPreflightSync(): Preflight {
    const openDoors = this.rooms.filter((r) => r.doorOpen).map((r) => r.id);
    const dbLevel = this.rooms.find((r) => r.id === "music")!.dbLevel ?? 0;
    const doorsClosed = openDoors.length === 0;
    const quietEnough = dbLevel < this.dbThreshold;
    return { doorsClosed, quietEnough, ready: doorsClosed && quietEnough, openDoors, dbLevel, dbThreshold: this.dbThreshold };
  }

  private emitPreflight() {
    this.emit({ type: "preflight", preflight: this.getPreflightSync(), prep: this.clonePrep() });
  }

  private setSafety(kind: SafetyAlertKind, source: string) {
    const next: Safety = { gas: false, leakKitchen: false, leakBath: false };
    if (kind !== "clear") next[kind] = true;
    this.safety = next;
    this.emit({ type: "safety", safety: { ...this.safety } });
    if (kind === "clear") {
      this.addHistory({ type: "safety", title: "Safety clear", detail: `${source} reset · all sensors normal`, severity: "success" });
    } else {
      const details: Record<Exclude<SafetyAlertKind, "clear">, string> = {
        gas: "Kitchen gas sensor crossed its alert threshold",
        leakKitchen: "Kitchen floor sensor detected water",
        leakBath: "Bathroom floor sensor detected water",
      };
      this.addHistory({ type: "safety", title: "Safety alert", detail: details[kind], severity: "critical" });
    }
    if (this.safetyReset) clearTimeout(this.safetyReset);
    if (kind !== "clear") this.safetyReset = setTimeout(() => this.setSafety("clear", "Sensor"), 14_000);
    return { ...this.safety };
  }

  private setPowerOutage(active: boolean) {
    this.utilities.power.mainsOnline = !active;
    this.utilities.power.voltage = active ? 0 : 230;
    this.emit({ type: "utilities", utilities: this.cloneUtilities() });
    this.addHistory({
      type: "utility",
      title: active ? "Mains power lost" : "Mains power restored",
      detail: active ? `Studio on inverter · ${this.utilities.power.estimatedMinutes} min estimated` : "Voltage stable · studio protection normal",
      severity: active ? "warning" : "success",
    });
  }

  private step() {
    this.tick++;
    const music = this.rooms.find((r) => r.id === "music")!;
    const swell = Math.sin(this.tick / 6) * 5 + Math.sin(this.tick / 2.3) * 2;
    const jitter = (Math.random() - 0.5) * 4;
    music.dbLevel = Math.max(30, Math.min(92, Math.round((this.musicBase() + swell + jitter) * 10) / 10));

    this.rooms.forEach((r) => {
      r.tempC = Math.round((r.tempC + (Math.random() - 0.5) * 0.06) * 10) / 10;
    });
    if (Math.random() < 0.02) {
      const candidates = this.rooms.filter((r) => r.id !== "music");
      const room = candidates[Math.floor(Math.random() * candidates.length)];
      room.doorOpen = !room.doorOpen;
    }
    if (Math.random() < 0.03) {
      const room = this.rooms[Math.floor(Math.random() * this.rooms.length)];
      room.presence = !room.presence;
    }

    if (this.tick % 180 === 0) {
      this.doorbell = { snapshotUrl: doorbellSvg(Date.now()), ts: Date.now() };
      this.emit({ type: "doorbell", doorbell: { ...this.doorbell } });
      this.addHistory({ type: "doorbell", title: "Entrance doorbell", detail: "New snapshot captured", severity: "info" });
    }

    if (this.tick > 12 && !Object.values(this.safety).some(Boolean) && Math.random() < 0.0007) {
      const kinds: Exclude<SafetyAlertKind, "clear">[] = ["gas", "leakKitchen", "leakBath"];
      this.setSafety(kinds[Math.floor(Math.random() * kinds.length)], "Sensor");
    }
    if (this.utilities.power.mainsOnline && Math.random() < 0.00045) {
      this.setPowerOutage(true);
      if (this.powerReset) clearTimeout(this.powerReset);
      this.powerReset = setTimeout(() => this.setPowerOutage(false), 18_000);
    }

    if (this.tick % 5 === 0) {
      const u = this.utilities;
      if (u.water.pumpRunning) {
        u.water.overheadPct = Math.min(100, u.water.overheadPct + 1.2);
        u.water.sumpPct = Math.max(0, u.water.sumpPct - 0.45);
        if (u.water.overheadPct >= 96 || u.water.sumpPct <= 10) {
          u.water.pumpRunning = false;
          u.water.lastFillTs = Date.now();
          this.addHistory({ type: "utility", title: "Water fill complete", detail: "Pump stopped automatically · dry-run guard active", severity: "success" });
        }
      } else {
        u.water.overheadPct = Math.max(0, u.water.overheadPct - 0.04);
      }
      u.power.inverterPct = Math.max(0, Math.min(100, u.power.inverterPct + (u.power.mainsOnline ? 0.05 : -0.4)));
      u.power.estimatedMinutes = Math.round(u.power.inverterPct * 1.5);
      u.power.voltage = u.power.mainsOnline ? Math.round((230 + (Math.random() - 0.5) * 5) * 10) / 10 : 0;
      u.air.aqi = Math.round(Math.max(30, Math.min(180, u.air.aqi + (Math.random() - 0.5) * 5)));
      u.air.pm25 = Math.round(u.air.aqi * 0.34);
      if (u.air.aqi > 100) u.air.purifierOn = true;
      this.emit({ type: "utilities", utilities: this.cloneUtilities() });
    }

    this.emit({ type: "rooms", rooms: this.rooms.map((r) => ({ ...r })) });
    this.emitPreflight();
  }

  private ensureTicker() {
    if (!this.timer) this.timer = setInterval(() => this.step(), 1000);
  }

  private async setStateFrom(state: StudioState, setBy: string) {
    await this.hydrateState();
    this.state = { state, setBy, since: Date.now() };
    await idbSet(MOCK_STATE_KEY, this.state);
    const color = STATE_META[state].color;
    this.rooms.forEach((room) => (room.signColor = color));
    this.emit({ type: "state", state: { ...this.state } });
    this.emit({ type: "rooms", rooms: this.rooms.map((room) => ({ ...room })) });
    this.addHistory({ type: "state", title: `Studio → ${STATE_META[state].label}`, detail: `${setBy} conducted the house`, severity: state === "emergency" ? "critical" : "info" });
    return { ...this.state };
  }

  async getState() {
    await this.hydrateState();
    return { ...this.state };
  }

  async setState(state: StudioState) {
    return this.setStateFrom(state, "Jason Zac");
  }

  async getRooms() {
    await this.hydrateState();
    return this.rooms.map((r) => ({ ...r }));
  }

  async getPreflight() {
    await this.hydrateState();
    return this.getPreflightSync();
  }

  async getSafety() {
    return { ...this.safety };
  }

  async getDoorbell() {
    return { ...this.doorbell };
  }

  async getHistory() {
    return this.history.map((event) => ({ ...event }));
  }

  async getUtilities() {
    return this.cloneUtilities();
  }

  async getPreflightPrep() {
    return this.clonePrep();
  }

  async panic() {
    await this.setStateFrom("emergency", "Emergency control");
  }

  async scene(name: string, state: StudioState) {
    return this.setStateFrom(state, `Scene · ${name}`);
  }

  async preparePreflight() {
    if (this.prep.status === "preparing" || this.prep.active) return this.clonePrep();
    this.prep = { active: false, status: "preparing", mutedDoorbell: true, acOff: false, fanOff: false, startedAt: Date.now() };
    this.emitPreflight();
    await wait(550);
    this.prep.acOff = true;
    this.emitPreflight();
    await wait(550);
    this.prep.fanOff = true;
    this.prep.active = true;
    this.prep.status = "ready";
    this.quietMode = true;
    const music = this.rooms.find((r) => r.id === "music")!;
    music.dbLevel = 34;
    this.emit({ type: "rooms", rooms: this.rooms.map((r) => ({ ...r })) });
    this.emitPreflight();
    this.addHistory({ type: "preflight", title: "Room silenced", detail: "Doorbell muted · AC and fan switched off", severity: "success" });
    return this.clonePrep();
  }

  async restorePreflight() {
    if (!this.prep.active && this.prep.status === "idle") return this.clonePrep();
    this.prep.status = "restoring";
    this.emitPreflight();
    await wait(600);
    this.quietMode = false;
    this.prep = { active: false, status: "idle", mutedDoorbell: false, acOff: false, fanOff: false };
    this.emitPreflight();
    this.addHistory({ type: "preflight", title: "Studio restored", detail: "Doorbell, AC and fan returned to their previous state", severity: "info" });
    return this.clonePrep();
  }

  async runUtilityAction(action: UtilityAction) {
    if (action === "water_pump_toggle") {
      if (this.utilities.water.sumpPct <= 10) {
        this.utilities.water.pumpRunning = false;
        this.addHistory({ type: "utility", title: "Pump blocked", detail: "Sump too low · dry-run protection intervened", severity: "warning" });
      } else {
        this.utilities.water.pumpRunning = !this.utilities.water.pumpRunning;
        this.addHistory({ type: "utility", title: this.utilities.water.pumpRunning ? "Water pump started" : "Water pump stopped", detail: "Overhead tank control · dry-run guard active", severity: "info" });
      }
    } else {
      this.utilities.air.purifierOn = !this.utilities.air.purifierOn;
      this.addHistory({ type: "utility", title: `Air purifier ${this.utilities.air.purifierOn ? "on" : "off"}`, detail: `Music room AQI ${this.utilities.air.aqi}`, severity: "info" });
    }
    const utilities = this.cloneUtilities();
    this.emit({ type: "utilities", utilities });
    return utilities;
  }

  async playTone(hz: number) {
    this.addHistory({ type: "system", title: `${Math.round(hz)} Hz reference tone`, detail: "Played from Studio Command", severity: "info" });
  }

  async triggerSafetyDemo(kind: SafetyAlertKind) {
    return this.setSafety(kind, "Demo");
  }

  subscribe(cb: (ev: StreamEvent) => void) {
    this.listeners.add(cb);
    this.ensureTicker();
    queueMicrotask(() => {
      if (!this.listeners.has(cb)) return;
      cb({ type: "connection", status: "online" });
      cb({ type: "state", state: { ...this.state } });
      cb({ type: "rooms", rooms: this.rooms.map((r) => ({ ...r })) });
      cb({ type: "safety", safety: { ...this.safety } });
      cb({ type: "utilities", utilities: this.cloneUtilities() });
      cb({ type: "preflight", preflight: this.getPreflightSync(), prep: this.clonePrep() });
    });
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  setDbThreshold(v: number) {
    this.dbThreshold = v;
    this.emitPreflight();
  }
}
