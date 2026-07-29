import {
  ActivityEvent,
  ApiAdapter,
  ConnectionState,
  Delivery,
  DeliveryInput,
  DisplayConfig,
  Doorbell,
  PianoCue,
  PianoRig,
  Preflight,
  PreflightPrep,
  Room,
  Safety,
  SafetyAlertKind,
  Sos,
  StreamEvent,
  StudioState,
  StudioStateInfo,
  Utilities,
  UtilityAction,
} from "./types";

/**
 * Authoritative Raspberry Pi wrapper contract.
 *
 * All timestamps are Unix epoch milliseconds. JSON keys and enum values must
 * match src/api/types.ts exactly. CORS must allow the Studio Command origin.
 *
 * Core state and rooms
 *   GET  /api/state                 -> StudioStateInfo
 *   POST /api/state { state }       -> StudioStateInfo
 *   GET  /api/rooms                 -> Room[]
 *   GET  /api/preflight             -> Preflight
 *   GET  /api/preflight/status      -> PreflightPrep
 *   POST /api/preflight/prepare     -> PreflightPrep
 *   POST /api/preflight/restore     -> PreflightPrep
 *   POST /api/settings/db-threshold { value: number } -> { ok: true }
 *
 * Safety, entry and history
 *   GET  /api/safety                -> Safety
 *   GET  /api/doorbell              -> Doorbell
 *   GET  /api/history               -> ActivityEvent[] (newest first, max 40)
 *   POST /api/panic                 -> { ok: true }
 *   POST /api/safety/demo { kind }  -> Safety (commissioning only; disable in production)
 *
 * House actions
 *   POST /api/scene { name, state } -> StudioStateInfo
 *   GET  /api/utilities             -> Utilities
 *   POST /api/utilities/action { action } -> Utilities
 *   POST /api/tone { hz }           -> { ok: true }
 *
 * Piano rig (the PIANO Pi, proxied read-only by the House Pi wrapper)
 *   GET  /api/piano                 -> PianoRig
 *   POST /api/piano/cue { cue }     -> PianoRig
 *   Cues: recording_started | recording_stopped | next_preset | prev_preset
 *   | replay_last (plays the newest MIDI black-box take back through Pianoteq).
 *   PianoRig.blackbox carries the black-box summary — the piano Pi's status
 *   server includes it in /status; the wrapper passes it through untouched.
 *   The wrapper forwards cues to the piano Pi's status server over HTTP and
 *   must tolerate the rig being offline (return online:false, never block).
 *
 * Family SOS (raised from any phone's #/sos page)
 *   GET  /api/sos                   -> Sos | null
 *   POST /api/sos { who, message }  -> Sos
 *   POST /api/sos/clear             -> { ok: true }
 *   Raising an SOS must also set the studio state to "emergency" (setBy
 *   "SOS · <who>") and fire the critical family notifications. Clearing the
 *   SOS never changes the studio state by itself — the app stands down
 *   explicitly. Emit an sos SSE frame (payload may be JSON null).
 *
 * Delivery OTP hand-off (door displays)
 *   GET  /api/delivery              -> Delivery | null
 *   POST /api/delivery { courier, otp, note, displayId, minutes } -> Delivery
 *   POST /api/delivery/clear        -> { ok: true }
 *   The wrapper computes expiresAt = now + minutes and must expire the
 *   delivery server-side, emitting a delivery SSE frame with null.
 *
 * Displays (per-panel assignable content)
 *   GET  /api/displays              -> DisplayConfig[]
 *   POST /api/displays/update { id, patch } -> DisplayConfig[]
 *   POST /api/displays/add { name } -> DisplayConfig[]
 *   POST /api/displays/remove { id } -> DisplayConfig[]
 *   Panels open the app at /#/display/<id>; content is resolved client-side.
 *
 * Live stream
 *   GET /api/stream (text/event-stream)
 *   Named SSE events: state, rooms, safety, doorbell, history, utilities,
 *   preflight, piano, delivery, displays, sos. The preflight event payload is
 *   { preflight, prep }. The delivery and sos payloads may be JSON null.
 *
 * The client falls back to 3-second polling when SSE drops and retries SSE
 * every 10 seconds. No page knows whether this adapter or the mock is active.
 */
export class LiveAdapter implements ApiAdapter {
  private base: string;
  private listeners = new Set<(ev: StreamEvent) => void>();
  private es: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private sseRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private connectionState: ConnectionState | null = null;

  constructor(baseUrl: string) {
    this.base = baseUrl.replace(/\/$/, "");
  }

