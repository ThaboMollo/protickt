import { notFound } from "next/navigation";
import type { TicketViewResponse } from "@protickt/shared";
import { apiGet } from "../../../lib/api";
import { TicketQr } from "../../../components/ticket-qr";

export default async function TicketPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const ticket = await apiGet<TicketViewResponse>(
    `/tickets/${encodeURIComponent(code)}`,
  );
  if (!ticket) notFound();

  return (
    <div className="card ticket-card">
      <h1>{ticket.event.name}</h1>
      <div className="pills">
        <span className="pill">
          📅 {new Date(ticket.event.starts_at).toLocaleString("en-ZA", { dateStyle: "full", timeStyle: "short" })}
        </span>
        {ticket.event.venue && (
          <span className="pill">📍 {ticket.event.venue}</span>
        )}
      </div>
      <p className="meta">Ticket holder: {ticket.buyer_name}</p>

      {ticket.status === "valid" && (
        <>
          <TicketQr code={ticket.code} />
          <p className="ticket-code">{ticket.code}</p>
          <p className="meta">
            Show this QR code at the gate. Don&apos;t share it — anyone with
            this code can use your ticket.
          </p>
        </>
      )}

      {ticket.status === "checked_in" && (
        <p className="status-ok">
          ✅ Checked in
          {ticket.checked_in_at &&
            ` at ${new Date(ticket.checked_in_at).toLocaleString("en-ZA")}`}
        </p>
      )}

      {ticket.status === "void" && (
        <p className="status-bad">This ticket has been voided.</p>
      )}
    </div>
  );
}
