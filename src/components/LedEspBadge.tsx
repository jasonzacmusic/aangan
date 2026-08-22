import { useEffect, useState } from "react";
import { doorStatus, type DoorStatus } from "../api/ledesp";

/**
 * Honest status for the two devices at the studio door.
 *
 * It reports each one separately because they fail separately: the screen can
 * be fine while the strip is unplugged, and saying "door light unreachable"
 * about that is worse than saying nothing. A device that has never checked in
 * on this serverless instance shows as unknown rather than faulty — not the
 * same thing, and claiming a fault that is not there costs trust.
 */
const DOT = {
  on: { fill: "#35d07f", glow: "0 0 7px rgba(53,208,127,.85)" },
  off: { fill: "#e0484d", glow: "none" },
  unknown: { fill: "#7a7a84", glow: "none" },
};

function Dot({ state }: { state: boolean | null }) {
  const look = state === null ? DOT.unknown : state ? DOT.on : DOT.off;
  return (
    <span
      style={{
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: look.fill,
        boxShadow: look.glow,
        display: "inline-block",
        marginRight: 5,
      }}
    />
  );
}

export default function LedEspBadge() {
  const [s, setS] = useState<DoorStatus | null>(null);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const next = await doorStatus();
      if (alive) setS(next);
    };
    void check();
    const t = setInterval(check, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const word = (v: boolean | null) => (v === null ? "unknown" : v ? "live" : "not answering");
  const title = !s?.reachable
    ? "Cannot reach the door service"
    : `Strip ${word(s.strip)} · Screen ${word(s.screen)}` +
      (s.dba != null ? ` · ${s.dba} dBA at the door` : "");

  return (
    <a
      href="/door.html"
      title={title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "5px 12px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: ".02em",
        textDecoration: "none",
        color: "#d8d8de",
        background: "rgba(255,255,255,.06)",
        border: "1px solid rgba(255,255,255,.13)",
      }}
    >
      {!s?.reachable ? (
        <span><Dot state={false} />door offline</span>
      ) : (
        <>
          <span><Dot state={s.strip} />strip</span>
          <span><Dot state={s.screen} />screen</span>
        </>
      )}
    </a>
  );
}
