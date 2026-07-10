import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, DATA_SOURCE } from "../api/api";
import {
  ActivityEvent,
  DEFAULT_SCENES,
  Doorbell,
  Preflight,
  PreflightPrep,
  Room,
  Safety,
  SafetyAlertKind,
  SceneDef,
  StudioState,
  StudioStateInfo,
  Utilities,
  UtilityAction,
} from "../api/types";
import { idbGet, idbSet } from "./idb";
import { haptic, playReferenceTone, playStateChime } from "./audio";

export interface Settings {
  dbThreshold: number;
  chimes: boolean;
  emergencySiren: boolean;
  notifyStateChanges: boolean;
  notifyEmergency: boolean;
  notifyDoorbell: boolean;
  scenes: SceneDef[];
}

const DEFAULT_SETTINGS: Settings = {
  dbThreshold: 45,
  chimes: true,
  emergencySiren: true,
  notifyStateChanges: true,
  notifyEmergency: true,
  notifyDoorbell: false,
  scenes: DEFAULT_SCENES,
};

export type ConnectionStatus = "connecting" | "online" | "reconnecting" | "offline";

interface Store {
  stateInfo: StudioStateInfo | null;
  rooms: Room[];
  preflight: Preflight | null;
  preflightPrep: PreflightPrep | null;
  safety: Safety | null;
  doorbell: Doorbell | null;
  utilities: Utilities | null;
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
  setStudioState: (s: StudioState) => Promise<void>;
  runScene: (scene: SceneDef) => Promise<void>;
  triggerPanic: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  refreshDoorbell: () => Promise<void>;
  prepareStudio: () => Promise<void>;
  restoreStudio: () => Promise<void>;
  runUtilityAction: (action: UtilityAction) => Promise<void>;
  playTone: (hz?: number) => Promise<void>;
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
  if (safety.gas) return "Gas detected in the kitchen";
  if (safety.leakKitchen) return "Water detected on the kitchen floor";
  if (safety.leakBath) return "Water detected on the bathroom floor";
  return null;
}

async function showSafetyNotification(safety: Safety) {
  const body = safetySummary(safety);
  if (!body || typeof Notification === "undefined" || Notification.permission !== "granted") return;
  try {
    const registration = await navigator.serviceWorker?.ready;
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
  const [doorbell, setDoorbell] = useState<Doorbell | null>(null);
  const [utilities, setUtilities] = useState<Utilities | null>(null);
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
  const safetyRef = useRef<Safety | null>(null);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sceneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  settingsRef.current = settings;
  prepRef.current = preflightPrep;

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
      setSettings(restored);
      settingsRef.current = restored;
      api.setDbThreshold(restored.dbThreshold);

      let attempt = 0;
      while (!cancelled) {
        setConnectionStatus(attempt === 0 ? "connecting" : "reconnecting");
        try {
          const [st, rm, pf, prep, sf, db, events, util] = await Promise.all([
            api.getState(),
            api.getRooms(),
            api.getPreflight(),
            api.getPreflightPrep(),
            api.getSafety(),
            api.getDoorbell(),
            api.getHistory(),
            api.getUtilities(),
          ]);
          if (cancelled) return;
          setStateInfo(st);
          setRooms(rm);
          setPreflight(pf);
          setPreflightPrep(prep);
          prepRef.current = prep;
          applySafety(sf, false);
          setDoorbell(db);
          setHistory(events);
          setUtilities(util);
          const music = rm.find((room) => room.id === "music");
          if (music?.dbLevel != null) setDbHistory([music.dbLevel]);
          setConnected(true);
          setConnectionStatus("online");
          setLastError(null);

          unsub = api.subscribe((ev) => {
            if (cancelled) return;
            if (ev.type === "state") setStateInfo(ev.state);
            if (ev.type === "rooms") {
              setRooms(ev.rooms);
              const nextMusic = ev.rooms.find((room) => room.id === "music");
              if (nextMusic?.dbLevel != null) setDbHistory((samples) => [...samples.slice(-89), nextMusic.dbLevel!]);
            }
            if (ev.type === "safety") applySafety(ev.safety, true);
            if (ev.type === "doorbell") setDoorbell(ev.doorbell);
            if (ev.type === "history") setHistory((eventsNow) => mergeHistory(eventsNow, [ev.event]));
            if (ev.type === "utilities") setUtilities(ev.utilities);
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
          setConnectionStatus(attempt === 1 ? "offline" : "reconnecting");
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
    },
    []
  );

  const finishCommit = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => setCommitting(false), 900);
  }, []);

  const commitState = useCallback(
    async (target: StudioState, action: () => Promise<StudioStateInfo>) => {
      setCommitting(true);
      setLastError(null);
      try {
        const info = await action();
        setStateInfo(info);
        setConnected(true);
        setConnectionStatus("online");
        playStateChime(target, settingsRef.current.chimes);
        haptic(target === "emergency" ? [60, 40, 60] : [12, 30, 24]);
        if (target === "available" && prepRef.current?.active) {
          const restored = await api.restorePreflight();
          setPreflightPrep(restored);
          prepRef.current = restored;
        }
        const nextPreflight = await api.getPreflight();
        setPreflight(nextPreflight);
      } catch {
        setConnected(false);
        setConnectionStatus("offline");
        setLastError(DATA_SOURCE === "live" ? "Pi unreachable — command not sent. Reconnecting…" : "That command did not complete. Please try once more.");
      } finally {
        finishCommit();
      }
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

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((previous) => {
      const next = { ...previous, ...patch };
      settingsRef.current = next;
      void idbSet("settings", next);
      if (patch.dbThreshold != null) {
        api.setDbThreshold(patch.dbThreshold);
        void api.getPreflight().then(setPreflight).catch(() => {});
      }
      return next;
    });
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

  const playTone = useCallback(async (hz = 440) => {
    playReferenceTone(hz);
    try {
      await api.playTone(hz);
    } catch {
      setLastError("The app played A440 here, but the Pi speaker did not answer.");
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
      doorbell,
      utilities,
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
      updateSettings,
      refreshDoorbell,
      prepareStudio,
      restoreStudio,
      runUtilityAction,
      playTone,
      triggerSafetyDemo,
      requestNotificationPermission,
      clearError,
    }),
    [stateInfo, rooms, preflight, preflightPrep, safety, doorbell, utilities, history, settings, dbHistory, connected, connectionStatus, committing, sceneRunning, lastError, notificationPermission, setStudioState, runScene, triggerPanic, updateSettings, refreshDoorbell, prepareStudio, restoreStudio, runUtilityAction, playTone, triggerSafetyDemo, requestNotificationPermission, clearError]
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
