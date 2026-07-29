import React, { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Small QR badge on the door display → the live /#/guest visitor page.
 * Rendered locally (no network); regenerates only if the origin changes.
 */
export default function GuestQr() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const target = `${window.location.origin}${window.location.pathname}#/guest`;
    QRCode.toDataURL(target, { margin: 1, width: 132, color: { dark: "#14121c", light: "#f5f2ec" } })
      .then(setUrl)
      .catch(() => setUrl(null));
  }, []);
  if (!url) return null;
  return (
    <div className="mt-10 flex items-center gap-3 rounded-2xl border border-line bg-surface/80 px-4 py-2.5 backdrop-blur">
      <img src={url} alt="Scan for live visitor info" className="h-16 w-16 rounded-lg" />
      <div className="text-left">
        <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-gold">Visiting?</div>
        <div className="mt-0.5 max-w-[180px] text-xs leading-snug text-paper/85">Scan for live status while you wait — nothing to install</div>
      </div>
    </div>
  );
}
