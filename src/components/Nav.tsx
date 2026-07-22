import React from "react";

export type Tab = "command" | "home" | "preflight" | "displays" | "safety" | "settings";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  {
    id: "command",
    label: "Command",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 12 L16.5 7.5" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    id: "home",
    label: "Home",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5.5 9v11h13V9" />
        <path d="M10 20v-5h4v5" />
      </svg>
    ),
  },
  {
    id: "preflight",
    label: "Pre-flight",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="8.5" />
        <path d="m8.5 12.2 2.4 2.4 4.6-5" />
      </svg>
    ),
  },
  {
    id: "displays",
    label: "Displays",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4.5" width="18" height="12.5" rx="2" />
        <path d="M9 20.5h6M12 17v3.5" />
      </svg>
    ),
  },
  {
    id: "safety",
    label: "Safety",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3 20 6v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6Z" />
      </svg>
    ),
  },
  {
    id: "settings",
    label: "Settings",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
        <path d="M4 8h10M18 8h2M4 16h2M10 16h10" />
        <circle cx="16" cy="8" r="2.2" />
        <circle cx="8" cy="16" r="2.2" />
      </svg>
    ),
  },
];

interface Props {
  tab: Tab;
  setTab: (t: Tab) => void;
}

/** Bottom bar on phones, calm left rail on iPad / large screens. */
export default function Nav({ tab, setTab }: Props) {
  return (
    <>
      {/* Phone: bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/85 backdrop-blur-xl safe-bottom lg:hidden">
        <div className="mx-auto flex max-w-md items-stretch justify-around">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 transition-colors ${tab === t.id ? "text-gold" : "text-dim"}`}
            >
              {t.icon}
              <span className="font-mono text-[9px] uppercase tracking-[0.18em]">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>

      {/* iPad / wall panel: left rail */}
      <nav className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-line bg-ink/70 px-4 pb-8 pt-10 backdrop-blur-xl lg:flex">
        <img src="/nsm-white.png" alt="Nathaniel School of Music" className="mb-1 w-36 self-start opacity-90" />
        <div className="mb-10 font-mono text-[10px] uppercase tracking-[0.32em] text-gold">Studio Command</div>
        <div className="flex flex-col gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-current={tab === t.id ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left text-sm transition-colors ${
                tab === t.id ? "bg-surface text-gold" : "text-dim hover:text-paper"
              }`}
            >
              {t.icon}
              <span className="font-medium">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="mt-auto font-mono text-[9px] leading-relaxed text-dim/70">
          Nathaniel School of Music
          <br />
          Bangalore · studio.local
        </div>
      </nav>
    </>
  );
}
