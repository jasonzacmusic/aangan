import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, DATA_SOURCE } from "../api/api";
import {
  ActivityEvent,
  AirState,
  DEFAULT_DISPLAYS,
  DEFAULT_SCENES,
  Delivery,
  DeliveryInput,
  DisplayConfig,
  Doorbell,
  FleetDevice,
  INSTRUMENT_RH_MAX,
  INSTRUMENT_RH_MIN,
  PianoCue,
  PianoRig,
  Preflight,
  PurifierMode,
  PreflightPrep,
  Room,
  Safety,
  SafetyAlertKind,
  SceneDef,
  Sos,
  STATE_META,
  StudioState,
  StudioStateInfo,
  Utilities,
  UtilityAction,
} from "../api/types";
import { DEFAULT_DOOR_WARN_DBA } from "../door/studioDoorPresets";
import { doorStatus, pushDoorMessage, pushDoorVisual, pushLedEspState } from "../api/ledesp";
import { idbGet, idbSet } from "./idb";
import { haptic, playReferenceTone, playStateChime } from "./audio";

export interface Settings {
  dbThreshold: number;
  /** G2 hall warning. Rest with AC on is 42 dBA; default 52 stays clear of that. */
  doorWarnDb: number;
  chimes: boolean;
  emergencySiren: boolean;
  notifyStateChanges: boolean;
  notifyEmergency: boolean;
  notifyDoorbell: boolean;
  /** Standing directions appended to every delivery hand-off (lift, floor, landmark). */
  deliveryDirections: string;
  /** Ask for fresh air above this CO₂ (ppm). 1000 is the usual comfort line. */
  co2Threshold: number;
  /** Instrument-safe humidity band — outside it, for hours, is what warps pianos. */
  rhMin: number;
  rhMax: number;
  scenes: SceneDef[];
}

const DEFAULT_SETTINGS: Settings = {
  dbThreshold: 40,
  doorWarnDb: DEFAULT_DOOR_WARN_DBA,
  chimes: true,
  emergencySiren: true,
  notifyStateChanges: true,
  notifyEmergency: true,
  notifyDoorbell: false,
  deliveryDirections: "",
  co2Threshold: 1000,
  rhMin: INSTRUMENT_RH_MIN,
  rhMax: INSTRUMENT_RH_MAX,
  scenes: DEFAULT_SCENES,
};

export type ConnectionStatus = "connecting" | "online" | "reconnecting" | "offline";

interface Store {
  stateInfo: StudioStateInfo | null;
  rooms: Room[];
  preflight: Preflight | null;
  preflightPrep: PreflightPrep | null;
  safety: Safety | null;
  sos: Sos | null;
  fleet: FleetDevice[];
  air: AirState | null;
  doorbell: Doorbell | null;
  utilities: Utilities | null;
  pianoRig: PianoRig | null;
  delivery: Delivery | null;
  displays: DisplayConfig[];
  history: ActivityEvent[];
  settings: Settings;
  dbHistory: number[];
  dataSource: "mock" | "live";
  connected: boolean;
  connectionStatus: ConnectionStatus;
  committing: boolean;
  sceneRunning: string | null;
  lastError: string | null;
  notificationPermission: NotificationPermission | "unsupported";
  setStudioState: (s: StudioState) => Promise<boolean>;
  runScene: (scene: SceneDef) => Promise<void>;
  triggerPanic: () => Promise<boolean>;
  triggerSos: (who: string, message: string) => Promise<boolean>;
  clearSos: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  refreshDoorbell: () => Promise<void>;
  prepareStudio: () => Promise<void>;
  restoreStudio: () => Promise<void>;
  runUtilityAction: (action: UtilityAction) => Promise<void>;
  setPurifierMode: (id: string, mode: PurifierMode) => Promise<void>;
  startAirPurge: (minutes: number) => Promise<void>;
  stopAirPurge: () => Promise<void>;
  playTone: (hz?: number) => Promise<void>;
  sendPianoCue: (cue: PianoCue) => Promise<void>;
  postDelivery: (input: DeliveryInput) => Promise<void>;
  clearDelivery: () => Promise<void>;
  updateDisplay: (id: string, patch: Partial<Pick<DisplayConfig, "content" | "message" | "name">>) => Promise<void>;
  addDisplay: (name: string) => Promise<void>;
  removeDisplay: (id: string) => Promise<void>;
  triggerSafetyDemo: (kind: SafetyAlertKind) => Promise<void>;
  requestNotificationPermission: () => Promise<void>;
  clearError: () => void;
}

