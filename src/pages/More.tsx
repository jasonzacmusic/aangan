import React from "react";
import type { Tab } from "../components/Nav";
import { AlertIcon, ChipIcon, MonitorIcon } from "../components/icons";
import { useStore } from "../state/store";

export default function More({ onOpen }: { onOpen: (tab: Tab) => void }) {
  const { preflight, safety, displays, connectionStatus } = useStore();
  const safetyAlert = safety && Object.values(safety).some(Boolean);
  const items: Array<{ tab: Tab; title: string; detail: string; status: string; icon: React.ReactNode; warn?: boolean }> = [
    {
      tab: "setup",
      title: "Install & test",
      detail: "Breadboard wiring, flash order, and physical test steps",
      status: preflight?.sensorsHealthy ? "critical nodes online" : "commissioning needed",
      icon: <ChipIcon size={22} />,
      warn: !preflight?.sensorsHealthy,
    },
    {
      tab: "displays",
      title: "Displays",
      detail: "Door signs, wall panels, and delivery OTP",
      status: `${displays.length} configured`,
      icon: <MonitorIcon size={22} />,
    },
    {
      tab: "settings",
      title: "Settings",
      detail: "Recording threshold, alerts, air limits, and scenes",
      status: connectionStatus,
      icon: <AlertIcon size={22} />,
      warn: connectionStatus !== "online",
    },
  ];

  return (
    <div className="rise-in page-shell page-shell--narrow">
      <h2 className="font-display mb-1 text-2xl lg:text-3xl">More</h2>
      <p className="mb-5 font-mono text-[11px] text-dim">setup · screens · preferences</p>

      {safetyAlert && (
        <button onClick={() => onOpen("safety")} className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-st-audio/50 bg-st-audio/10 p-4 text-left text-st-audio">
          <AlertIcon size={22} />
          <span className="flex-1 font-semibold">A safety input is active</span>
          <span className="font-mono text-[9px] uppercase tracking-wider">Open safety</span>
        </button>
      )}

      {/* The studio door. These are plain pages rather than tabs because they
          also have to open on an old iPad by the door and on whichever phone is
          nearest, so they must not depend on this app's bundle running. Linked
          from here so the door is reachable from inside Aangan and nobody has
          to be handed a URL. */}
      <div className="mb-3 space-y-3">
        <a
          href="/door.html"
          className="lift flex min-h-24 w-full items-center gap-4 rounded-2xl border border-line bg-surface/80 p-4 text-left no-underline backdrop-blur active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface2 text-gold">
            <MonitorIcon size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl text-paper">Studio door</span>
            <span className="mt-1 block text-xs text-dim">Set the light and the sign, and write a message on the door</span>
            <span className="mt-2 block font-mono text-[9px] uppercase tracking-wider text-st-available">strip + screen</span>
          </span>
          <span aria-hidden className="text-xl text-dim">›</span>
        </a>
        <a
          href="/sign.html"
          target="_blank"
          rel="noreferrer"
          className="lift flex min-h-24 w-full items-center gap-4 rounded-2xl border border-line bg-surface/80 p-4 text-left no-underline backdrop-blur active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface2 text-gold">
            <MonitorIcon size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl text-paper">The door sign</span>
            <span className="mt-1 block text-xs text-dim">What the door shows. Put this on the iPad by the studio</span>
            <span className="mt-2 block font-mono text-[9px] uppercase tracking-wider text-dim">opens full screen</span>
          </span>
          <span aria-hidden className="text-xl text-dim">›</span>
        </a>
        <a
          href="/team.html"
          className="lift flex min-h-24 w-full items-center gap-4 rounded-2xl border border-line bg-surface/80 p-4 text-left no-underline backdrop-blur active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface2 text-gold">
            <ChipIcon size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-xl text-paper">Send to the team</span>
            <span className="mt-1 block text-xs text-dim">One page with both links and QR codes to scan</span>
            <span className="mt-2 block font-mono text-[9px] uppercase tracking-wider text-dim">shareable</span>
          </span>
          <span aria-hidden className="text-xl text-dim">›</span>
        </a>
      </div>

      <div className="space-y-3">
        {items.map((item) => (
          <button key={item.tab} onClick={() => onOpen(item.tab)} className="lift flex min-h-24 w-full items-center gap-4 rounded-2xl border border-line bg-surface/80 p-4 text-left backdrop-blur active:scale-[0.99]">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface2 text-gold">{item.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-xl">{item.title}</span>
              <span className="mt-1 block text-xs text-dim">{item.detail}</span>
              <span className={`mt-2 block font-mono text-[9px] uppercase tracking-wider ${item.warn ? "text-st-meeting" : "text-st-available"}`}>{item.status}</span>
            </span>
            <span aria-hidden className="text-xl text-dim">›</span>
          </button>
        ))}
      </div>
    </div>
  );
}