  private async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.base}${path}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    return res.json() as Promise<T>;
  }

  private async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} → ${res.status}`);
    if (res.status === 204) return undefined as T;
    const contentType = res.headers.get("content-type") ?? "";
    return contentType.includes("application/json") ? (res.json() as Promise<T>) : (undefined as T);
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
  getPreflightPrep() {
    return this.get<PreflightPrep>("/api/preflight/status");
  }
  getSafety() {
    return this.get<Safety>("/api/safety");
  }
  getDoorbell() {
    return this.get<Doorbell>("/api/doorbell");
  }
  getHistory() {
    return this.get<ActivityEvent[]>("/api/history");
  }
  getUtilities() {
    return this.get<Utilities>("/api/utilities");
  }
  async panic() {
    await this.post<{ ok: true }>("/api/panic");
  }
  scene(name: string, state: StudioState) {
    return this.post<StudioStateInfo>("/api/scene", { name, state });
  }
  preparePreflight() {
    return this.post<PreflightPrep>("/api/preflight/prepare");
  }
  restorePreflight() {
    return this.post<PreflightPrep>("/api/preflight/restore");
  }
  runUtilityAction(action: UtilityAction) {
    return this.post<Utilities>("/api/utilities/action", { action });
  }
  async playTone(hz: number) {
    await this.post<{ ok: true }>("/api/tone", { hz });
  }
  getPianoRig() {
    return this.get<PianoRig>("/api/piano");
  }
  pianoCue(cue: PianoCue) {
    return this.post<PianoRig>("/api/piano/cue", { cue });
  }
  getSos() {
    return this.get<Sos | null>("/api/sos");
  }
  triggerSos(who: string, message: string) {
    return this.post<Sos>("/api/sos", { who, message });
  }
  async clearSos() {
    await this.post<{ ok: true }>("/api/sos/clear");
  }
  getDelivery() {
    return this.get<Delivery | null>("/api/delivery");
  }
  setDelivery(input: DeliveryInput) {
    return this.post<Delivery>("/api/delivery", input);
  }
  async clearDelivery() {
    await this.post<{ ok: true }>("/api/delivery/clear");
  }
  getDisplays() {
    return this.get<DisplayConfig[]>("/api/displays");
  }
  updateDisplay(id: string, patch: Partial<Pick<DisplayConfig, "content" | "message" | "name">>) {
    return this.post<DisplayConfig[]>("/api/displays/update", { id, patch });
  }
  addDisplay(name: string) {
    return this.post<DisplayConfig[]>("/api/displays/add", { name });
  }
  removeDisplay(id: string) {
    return this.post<DisplayConfig[]>("/api/displays/remove", { id });
  }
  triggerSafetyDemo(kind: SafetyAlertKind) {
    return this.post<Safety>("/api/safety/demo", { kind });
  }

  private emit(ev: StreamEvent) {
    this.listeners.forEach((cb) => cb(ev));
  }

  private setConnection(status: ConnectionState) {
    if (this.connectionState === status) return;
    this.connectionState = status;
    this.emit({ type: "connection", status });
  }

  private stopPolling() {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private async pollOnce() {
    try {
      const [state, rooms, safety, preflight, prep, utilities, piano, delivery, displays, sos] = await Promise.all([
        this.getState(),
        this.getRooms(),
        this.getSafety(),
        this.getPreflight(),
        this.getPreflightPrep(),
        this.getUtilities(),
        this.getPianoRig(),
        this.getDelivery(),
        this.getDisplays(),
        this.getSos(),
      ]);
      this.emit({ type: "state", state });
      this.emit({ type: "rooms", rooms });
      this.emit({ type: "safety", safety });
      this.emit({ type: "preflight", preflight, prep });
      this.emit({ type: "utilities", utilities });
      this.emit({ type: "piano", piano });
      this.emit({ type: "delivery", delivery });
      this.emit({ type: "displays", displays });
      this.emit({ type: "sos", sos });
      this.setConnection("online");
    } catch {
      this.setConnection("offline");
    }
  }

  private startPolling() {
    if (this.pollTimer || this.listeners.size === 0) return;
    void this.pollOnce();
    this.pollTimer = setInterval(() => void this.pollOnce(), 3000);
  }

  private scheduleSseRetry() {
    if (this.sseRetryTimer || this.listeners.size === 0) return;
    this.sseRetryTimer = setTimeout(() => {
      this.sseRetryTimer = null;
      this.startSse();
    }, 10_000);
  }

  private startSse() {
    if (this.es || this.listeners.size === 0) return;
    try {
      const es = new EventSource(`${this.base}/api/stream`);
      this.es = es;
      const keys: Record<Exclude<StreamEvent["type"], "connection" | "preflight">, string> = {
        state: "state",
        rooms: "rooms",
        safety: "safety",
        doorbell: "doorbell",
        history: "event",
        utilities: "utilities",
        piano: "piano",
        delivery: "delivery",
        displays: "displays",
        sos: "sos",
      };
      (Object.keys(keys) as Array<keyof typeof keys>).forEach((name) => {
        es.addEventListener(name, (raw) => {
          try {
            const data = JSON.parse((raw as MessageEvent).data);
            this.emit({ type: name, [keys[name]]: data } as StreamEvent);
          } catch {
            // Ignore malformed frames; a later good frame keeps the stream alive.
          }
        });
      });
      es.addEventListener("preflight", (raw) => {
        try {
          const data = JSON.parse((raw as MessageEvent).data) as { preflight: Preflight; prep: PreflightPrep };
          this.emit({ type: "preflight", preflight: data.preflight, prep: data.prep });
        } catch {
          // Ignore malformed frames.
        }
      });
      es.onopen = () => {
        this.stopPolling();
        this.setConnection("online");
      };
      es.onerror = () => {
        es.close();
        if (this.es === es) this.es = null;
        this.setConnection("reconnecting");
        this.startPolling();
        this.scheduleSseRetry();
      };
    } catch {
      this.setConnection("reconnecting");
      this.startPolling();
      this.scheduleSseRetry();
    }
  }

  subscribe(cb: (ev: StreamEvent) => void) {
    this.listeners.add(cb);
    if (this.listeners.size === 1) this.startSse();
    return () => {
      this.listeners.delete(cb);
      if (this.listeners.size === 0) {
        this.es?.close();
        this.es = null;
        this.stopPolling();
        if (this.sseRetryTimer) clearTimeout(this.sseRetryTimer);
        this.sseRetryTimer = null;
      }
    };
  }

  setDbThreshold(v: number) {
    void this.post<{ ok: true }>("/api/settings/db-threshold", { value: v }).catch(() => {
      this.setConnection("reconnecting");
    });
  }
}
