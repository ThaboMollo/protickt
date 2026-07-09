import { formatMoney } from "@protickt/shared";
import { env } from "../env.js";

interface TicketEmailParams {
  to: string;
  buyerName: string;
  eventName: string;
  eventStartsAt: string;
  venue: string | null;
  amountCents: number;
  currency: string;
  ticketCodes: string[];
}

/**
 * Sends the ticket email via Resend's REST API. If RESEND_API_KEY is not
 * configured the email is skipped with a log line — the buyer still sees
 * their QR codes on the success page, so email is not on the critical path.
 */
export async function sendTicketEmail(params: TicketEmailParams): Promise<void> {
  const links = params.ticketCodes
    .map((code) => `${env.webUrl}/t/${code}`)
    .map((url, i) => `<li><a href="${url}">Ticket ${i + 1}: ${url}</a></li>`)
    .join("");

  const html = `
    <h2>You're going to ${escapeHtml(params.eventName)}! 🎟️</h2>
    <p>Hi ${escapeHtml(params.buyerName)},</p>
    <p>Your payment of ${formatMoney(params.amountCents, params.currency)} was successful.</p>
    <p><strong>When:</strong> ${new Date(params.eventStartsAt).toLocaleString("en-ZA")}<br/>
    ${params.venue ? `<strong>Where:</strong> ${escapeHtml(params.venue)}<br/>` : ""}</p>
    <p>Your ticket${params.ticketCodes.length > 1 ? "s" : ""}:</p>
    <ul>${links}</ul>
    <p>Open your ticket link and present the QR code at the gate. Don't share it — anyone with the code can use your ticket.</p>
  `;

  if (!env.resendApiKey) {
    console.log(
      `[email] RESEND_API_KEY not set — skipping ticket email to ${params.to} (${params.ticketCodes.length} ticket(s))`,
    );
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.emailFrom,
      to: [params.to],
      subject: `Your ticket for ${params.eventName}`,
      html,
    }),
  });
  if (!res.ok) {
    // Log but never throw: the webhook must still return 200 so tickets stand.
    console.error(`[email] Resend failed (${res.status}): ${await res.text()}`);
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
