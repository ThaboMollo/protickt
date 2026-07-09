"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { formatMoney, type OrderStatusResponse } from "@protickt/shared";
import { API_URL } from "../../lib/api";
import { TicketQr } from "../../components/ticket-qr";

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 45; // ~90s: webhooks normally land within seconds

export function SuccessContent() {
  const orderId = useSearchParams().get("order");
  const [order, setOrder] = useState<OrderStatusResponse | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!orderId) return;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      polls += 1;
      try {
        const res = await fetch(`${API_URL}/orders/${orderId}`);
        if (res.ok) {
          const data = (await res.json()) as OrderStatusResponse;
          setOrder(data);
          // Keep polling while payment confirmation is still in flight.
          if (data.status !== "pending") return;
        }
      } catch {
        // transient network error — keep polling
      }
      if (polls < MAX_POLLS) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      } else {
        setTimedOut(true);
      }
    }

    poll();
    return () => clearTimeout(timer);
  }, [orderId]);

  if (!orderId) {
    return <p className="error">Missing order reference.</p>;
  }

  if (!order || order.status === "pending") {
    return (
      <div className="card" style={{ textAlign: "center" }}>
        <h1>Confirming your payment…</h1>
        <p className="meta">
          This usually takes a few seconds. Don&apos;t close this page.
        </p>
        {timedOut && (
          <p className="error">
            We haven&apos;t received payment confirmation yet. If you paid,
            check your email — your tickets will arrive there — or refresh
            this page in a minute.
          </p>
        )}
      </div>
    );
  }

  if (order.status !== "paid") {
    return (
      <div className="card">
        <h1 className="status-bad">Payment {order.status}</h1>
        <p className="meta">
          Your payment didn&apos;t go through. You can go back to the event
          page and try again — no money was taken for this order.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="card">
        <h1 className="status-ok">You&apos;re in! 🎉</h1>
        <p className="meta">
          {order.quantity} ticket{order.quantity > 1 ? "s" : ""} for{" "}
          <strong>{order.event.name}</strong> —{" "}
          {formatMoney(order.amount_cents, order.currency)} paid.
        </p>
        <p className="meta">
          We&apos;ve also emailed your ticket link{order.quantity > 1 ? "s" : ""}.
          Show the QR code at the gate.
        </p>
      </div>

      {(order.tickets ?? []).map((ticket, i) => (
        <div className="card ticket-card" key={ticket.code}>
          <h2 style={{ margin: 0 }}>Ticket {i + 1}</h2>
          <TicketQr code={ticket.code} />
          <p className="ticket-code">{ticket.code}</p>
        </div>
      ))}
    </>
  );
}
