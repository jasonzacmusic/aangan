import React, { useEffect, useRef, useState } from "react";

/** Keeps an installed wall panel current without surprise reloads mid-session. */
export default function PwaUpdatePrompt() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const reloading = useRef(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    let active = true;
    let interval: ReturnType<typeof setInterval> | null = null;
    let registration: ServiceWorkerRegistration | null = null;
    let updateFoundHandler: (() => void) | null = null;

    const checkForUpdate = () => {
      if (document.visibilityState === "visible") void registration?.update();
    };

    const register = async () => {
      try {
        const registered = await navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" });
        registration = registered;
        if (!active) return;
        if (registered.waiting && navigator.serviceWorker.controller) setWaiting(registered.waiting);
        updateFoundHandler = () => {
          const worker = registered.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(worker);
          });
        };
        registered.addEventListener("updatefound", updateFoundHandler);
        interval = setInterval(() => void registered.update(), 15 * 60 * 1000);
        document.addEventListener("visibilitychange", checkForUpdate);
      } catch {
        // The app remains usable online even if the browser blocks service workers.
      }
    };

    const reloadOnClaim = () => {
      if (reloading.current) return;
      reloading.current = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnClaim);
    void register();
    return () => {
      active = false;
      if (interval) clearInterval(interval);
      if (registration && updateFoundHandler) registration.removeEventListener("updatefound", updateFoundHandler);
      document.removeEventListener("visibilitychange", checkForUpdate);
      navigator.serviceWorker.removeEventListener("controllerchange", reloadOnClaim);
    };
  }, []);

  if (!waiting) return null;
  return (
    <div className="rise-in fixed inset-x-4 bottom-24 z-[45] mx-auto max-w-md rounded-2xl border border-gold/45 bg-surface/95 p-4 shadow-2xl backdrop-blur-xl lg:bottom-6" role="status">
      <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold">New Studio Command ready</div>
      <div className="mt-1 text-sm text-paper">Refresh once to move this panel to the new version.</div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })} className="flex-1 rounded-xl bg-gold px-4 py-2.5 text-sm font-semibold text-ink">Tap to refresh</button>
        <button onClick={() => setWaiting(null)} className="rounded-xl border border-line px-4 py-2.5 text-sm text-dim">Later</button>
      </div>
    </div>
  );
}
