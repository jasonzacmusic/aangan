const STATES = new Set([
  "available",
  "class",
  "meeting",
  "audio_rec",
  "video_rec",
  "emergency",
]);
// Every word the light board can say. Listing only three of them meant "onair"
// (door shut again mid-take), "wait" and "sos" were dropped, so the screen kept
// flashing DOOR OPEN for the rest of the take.
// The full Aangan door vocabulary — the "holy matrimony" set: the light and
// the screen both speak exactly these words, so they can never disagree.
//   ok        available, nothing happening
//   wait      class / meeting
//   onair     audio_rec / video_rec, room quiet and door shut
//   door      door open mid-take          (red, fast flash)
//   loud      too loud mid-take            (red, slow pulse)
//   sos       family SOS                   (purple, fast flash, names who)
//   emergency panic / guarded emergency   (purple, fast flash)
//   delivery  courier OTP hand-off at the door (blue)
//   preflight  "silence the room" preparing a take   (cyan, slow pulse)
const VISUALS = new Set([
  "ok", "loud", "door", "onair", "wait", "sos",
  "emergency", "delivery", "preflight", "off",
]);
const MESSAGE_MAX = 80;
const STORAGE_KEY = "door";

function initialDoor() {
  return {
    state: "available",
    at: 0,
    visual: "ok",
    dba: null,
    message: "",
    mat: 0,
    strip_at: 0,
    screen_at: 0,
  };
}

function json(value, status = 200) {
  return Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export class DoorState {
  constructor(ctx) {
    this.ctx = ctx;
    this.door = initialDoor();
    ctx.blockConcurrencyWhile(async () => {
      this.door = (await ctx.storage.get(STORAGE_KEY)) ?? initialDoor();
    });
  }

  async persist() {
    await this.ctx.storage.put(STORAGE_KEY, this.door);
  }

  async fetch(request) {
    if (request.method === "GET") return this.read();
    if (request.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "invalid json" }, 400);
    }

    const hasMessage = body && typeof body.message === "string";
    if (hasMessage) {
      this.door.message = body.message.replace(/\s+/g, " ").trim().slice(0, MESSAGE_MAX);
      this.door.mat = Date.now();
    }

    // A note is independent of the studio state and has its own timestamp.
    if (hasMessage && body.state === undefined) {
      await this.persist();
      return json({ ok: true, message: this.door.message, mat: this.door.mat });
    }

    if (body && body.device === "display") {
      this.door.screen_at = Date.now();
      await this.persist();
      return json({
        state: this.door.state,
        at: this.door.at,
        visual: this.door.visual,
        dba: this.door.dba,
        message: this.door.message,
        mat: this.door.mat,
      });
    }

    // The website / app pushing an announcement (delivery, preflight, sos)
    // without changing the studio state. Must NOT be treated as a strip
    // check-in — that would mark the light "live" when it is not.
    if (body && body.device === "app") {
      if (typeof body.visual === "string" && VISUALS.has(body.visual)) {
        this.door.visual = body.visual;
      }
      await this.persist();
      return json({
        ok: true,
        state: this.door.state,
        visual: this.door.visual,
        at: this.door.at,
      });
    }

    // A strip report can change only observations, never the studio state.
    if (body && body.state === undefined) {
      this.door.strip_at = Date.now();
      const visual = String(body.visual ?? "");
      if (VISUALS.has(visual)) {
        // Command owns the picture. The strip may only interrupt for a door
        // opening or the room going too loud. Posting leftover "ok"/"wait"
        // used to wipe CLASS / ON AIR a few seconds after the dial moved.
        const urgent = visual === "door" || visual === "loud";
        if (urgent) this.door.visual = visual;
      }
      if (Object.hasOwn(body, "dba")) {
        if (typeof body.dba === "number" && Number.isFinite(body.dba)) {
          this.door.dba = Math.round(body.dba * 10) / 10;
        } else if (body.dba === null) {
          this.door.dba = null;
        }
      }
      await this.persist();
      return json({
        state: this.door.state,
        at: this.door.at,
        visual: this.door.visual,
        dba: this.door.dba,
      });
    }

    const state = String(body?.state ?? "");
    if (!STATES.has(state)) {
      return json({ ok: false, error: "unknown state", got: state }, 400);
    }

    this.door.state = state;
    this.door.at = Date.now();
    // Turning the dial always resets the picture. A leftover SOS / delivery
    // visual must not keep CLASS off the boards after Jason has moved on.
    const fromState = {
      available: "ok",
      class: "wait",
      meeting: "wait",
      audio_rec: "onair",
      video_rec: "onair",
      emergency: "emergency",
    };
    if (typeof body.visual === "string" && VISUALS.has(body.visual)) {
      this.door.visual = body.visual;
    } else {
      this.door.visual = fromState[state];
    }
    await this.persist();
    return json({
      ok: true,
      state: this.door.state,
      visual: this.door.visual,
      at: this.door.at,
      store: "durable-object",
    });
  }

  read() {
    const now = Date.now();
    return json({
      state: this.door.state,
      at: this.door.at,
      visual: this.door.visual,
      dba: this.door.dba,
      message: this.door.message,
      mat: this.door.mat,
      strip_age_s: this.door.strip_at ? Math.round((now - this.door.strip_at) / 1000) : null,
      screen_age_s: this.door.screen_at ? Math.round((now - this.door.screen_at) / 1000) : null,
    });
  }
}

export default {
  async fetch(request, env) {
    if (!env.STORE_TOKEN) return json({ ok: false, error: "store not configured" }, 503);
    if (request.headers.get("Authorization") !== `Bearer ${env.STORE_TOKEN}`) {
      return json({ ok: false, error: "unauthorized" }, 401);
    }

    const id = env.DOOR_STATE.idFromName("studio-door");
    return env.DOOR_STATE.get(id).fetch(request);
  },
};
