import { ApiAdapter, Doorbell, Preflight, Room, Safety, StreamEvent, StudioState, StudioStateInfo } from "./types";

/**
 * LiveAdapter — talks to the Home Assistant wrapper on the Pi.
 *
 *   GET  /api/state      → { state, setBy, since }
 *   POST /api/state      ← { state }
 *   GET  /api/rooms      → Room[]
 *   GET  /api/preflight  → { doorsClosed, quietEnough, ready, ... }
 *   GET  /api/safety     → { gas, leakKitchen, leakBath }
 *   GET  /api/doorbell   → { snapshotUrl, ts }
 *   POST /api/panic
 *   POST /api/scene      ← { name }
 *   SSE  /api/stream     → events named state|rooms|safety|doorbell
 *
 * If the SSE stream drops, it silently falls back to polling every
 * 3 seconds and keeps the app alive.
 */
export class LiveAdapter implements ApiAdapter {
  private base: string;
  private listeners = new Set<(ev: StreamEvent) => void>();
  private es: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private dbThreshold = 45;

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/$/, "");
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`);
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json();
  }

  getState() {
    return this.get<StudioStateInfo>("/api/state");
  }
  setState(state: StudioState) {
    return this.post<StudioStateInfo>("/api/state", { state });
  }
  getRooms() {
    return this.get<Room[]>("/api/rooms");
  }
  getPreflight() {
    return this.get<Preflight>("/api/preflight");
  }
  getSafety() {
    return this.get<Safety>("/api/safety");
  }
  getDoorbell() {
    return this.get<Doorbell>("/api/doorbell");
  }
  async panic() {
    await this.post("/api/panic");
  }
  scene(name: string) {
    return this.post<StudioStateInfo>("/api/scene", { name });
  }

  private emit(ev: StreamEvent) {
    this.listeners.forEach((cb) => cb(ev));
  }

  private startSse() {
    try {
      this.es = new EventSource(`${this.base}/api/stream`);
      const wire = (name: StreamEvent["type"]) =>
        this.es!.addEventListener(name, (e) => {
          try {
            const data = JSON.parse((e as MessageEvent).data);
            this.emit({ type: name, [name === "state" ? "state" : name]: data } as unknown as StreamEvent);
          } catch {
            /* malformed event — ignore */
          }
        });
      wire("state");
      wire("rooms");
      wire("safety");
      wire("doorbell");
      this.es.onerror = () => {
        this.es?.close();
        this.es = null;
        this.startPolling();
      };
    } catch {
      this.startPolling();
    }
  }

  private startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      try {
        const [state, rooms, safety] = await Promise.all([this.getState(), this.getRooms(), this.getSafety()]);
        this.emit({ type: "state", state });
        this.emit({ type: "rooms", rooms });
        this.emit({ type: "safety", safety });
      } catch {
        /* Pi unreachable — keep trying */
      }
    }, 3000);
  }

  subscribe(cb: (ev: StreamEvent) => void) {
    this.listeners.add(cb);
    if (this.listeners.size === 1) this.startSse();
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) {
        this.es?.close();
        this.es = null;
        if (this.pollTimer) {
          clearInterval(this.pollTimer);
          this.pollTimer = null;
        }
      }
    };
  }

  setDbThreshold(v: number) {
    // Threshold lives app-side for v1; the wrapper computes with its own
    // default until a settings endpoint exists on the Pi.
    this.dbThreshold = v;
  }
}
