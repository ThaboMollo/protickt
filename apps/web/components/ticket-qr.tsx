"use client";

import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

/**
 * Renders the ticket QR. The QR encodes the ticket URL so a phone camera
 * opens the ticket page, while the gate scanner extracts the code from it.
 */
export function TicketQr({ code }: { code: string }) {
  const [origin, setOrigin] = useState<string | null>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  if (!origin) return <div className="qr" style={{ width: 232, height: 232 }} />;

  return (
    <div className="qr">
      <QRCodeSVG value={`${origin}/t/${code}`} size={200} marginSize={0} />
    </div>
  );
}
