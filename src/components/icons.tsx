import React from "react";

/**
 * The Studio Command icon set.
 *
 * One geometry for everything: 24×24 grid, no fills, 1.6 stroke, round joins,
 * drawn in currentColor so an icon always inherits the colour of the thing it
 * belongs to. Emoji were replaced by these because emoji render differently on
 * every phone, tablet and wall panel — and a house that is being trusted with
 * a fire alarm should not look like a chat window.
 */

export interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
  /** Give a label only when the icon is the sole meaning; otherwise it stays decorative. */
  label?: string;
}

function Svg({ size = 20, className, strokeWidth = 1.6, label, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {children}
    </svg>
  );
}

/* ── House & rooms ─────────────────────────────────── */

export const DoorIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 21V4.2A1.2 1.2 0 0 1 6.7 3h10.6a1.2 1.2 0 0 1 1.2 1.2V21" />
    <path d="M3.5 21h17" />
    <circle cx="14.8" cy="12.4" r="1" fill="currentColor" stroke="none" />
  </Svg>
);

export const WindowIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="4" width="16" height="16" rx="1.6" />
    <path d="M12 4v16M4 12h16" />
  </Svg>
);

export const PianoIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="1.6" />
    <path d="M3 13.4h18" />
    <path d="M7.6 13.4V19M12 13.4V19M16.4 13.4V19" />
  </Svg>
);

/* ── Fleet ─────────────────────────────────────────── */

export const MonitorIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4" width="19" height="12.5" rx="2" />
    <path d="M9 20.5h6M12 16.5v4" />
  </Svg>
);

export const ChipIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.4" />
    <rect x="10" y="10" width="4" height="4" rx="0.6" />
    <path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21" />
  </Svg>
);

export const SignIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="4.5" width="19" height="14" rx="2" />
    <path d="M6.6 9.8h10.8M6.6 13.6h6.8" />
  </Svg>
);

export const WifiIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.4 8.6a14.5 14.5 0 0 1 19.2 0" />
    <path d="M5.8 12.4a9.5 9.5 0 0 1 12.4 0" />
    <path d="M9.2 16.2a4.6 4.6 0 0 1 5.6 0" />
    <circle cx="12" cy="19.6" r="1.05" fill="currentColor" stroke="none" />
  </Svg>
);

export const PlugIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 3v5.5M15 3v5.5" />
    <path d="M6.2 8.5h11.6v3.1a5.8 5.8 0 0 1-11.6 0V8.5Z" />
    <path d="M12 17.4V21" />
  </Svg>
);

/* ── Safety & state ────────────────────────────────── */

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3.6 2.6 20.2h18.8L12 3.6Z" />
    <path d="M12 10v4.4" />
    <circle cx="12" cy="17.4" r="0.95" fill="currentColor" stroke="none" />
  </Svg>
);

export const RecordIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.2" />
    <circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none" />
  </Svg>
);

/* ── Scenes ────────────────────────────────────────── */

export const ClapperIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="8.2" width="18" height="12.6" rx="1.6" />
    <path d="m3.4 8.2 1.1-3.7 16 1.9-.3 3" />
    <path d="m9.2 7.4.8-3.3M14.4 8 15.2 4.7" />
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.2 14.6A8.6 8.6 0 0 1 9.4 3.8a8.6 8.6 0 1 0 10.8 10.8Z" />
  </Svg>
);

export const MicIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0" />
    <path d="M12 17.8V21" />
  </Svg>
);

export const HeadphonesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.2 15.4v-3.2a7.8 7.8 0 0 1 15.6 0v3.2" />
    <rect x="2.2" y="13.8" width="4.6" height="6.8" rx="1.7" />
    <rect x="17.2" y="13.8" width="4.6" height="6.8" rx="1.7" />
  </Svg>
);

export const BulbIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.2 1.1 2h5a2.6 2.6 0 0 1 1.1-2A6 6 0 0 0 12 3Z" />
    <path d="M10 19.2h4M10.8 21.4h2.4" />
  </Svg>
);

export const CoffeeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 8h12v5.6a5 5 0 0 1-10 0V8Z" />
    <path d="M16.5 9.4h1.3a2.5 2.5 0 0 1 0 5h-1.3" />
    <path d="M4 20.5h13.5" />
  </Svg>
);

export const NoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 17.4V5.6l10-1.9v11.7" />
    <circle cx="6.6" cy="17.6" r="2.6" />
    <circle cx="16.6" cy="15.6" r="2.6" />
  </Svg>
);

/** Two prongs and a stem — the A440 reference. */
export const TuningForkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 3v6.8a4 4 0 0 0 8 0V3" />
    <path d="M12 13.8V21" />
  </Svg>
);

/* ── Controls ──────────────────────────────────────── */

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14.5 5.8-6.2 6.2 6.2 6.2" />
  </Svg>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m9.5 5.8 6.2 6.2-6.2 6.2" />
  </Svg>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5.8 9.5 6.2 6.2 6.2-6.2" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3.8 12h15.4" />
    <path d="m13.4 6.2 5.8 5.8-5.8 5.8" />
  </Svg>
);

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8.2 5.4v13.2L19 12 8.2 5.4Z" />
  </Svg>
);

export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 12a8 8 0 1 1-2.5-5.8" />
    <path d="M20.2 4.2v5.4h-5.4" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6.2 6.2 11.6 11.6M17.8 6.2 6.2 17.8" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 12.4 4.6 4.6L19 7.4" />
  </Svg>
);

export const PendingIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="5.6" cy="12" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
    <circle cx="18.4" cy="12" r="1.15" fill="currentColor" stroke="none" />
  </Svg>
);

/* ── Scene icon registry ───────────────────────────── */

export type SceneIconKey =
  | "clapper"
  | "piano"
  | "moon"
  | "mic"
  | "headphones"
  | "bulb"
  | "coffee"
  | "note"
  | "record"
  | "door";

export const SCENE_ICONS: Record<SceneIconKey, (p: IconProps) => React.JSX.Element> = {
  clapper: ClapperIcon,
  piano: PianoIcon,
  moon: MoonIcon,
  mic: MicIcon,
  headphones: HeadphonesIcon,
  bulb: BulbIcon,
  coffee: CoffeeIcon,
  note: NoteIcon,
  record: RecordIcon,
  door: DoorIcon,
};

export const SCENE_ICON_KEYS = Object.keys(SCENE_ICONS) as SceneIconKey[];

/** Scenes saved before the icon set existed still hold an emoji — map those across. */
const LEGACY_EMOJI: Record<string, SceneIconKey> = {
  "🎬": "clapper",
  "🎹": "piano",
  "🌙": "moon",
  "🎙️": "mic",
  "🎙": "mic",
  "🎧": "headphones",
  "💡": "bulb",
  "☕": "coffee",
  "🎸": "note",
  "🎼": "note",
  "🔴": "record",
  "🚪": "door",
};

export function resolveSceneIcon(key: string): (p: IconProps) => React.JSX.Element {
  if (key in SCENE_ICONS) return SCENE_ICONS[key as SceneIconKey];
  const legacy = LEGACY_EMOJI[key];
  return legacy ? SCENE_ICONS[legacy] : NoteIcon;
}

/** Renders whatever a scene has stored — new key or old emoji — as a real icon. */
export function SceneIcon({ icon, ...rest }: IconProps & { icon: string }) {
  const Cmp = resolveSceneIcon(icon);
  return <Cmp {...rest} />;
}