const StoreCtx = createContext<Store | null>(null);

function mergeHistory(current: ActivityEvent[], incoming: ActivityEvent[]) {
  const byId = new Map<string, ActivityEvent>();
  [...incoming, ...current].forEach((event) => byId.set(event.id, event));
  return [...byId.values()].sort((a, b) => b.ts - a.ts).slice(0, 40);
}

function safetySummary(safety: Safety) {
  if (safety.fire) return "Smoke or flame detected";
  if (safety.gas) return "Gas detected in the kitchen";
  if (safety.panic) return "The wired panic loop was opened";
  if (safety.leakKitchen) return "Water detected on the kitchen floor";
  if (safety.leakBath) return "Water detected on the bathroom floor";
  if (safety.leakGeyser) return "Water detected near the geyser";
  if (safety.perimeter) return "A perimeter vibration sensor was triggered";
  return null;
}

async function showSafetyNotification(safety: Safety) {
  const body = safetySummary(safety);
  if (!body || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    // serviceWorker.ready never settles when no worker will ever activate
    // (dev builds, blocked registration) — a safety alert cannot wait on that.
    const registration = await Promise.race([
      navigator.serviceWorker?.ready ?? Promise.resolve(null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
    ]);
    if (registration) await registration.showNotification("Studio Command safety alert", { body, icon: "/icons/icon-192.png", tag: "studio-safety", requireInteraction: true });
    else new Notification("Studio Command safety alert", { body, icon: "/icons/icon-192.png", tag: "studio-safety" });
  } catch {
    // Alert remains visible in-app even when the OS blocks notifications.
  }
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [stateInfo, setStateInfo] = useState<StudioStateInfo | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [preflightPrep, setPreflightPrep] = useState<PreflightPrep | null>(null);
  const [safety, setSafety] = useState<Safety | null>(null);
  const [sos, setSos] = useState<Sos | null>(null);
  const [fleet, setFleet] = useState<FleetDevice[]>([]);
  const [air, setAir] = useState<AirState | null>(null);
  const [doorbell, setDoorbell] = useState<Doorbell | null>(null);
  const [utilities, setUtilities] = useState<Utilities | null>(null);
  const [pianoRig, setPianoRig] = useState<PianoRig | null>(null);
  const [delivery, setDeliveryState] = useState<Delivery | null>(null);
  const [displays, setDisplays] = useState<DisplayConfig[]>([]);
  const [history, setHistory] = useState<ActivityEvent[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [dbHistory, setDbHistory] = useState<number[]>([]);
  const [connected, setConnected] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [committing, setCommitting] = useState(false);
  const [sceneRunning, setSceneRunning] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const settingsRef = useRef(settings);
  const prepRef = useRef(preflightPrep);
  const stateInfoRef = useRef(stateInfo);
  const safetyRef = useRef<Safety | null>(null);
  const committingRef = useRef(false);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbThresholdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doorWarnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  settingsRef.current = settings;
  prepRef.current = preflightPrep;
  stateInfoRef.current = stateInfo;

  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const pause = (ms: number) =>
      new Promise<void>((resolve) => {
        retryTimer = setTimeout(resolve, ms);
      });

    const applySafety = (next: Safety, notify: boolean) => {
      const prior = safetyRef.current;
      const wasClear = !prior || !Object.values(prior).some(Boolean);
      safetyRef.current = next;
      setSafety(next);
      if (notify && wasClear && Object.values(next).some(Boolean) && settingsRef.current.notifyEmergency) void showSafetyNotification(next);
    };

    const start = async () => {
      const saved = await idbGet<Settings>("settings");
      if (cancelled) return;
      const restored = saved ? { ...DEFAULT_SETTINGS, ...saved, scenes: saved.scenes?.length ? saved.scenes : DEFAULT_SCENES } : DEFAULT_SETTINGS;
      restored.dbThreshold = Math.min(41, Math.max(35, restored.dbThreshold));
      setSettings(restored);
      settingsRef.current = restored;
      // Mock house only: keep the local take line. Never POST to Home
      // Assistant on boot — that overwrote the Mac-trained threshold.
      if (DATA_SOURCE === "mock") api.setDbThreshold(restored.dbThreshold);

      // Never trap the whole app on "tuning in". The studio door talks to
      // /api/door, which does not need the Pi. Prefer the live hall state,
      // then the last known state — never invent Available over an SOS.
      const savedState = await idbGet<StudioStateInfo>("last-studio-state");
      let initial: StudioStateInfo | null =
        savedState && savedState.state in STATE_META && Number.isFinite(savedState.since) ? savedState : null;
      try {
        const door = await doorStatus();
        if (door.reachable && door.state && door.state in STATE_META) {
          initial = { state: door.state as StudioState, setBy: "Studio door", since: Date.now() };
        }
      } catch {
        /* door relay is optional at boot */
      }
      setStateInfo(initial ?? { state: "available", setBy: "Aangan", since: Date.now() });
      setDisplays(DEFAULT_DISPLAYS);
      setSafety({
        fire: false, gas: false, panic: false,
        leakKitchen: false, leakBath: false, leakGeyser: false, perimeter: false,
      });
      setPreflight({
        doorsClosed: true, quietEnough: false, sensorsHealthy: false, safetyClear: true,
        ready: false, openDoors: [], dbLevel: null, dbThreshold: restored.dbThreshold,
      });

      let attempt = 0;
      while (!cancelled) {
        setConnectionStatus(attempt === 0 ? "connecting" : "reconnecting");
        try {
          // State, rooms, pre-flight and safety are the control surface's core.
          // Optional systems must never blank the whole app if one is not yet
          // commissioned (for example Piano Pi or the future tank sensors).
          const [st, rm, pf, sf] = await Promise.all([
            api.getState(),
            api.getRooms(),
            api.getPreflight(),
            api.getSafety(),
          ]);
          const optional = await Promise.allSettled([
            api.getPreflightPrep(),
            api.getDoorbell(),
            api.getHistory(),
            api.getUtilities(),
            api.getPianoRig(),
            api.getDelivery(),
            api.getDisplays(),
            api.getSos(),
            api.getFleet(),
            api.getAir(),
          ]);
          if (cancelled) return;
          setStateInfo(st);
          setRooms(rm);
          setPreflight(pf);
          applySafety(sf, false);
          const [prep, db, events, util, piano, del, disp, sosNow, fleetNow, airNow] = optional;
          if (prep.status === "fulfilled") {
            setPreflightPrep(prep.value);
            prepRef.current = prep.value;
          }
          if (db.status === "fulfilled") setDoorbell(db.value);
          if (events.status === "fulfilled") setHistory(events.value);
          if (util.status === "fulfilled") setUtilities(util.value);
          if (piano.status === "fulfilled") setPianoRig(piano.value);
          if (del.status === "fulfilled") setDeliveryState(del.value);
          if (disp.status === "fulfilled") setDisplays(disp.value);
          if (sosNow.status === "fulfilled") setSos(sosNow.value);
          if (fleetNow.status === "fulfilled") setFleet(fleetNow.value);
          if (airNow.status === "fulfilled") setAir(airNow.value);
          const music = rm.find((room) => room.id === "music");
          if (music?.dbLevel != null) setDbHistory([music.dbLevel]);
          setConnected(true);
          setConnectionStatus("online");
          setLastError(null);

          unsub = api.subscribe((ev) => {
            if (cancelled) return;
            if (ev.type === "state") {
              if (committingRef.current) return;
              setStateInfo(ev.state);
              void idbSet("last-studio-state", ev.state);
            }
            if (ev.type === "rooms") {
              setRooms(ev.rooms);
              const nextMusic = ev.rooms.find((room) => room.id === "music");
              if (nextMusic?.dbLevel != null) setDbHistory((samples) => [...samples.slice(-89), nextMusic.dbLevel!]);
            }
            if (ev.type === "safety") applySafety(ev.safety, true);
            if (ev.type === "doorbell") setDoorbell(ev.doorbell);
            if (ev.type === "history") setHistory((eventsNow) => mergeHistory(eventsNow, [ev.event]));
            if (ev.type === "utilities") setUtilities(ev.utilities);
            if (ev.type === "piano") setPianoRig(ev.piano);
            if (ev.type === "delivery") setDeliveryState(ev.delivery);
            if (ev.type === "displays") setDisplays(ev.displays);
            if (ev.type === "sos") setSos(ev.sos);
            if (ev.type === "fleet") setFleet(ev.fleet);
            if (ev.type === "air") setAir(ev.air);
            if (ev.type === "preflight") {
              setPreflight(ev.preflight);
              setPreflightPrep(ev.prep);
              prepRef.current = ev.prep;
            }
            if (ev.type === "connection") {
              setConnectionStatus(ev.status);
              setConnected(ev.status === "online");
            }
          });
          return;
        } catch {
          if (cancelled) return;
          attempt += 1;
          setConnected(false);
          setConnectionStatus(attempt < 3 ? "reconnecting" : "offline");
          setLastError(DATA_SOURCE === "live" ? "Pi unreachable — Studio Command is reconnecting." : "The simulated house is restarting.");
          await pause(Math.min(30_000, 1000 * 2 ** Math.min(attempt - 1, 5)));
        }
      }
    };

    void start();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      unsub();
    };
  }, []);

  useEffect(
    () => () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
      if (sceneTimer.current) clearTimeout(sceneTimer.current);
      if (dbThresholdTimer.current) clearTimeout(dbThresholdTimer.current);
      if (doorWarnTimer.current) clearTimeout(doorWarnTimer.current);
    },
    []
  );

  const finishCommit = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      committingRef.current = false;
      setCommitting(false);
    }, 900);
  }, []);

  const commitState = useCallback(
    async (target: StudioState, action: () => Promise<StudioStateInfo>) => {
      committingRef.current = true;
      setCommitting(true);
      setLastError(null);
      // The dial IS the door. Push the couple first, then try the rest of
      // the house. A sleeping Pi must never leave the light and screen behind.
      void pushLedEspState(target, { force: true });
      const previous = stateInfoRef.current;
      const nextInfo = { state: target, setBy: "This device", since: Date.now() };
      setStateInfo(nextInfo);
      void idbSet("last-studio-state", nextInfo);
      playStateChime(target, settingsRef.current.chimes);
      haptic(target === "emergency" ? [60, 40, 60] : [12, 30, 24]);
      try {
        const info = await action();
        setStateInfo(info);
        void idbSet("last-studio-state", info);
        setConnected(true);
        setConnectionStatus("online");
        if (target === "available" && prepRef.current?.active) {
          const restored = await api.restorePreflight();
          setPreflightPrep(restored);
          prepRef.current = restored;
        }
        try {
          setPreflight(await api.getPreflight());
        } catch {
          /* door already moved */
        }
      } catch {
        // The house did NOT change. Pretending it did is worst during an
        // emergency stand-down: the siren stops on this phone while every
        // other device stays in emergency. Roll back and say so.
        setStateInfo(previous);
        if (previous) {
          void idbSet("last-studio-state", previous);
          void pushLedEspState(previous.state, { force: true });
        }
        setConnected(false);
        setConnectionStatus("offline");
        setLastError(
          previous?.state === "emergency"
            ? "The house did not confirm the stand-down — it is still in emergency. Try again."
            : "The house did not confirm that change — the state was not switched."
        );
        return false;
      } finally {
        finishCommit();
      }
      return true;
    },
    [finishCommit]
  );

  const setStudioState = useCallback((state: StudioState) => commitState(state, () => api.setState(state)), [commitState]);

  const runScene = useCallback(
    async (scene: SceneDef) => {
      setSceneRunning(scene.id);
      await commitState(scene.state, () => api.scene(scene.id, scene.state));
      if (sceneTimer.current) clearTimeout(sceneTimer.current);
      sceneTimer.current = setTimeout(() => setSceneRunning(null), 900);
    },
    [commitState]
  );

  const triggerPanic = useCallback(() => commitState("emergency", async () => {
    await api.panic();
    return api.getState();
  }), [commitState]);

  const triggerSos = useCallback(
    (who: string, message: string) =>
      commitState("emergency", async () => {
        void pushDoorVisual("sos");
        const next = await api.triggerSos(who, message);
        setSos(next);
        return api.getState();
      }),
    [commitState]
  );

  const clearSos = useCallback(async () => {
    try {
      await api.clearSos();
      setSos(null);
      const current = stateInfoRef.current?.state && stateInfoRef.current.state !== "emergency"
        ? stateInfoRef.current.state
        : "available";
      void pushLedEspState(current, { force: true });
    } catch {
      setLastError("Could not mark the SOS as safe — try once more.");
    }
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      settingsRef.current = next;
      void idbSet("settings", next);
      return next;
    });
    // A slider drag emits dozens of steps — debounce so only the resting
    // value hits the network (one POST instead of one per pixel).
    if (patch.dbThreshold != null) {
      if (dbThresholdTimer.current) clearTimeout(dbThresholdTimer.current);
      dbThresholdTimer.current = setTimeout(() => {
        api.setDbThreshold(settingsRef.current.dbThreshold);
        void api.getPreflight().then(setPreflight).catch(() => {});
      }, 400);
    }
    if (patch.doorWarnDb != null) {
      if (doorWarnTimer.current) clearTimeout(doorWarnTimer.current);
      doorWarnTimer.current = setTimeout(() => {
        api.setDoorWarnDb?.(settingsRef.current.doorWarnDb);
      }, 400);
    }
  }, []);

  const refreshDoorbell = useCallback(async () => {
    try {
      setDoorbell(await api.getDoorbell());
    } catch {
      setLastError("Doorbell camera did not answer yet.");
    }
  }, []);

  const prepareStudio = useCallback(async () => {
    if (prepRef.current?.status === "preparing") return;
    setPreflightPrep((current) => ({
      active: false,
      status: "preparing",
      mutedDoorbell: current?.mutedDoorbell ?? false,
      acOff: current?.acOff ?? false,
      fanOff: current?.fanOff ?? false,
      startedAt: Date.now(),
    }));
    try {
      void pushDoorVisual("preflight");
      const prep = await api.preparePreflight();
      prepRef.current = prep;
      setPreflightPrep(prep);
      setPreflight(await api.getPreflight());
    } catch {
      setLastError(DATA_SOURCE === "live" ? "The Pi could not silence the room. Check the studio devices." : "The room-silence demo did not complete.");
      setPreflightPrep((current) => current ? { ...current, status: "idle", active: false } : null);
    }
  }, []);

  const restoreStudio = useCallback(async () => {
    try {
      void pushDoorVisual("ok");
      const prep = await api.restorePreflight();
      prepRef.current = prep;
      setPreflightPrep(prep);
      setPreflight(await api.getPreflight());
    } catch {
      setLastError("Studio devices did not confirm they were restored.");
    }
  }, []);

  const runUtilityAction = useCallback(async (action: UtilityAction) => {
    try {
      setUtilities(await api.runUtilityAction(action));
    } catch {
      setLastError(DATA_SOURCE === "live" ? "The Pi did not confirm that house action." : "That house action did not complete.");
    }
  }, []);

  const setPurifierMode = useCallback(async (id: string, mode: PurifierMode) => {
    try {
      setAir(await api.setPurifierMode(id, mode));
    } catch {
      setLastError("The purifier did not confirm that change.");
    }
  }, []);

  const startAirPurge = useCallback(async (minutes: number) => {
    try {
      setAir(await api.startAirPurge(minutes));
    } catch {
      setLastError("Could not start the air purge.");
    }
  }, []);

  const stopAirPurge = useCallback(async () => {
    try {
      setAir(await api.stopAirPurge());
    } catch {
      setLastError("Could not stop the air purge.");
    }
  }, []);

  const playTone = useCallback(async (hz = 440) => {
    playReferenceTone(hz);
    // Room speaker is optional; the phone is the reference the musician hears.
    void api.playTone(hz).catch(() => {});
  }, []);

  const sendPianoCue = useCallback(async (cue: PianoCue) => {
    try {
      setPianoRig(await api.pianoCue(cue));
    } catch {
      setLastError(
        cue === "next_preset" || cue === "prev_preset" || cue === "replay_last"
          ? "Piano cues are locked while a take is rolling — wait until Rec is off."
          : "The piano rig did not answer that cue."
      );
    }
  }, []);

  const postDelivery = useCallback(async (input: DeliveryInput) => {
    try {
      void pushDoorVisual("delivery");
      void pushDoorMessage(`${input.courier} · ${input.otp}`);
      setDeliveryState(await api.setDelivery(input));
    } catch {
      setLastError("The door display did not accept the delivery hand-off.");
    }
  }, []);

  const clearDelivery = useCallback(async () => {
    try {
      void pushDoorVisual("ok");
      void pushDoorMessage("");
      await api.clearDelivery();
      setDeliveryState(null);
    } catch {
      setLastError("Could not clear the delivery hand-off.");
    }
  }, []);

  const updateDisplay = useCallback(async (id: string, patch: Partial<Pick<DisplayConfig, "content" | "message" | "name">>) => {
    try {
      setDisplays(await api.updateDisplay(id, patch));
    } catch {
      setLastError("That display did not confirm the change.");
    }
  }, []);

  const addDisplay = useCallback(async (name: string) => {
    try {
      setDisplays(await api.addDisplay(name));
    } catch {
      setLastError("Could not add the display.");
    }
  }, []);

  const removeDisplay = useCallback(async (id: string) => {
    try {
      setDisplays(await api.removeDisplay(id));
    } catch {
      setLastError("Could not remove the display.");
    }
  }, []);

  const triggerSafetyDemo = useCallback(async (kind: SafetyAlertKind) => {
    try {
      const next = await api.triggerSafetyDemo(kind);
      safetyRef.current = next;
      setSafety(next);
      if (kind !== "clear" && settingsRef.current.notifyEmergency) void showSafetyNotification(next);
    } catch {
      setLastError("Safety demo could not be started.");
    }
  }, []);

  const requestNotificationPermission = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(await Notification.requestPermission());
  }, []);

  const clearError = useCallback(() => setLastError(null), []);

  const value = useMemo<Store>(
    () => ({
      stateInfo,
      rooms,
      preflight,
      preflightPrep,
      safety,
      sos,
      fleet,
      air,
      doorbell,
      utilities,
      pianoRig,
      delivery,
      displays,
      history,
      settings,
      dbHistory,
      dataSource: DATA_SOURCE,
      connected,
      connectionStatus,
      committing,
      sceneRunning,
      lastError,
      notificationPermission,
      setStudioState,
      runScene,
      triggerPanic,
      triggerSos,
      clearSos,
      updateSettings,
      refreshDoorbell,
      prepareStudio,
      restoreStudio,
      runUtilityAction,
      setPurifierMode,
      startAirPurge,
      stopAirPurge,
      playTone,
      sendPianoCue,
      postDelivery,
      clearDelivery,
      updateDisplay,
      addDisplay,
      removeDisplay,
      triggerSafetyDemo,
      requestNotificationPermission,
      clearError,
    }),
    [stateInfo, rooms, preflight, preflightPrep, safety, sos, fleet, air, doorbell, utilities, pianoRig, delivery, displays, history, settings, dbHistory, connected, connectionStatus, committing, sceneRunning, lastError, notificationPermission, setStudioState, runScene, triggerPanic, triggerSos, clearSos, updateSettings, refreshDoorbell, prepareStudio, restoreStudio, runUtilityAction, setPurifierMode, startAirPurge, stopAirPurge, playTone, sendPianoCue, postDelivery, clearDelivery, updateDisplay, addDisplay, removeDisplay, triggerSafetyDemo, requestNotificationPermission, clearError]
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreCtx);
  if (!store) throw new Error("useStore outside provider");
  return store;
}

export function timeSince(ts: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}
