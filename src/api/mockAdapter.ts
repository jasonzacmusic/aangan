import {
  ApiAdapter,
  Doorbell,
  Preflight,
  Room,
  Safety,
  STATE_META,
  StreamEvent,
  StudioState,
  StudioStateInfo,
} from "./types";

/**
 * MockAdapter — a living, breathing simulation of the apartment.
 * Realistic enough that the whole app works before the Pi exists:
 * the music-room mic wobbles, doors open and close on their own,
 * temperatures drift, the doorbell refreshes its snapshot.
 */

function doorbellSvg(ts: number): string {
  const hue = 200 + ((ts / 60000) % 40);
  const t = new Date(ts);
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="hsl(${hue} 25% 16%)"/>
        <stop offset="1" stop-color="hsl(${hue} 20% 8%)"/>
      </linearGradient>
    </defs>
    <rect width="640" height="360" fill="url(#sky)"/>
    <rect x="60" y="90" width="220" height="270" rx="6" fill="hsl(${hue} 12% 22%)"/>
    <rect x="90" y="130" width="70" height="90" rx="4" fill="hsl(${hue} 30% 30%)"/>
    <rect x="185" y="130" width="70" height="90" rx="4" fill="hsl(${hue} 30% 27%)"/>
    <rect x="330" y="150" width="130" height="210" rx="8" fill="hsl(${hue} 10% 26%)"/>
    <circle cx="440" cy="255" r="7" fill="#C9A84C"/>
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
    { id: "bedroom", name: "Bedroom", doorOpen: true, presence: false, tempC: 24.8, signColor: STATE_META.available.color },
    { id: "kitchen", name: "Kitchen", doorOpen: false, presence: true, tempC: 26.2, signColor: STATE_META.available.color },
    { id: "bathroom", name: "Bathroom", doorOpen: false, presence: false, tempC: 25.0, signColor: STATE_META.available.color },
  ];

  private safety: Safety = { gas: false, leakKitchen: false, leakBath: false };
  private doorbell: Doorbell = { snapshotUrl: doorbellSvg(Date.now() - 3 * 60 * 1000), ts: Date.now() - 3 * 60 * 1000 };
  private dbThreshold = 45;
  private listeners = new Set<(ev: StreamEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;

  private emit(ev: StreamEvent) {
    this.listeners.forEach((cb) => cb(ev));
  }

  private musicBase(): number {
    // Someone playing raises the floor; recording states hush the room.
    const s = this.state.state;
    const music = this.rooms.find((r) => r.id === "music")!;
    if (s === "audio_rec" || s === "video_rec") return 36;
    if (s === "class") return 54;
    return music.presence ? 48 : 34;
  }

  private step() {
    this.tick++;
    const t = this.tick;
    const music = this.rooms.find((r) => r.id === "music")!;

    // dB: slow sine swell + jitter, like a real room mic.
    const base = this.musicBase();
    const swell = Math.sin(t / 6) * 5 + Math.sin(t / 2.3) * 2;
    const jitter = (Math.random() - 0.5) * 4;
    music.dbLevel = Math.max(30, Math.min(92, Math.round((base + swell + jitter) * 10) / 10));

    // Temperatures drift very slowly.
    this.rooms.forEach((r) => {
      r.tempC = Math.round((r.tempC + (Math.random() - 0.5) * 0.06) * 10) / 10;
    });

    // Occasional life: doors + presence.
    if (Math.random() < 0.02) {
      const candidates = this.rooms.filter((r) => r.id !== "music");
      const r = candidates[Math.floor(Math.random() * candidates.length)];
      r.doorOpen = !r.doorOpen;
    }
    if (Math.random() < 0.03) {
      const r = this.rooms[Math.floor(Math.random() * this.rooms.length)];
      r.presence = !r.presence;
    }

    // Doorbell refreshes a snapshot every ~3 min.
    if (t % 180 === 0) {
      this.doorbell = { snapshotUrl: doorbellSvg(Date.now()), ts: Date.now() };
      this.emit({ type: "doorbell", doorbell: this.doorbell });
    }

    this.emit({ type: "rooms", rooms: this.rooms.map((r) => ({ ...r })) });
  }

  private ensureTicker() {
    if (!this.timer) this.timer = setInterval(() => this.step(), 1000);
  }

  // ── ApiAdapter ────────────────────────────────────────────

  async getState() {
    return { ...this.state };
  }

  async setState(state: StudioState) {
    this.state = { state, setBy: "Jason Zac", since: Date.now() };
    const color = STATE_META[state].color;
    this.rooms.forEach((r) => (r.signColor = color)); // every WS2812B sign recolors
    this.emit({ type: "state", state: { ...this.state } });
    this.emit({ type: "rooms", rooms: this.rooms.map((r) => ({ ...r })) });
    return { ...this.state };
  }

  async getRooms() {
    return this.rooms.map((r) => ({ ...r }));
  }

  async getPreflight(): Promise<Preflight> {
    const openDoors = this.rooms.filter((r) => r.doorOpen).map((r) => r.id);
    const db = this.rooms.find((r) => r.id === "music")!.dbLevel ?? 0;
    const doorsClosed = openDoors.length === 0;
    const quietEnough = db < this.dbThreshold;
    return { doorsClosed, quietEnough, ready: doorsClosed && quietEnough, openDoors, dbLevel: db, dbThreshold: this.dbThreshold };
  }

  async getSafety() {
    return { ...this.safety };
  }

  async getDoorbell() {
    return { ...this.doorbell };
  }

  async panic() {
    await this.setState("emergency");
  }

  async scene(name: string) {
    // The store maps scene id → state before calling; this mirrors
    // what the Pi wrapper will do with real HA scenes.
    const map: Record<string, StudioState> = {
      youtube: "video_rec",
      classmode: "class",
      winddown: "available",
    };
    return this.setState(map[name] ?? "available");
  }

  subscribe(cb: (ev: StreamEvent) => void) {
    this.listeners.add(cb);
    this.ensureTicker();
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
  }
}
