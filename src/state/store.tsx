import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, DATA_SOURCE } from "../api/api";
import {
  DEFAULT_SCENES,
  Doorbell,
  Preflight,
  Room,
  Safety,
  SceneDef,
  StudioState,
  StudioStateInfo,
} from "../api/types";
import { idbGet, idbSet } from "./idb";
import { playStateChime, haptic } from "./audio";

export interface Settings {
  dbThreshold: number;
  chimes: boolean;
  notifyStateChanges: boolean;
  notifyEmergency: boolean;
  notifyDoorbell: boolean;
  scenes: SceneDef[];
}

const DEFAULT_SETTINGS: Settings = {
  dbThreshold: 45,
  chimes: true,
  notifyStateChanges: true,
  notifyEmergency: true,
  notifyDoorbell: false,
  scenes: DEFAULT_SCENES,
};

interface Store {
  stateInfo: StudioStateInfo | null;
  rooms: Room[];
  preflight: Preflight | null;
  safety: Safety | null;
  doorbell: Doorbell | null;
  settings: Settings;
  dbHistory: number[]; // last 90 music-room samples
  dataSource: "mock" | "live";
  connected: boolean;
  committing: boolean;
  setStudioState: (s: StudioState) => Promise<void>;
  runScene: (scene: SceneDef) => Promise<void>;
  triggerPanic: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  refreshDoorbell: () => Promise<void>;
}

const StoreCtx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [stateInfo, setStateInfo] = useState<StudioStateInfo | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [safety, setSafety] = useState<Safety | null>(null);
  const [doorbell, setDoorbell] = useState<Doorbell | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [dbHistory, setDbHistory] = useState<number[]>([]);
  const [connected, setConnected] = useState(false);
  const [committing, setCommitting] = useState(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Boot: restore settings, then first fetch + live stream.
  useEffect(() => {
    let unsub = () => {};
    let cancelled = false;

    (async () => {
      const saved = await idbGet<Settings>("settings");
      if (saved && !cancelled) {
        const merged = { ...DEFAULT_SETTINGS, ...saved };
        setSettings(merged);
        api.setDbThreshold(merged.dbThreshold);
      }

      const [st, rm, pf, sf, db] = await Promise.all([
        api.getState(),
        api.getRooms(),
        api.getPreflight(),
        api.getSafety(),
        api.getDoorbell(),
      ]);
      if (cancelled) return;
      setStateInfo(st);
      setRooms(rm);
      setPreflight(pf);
      setSafety(sf);
      setDoorbell(db);
      setConnected(true);

      unsub = api.subscribe((ev) => {
        if (ev.type === "state") setStateInfo(ev.state);
        if (ev.type === "rooms") {
          setRooms(ev.rooms);
          const music = ev.rooms.find((r) => r.id === "music");
          if (music?.dbLevel != null) {
            setDbHistory((h) => [...h.slice(-89), music.dbLevel!]);
          }
          // Pre-flight follows the room feed live.
          api.getPreflight().then(setPreflight).catch(() => {});
        }
        if (ev.type === "safety") setSafety(ev.safety);
        if (ev.type === "doorbell") setDoorbell(ev.doorbell);
      });
    })().catch(() => setConnected(false));

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const setStudioState = useCallback(async (s: StudioState) => {
    setCommitting(true);
    try {
      const info = await api.setState(s);
      setStateInfo(info);
      playStateChime(s, settingsRef.current.chimes);
      haptic(s === "emergency" ? [60, 40, 60] : [12, 30, 24]);
      const pf = await api.getPreflight();
      setPreflight(pf);
    } finally {
      // Let the commit ripple play before the dial unlocks.
      setTimeout(() => setCommitting(false), 900);
    }
  }, []);

  const runScene = useCallback(
    async (scene: SceneDef) => {
      await api.scene(scene.id).catch(() => {});
      await setStudioState(scene.state);
    },
    [setStudioState]
  );

  const triggerPanic = useCallback(async () => {
    await api.panic();
    const info = await api.getState();
    setStateInfo(info);
    playStateChime("emergency", settingsRef.current.chimes);
    haptic([80, 50, 80, 50, 120]);
  }, []);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      idbSet("settings", next);
      if (patch.dbThreshold != null) {
        api.setDbThreshold(patch.dbThreshold);
        api.getPreflight().then(setPreflight).catch(() => {});
      }
      return next;
    });
  }, []);

  const refreshDoorbell = useCallback(async () => {
    const db = await api.getDoorbell();
    setDoorbell(db);
  }, []);

  const value = useMemo<Store>(
    () => ({
      stateInfo,
      rooms,
      preflight,
      safety,
      doorbell,
      settings,
      dbHistory,
      dataSource: DATA_SOURCE,
      connected,
      committing,
      setStudioState,
      runScene,
      triggerPanic,
      updateSettings,
      refreshDoorbell,
    }),
    [stateInfo, rooms, preflight, safety, doorbell, settings, dbHistory, connected, committing, setStudioState, runScene, triggerPanic, updateSettings, refreshDoorbell]
  );

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreCtx);
  if (!s) throw new Error("useStore outside provider");
  return s;
}

export function timeSince(ts: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  return `${h}h ${mins % 60}m`;
}
