import { useEffect, useState } from "react";
import { LEDESP_URL, ledespLink, type LinkStatus } from "../api/ledesp";

/**
 * Honest status for the door light.
 *
 * When the light does not follow the app it is almost never the app — it is
 * the network, or the board is unplugged. So name which road is open instead
 * of failing quietly, and let it be tapped to open the board directly.
 */
const LOOK: Record<LinkStatus | "checking", { label: string; fg: string; bg: string; edge: string; dot: string }> = {
  checking: { label: "Door light · checking", fg: "#b9b9c2", bg: "rgba(255,255,255,.06)", edge: "rgba(255,255,255,.14)", dot: "#8a8a94" },
  direct:   { label: "Door light · live",     fg: "#7ee2a8", bg: "rgba(46,160,97,.13)",   edge: "rgba(46,160,97,.35)",  dot: "#35d07f" },
  relay:    { label: "Door light · via cloud", fg: "#8ec8ff", bg: "rgba(56,120,220,.14)", edge: "rgba(56,120,220,.4)",  dot: "#5b9dff" },
  down:     { label: "Door light · unreachable", fg: "#ff9b9b", bg: "rgba(185,28,28,.15)", edge: "rgba(185,28,28,.4)",  dot: "#e0484d" },
};

export default function LedEspBadge() {
  const [link, setLink] = useState<LinkStatus | "checking">("checking");

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const l = await ledespLink();
      if (alive) setLink(l);
    };
    void check();
    const t = setInterval(check, 6000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  const look = LOOK[link];
  const title =
    link === "direct" ? `Talking straight to ${LEDESP_URL} on the house Wi-Fi`
    : link === "relay" ? "The board is polling the app over the internet"
    : link === "down" ? "Nothing is answering at the door — check the board's power, and any VPN blocking local network"
    : "Looking for the door light";

  return (
    <a
      href={LEDESP_URL || "/api/door"}
      target="_blank"
      rel="noreferrer"
      title={title}
      style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "5px 11px 5px 9px", borderRadius: 999,
        fontSize: 12, fontWeight: 600, letterSpacing: ".01em",
        textDecoration: "none", color: look.fg,
        background: look.bg, border: `1px solid ${look.edge}`,
      }}
    >
      <span style={{
        width: 8, height: 8, borderRadius: "50%", background: look.dot,
        boxShadow: link === "direct" ? "0 0 8px rgba(53,208,127,.8)" : "none",
      }} />
      {look.label}
    </a>
  );
}
