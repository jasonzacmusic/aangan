import { useEffect, useState } from "react";
import { LEDESP_URL, ledespEnabled, ledespReachable } from "../api/ledesp";

/**
 * Honest status for the door light board.
 *
 * The board is a separate machine on the Wi-Fi. When the app cannot reach it,
 * that is almost never a bug in the app — it is the network, or the board is
 * unplugged. So say which, out loud, instead of failing silently.
 */
export default function LedEspBadge() {
  const [live, setLive] = useState<boolean | null>(null);

  useEffect(() => {
    if (!ledespEnabled) return;
    let alive = true;
    const check = async () => {
      const ok = await ledespReachable();
      if (alive) setLive(ok);
    };
    void check();
    const t = setInterval(check, 5000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  if (!ledespEnabled) return null;

  const label =
    live === null ? "Door light · checking" : live ? "Door light · live" : "Door light · unreachable";

  return (
    <a
      href={LEDESP_URL}
      target="_blank"
      rel="noreferrer"
      title={live ? `Connected to ${LEDESP_URL}` : `No answer from ${LEDESP_URL} — open it in this browser to test`}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        padding: "5px 11px 5px 9px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: "0.01em",
        textDecoration: "none",
        color: live ? "#7ee2a8" : live === null ? "#b9b9c2" : "#ff9b9b",
        background: live ? "rgba(46,160,97,.13)" : live === null ? "rgba(255,255,255,.06)" : "rgba(185,28,28,.15)",
        border: `1px solid ${live ? "rgba(46,160,97,.35)" : live === null ? "rgba(255,255,255,.14)" : "rgba(185,28,28,.4)"}`,
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: live ? "#35d07f" : live === null ? "#8a8a94" : "#e0484d",
          boxShadow: live ? "0 0 8px rgba(53,208,127,.8)" : "none",
        }}
      />
      {label}
    </a>
  );
}
