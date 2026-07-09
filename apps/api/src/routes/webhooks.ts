import { Router } from "express";
import { supabase } from "../lib/supabase.js";
import {
  isValidWebhookSignature,
  verifyTransaction,
} from "../services/paystack.js";
import { generateTicketCode } from "../lib/ticketCode.js";
import { sendTicketEmail } from "../services/email.js";

export const webhooksRouter = Router();

// POST /webhooks/paystack
// The single source of truth for "paid". Idempotent: the pending→paid
// transition is a conditional UPDATE, so Paystack retries are no-ops.
webhooksRouter.post("/paystack", async (req, res) => {
  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const signature = req.headers["x-paystack-signature"] as string | undefined;

  if (!rawBody || !isValidWebhookSignature(rawBody, signature)) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const payload = req.body as {
    event: string;
    data: { reference: string; amount: number; currency: string };
  };

  if (payload.event === "charge.success") {
    await handleChargeSuccess(payload.data.reference);
  } else if (payload.event === "charge.failed") {
    await supabase()
      .from("orders")
      .update({ status: "failed" })
      .eq("id", payload.data.reference)
      .eq("status", "pending");
  }
  // Unknown events are acknowledged so Paystack stops retrying them.
  res.json({ received: true });
});

async function handleChargeSuccess(reference: string): Promise<void> {
  // Belt and braces: confirm with Paystack directly rather than trusting the
  // webhook body, and check the amount matches what we expect to be paid.
  const verification = await verifyTransaction(reference);
  if (verification.status !== "success") {
    console.warn(`[webhook] charge.success for ${reference} but verify says ${verification.status}`);
    return;
  }

  const { data: order } = await supabase()
    .from("orders")
    .select("id, event_id, buyer_name, buyer_email, quantity, amount_cents, status")
    .eq("id", reference)
    .maybeSingle();

  if (!order) {
    console.warn(`[webhook] no order for reference ${reference}`);
    return;
  }
  if (verification.amount !== order.amount_cents) {
    console.error(
      `[webhook] amount mismatch on ${reference}: paid ${verification.amount}, expected ${order.amount_cents}`,
    );
    return;
  }

  // Atomic pending→paid. Zero rows back = already processed (retry) → stop.
  const { data: updated } = await supabase()
    .from("orders")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("status", "pending")
    .select("id");

  if (!updated || updated.length === 0) return;

  const ticketRows = Array.from({ length: order.quantity }, () => ({
    order_id: order.id,
    event_id: order.event_id,
    code: generateTicketCode(),
  }));

  const { data: tickets, error: ticketError } = await supabase()
    .from("tickets")
    .insert(ticketRows)
    .select("code");

  if (ticketError) {
    // Order is paid but tickets failed — loud log; the success page will show
    // "paid" with no tickets, which support can fix by re-running issuance.
    console.error(`[webhook] ticket issuance failed for order ${order.id}:`, ticketError);
    return;
  }

  const { data: event } = await supabase()
    .from("events")
    .select("name, starts_at, venue, currency")
    .eq("id", order.event_id)
    .single();

  await sendTicketEmail({
    to: order.buyer_email,
    buyerName: order.buyer_name,
    eventName: event?.name ?? "your event",
    eventStartsAt: event?.starts_at ?? new Date().toISOString(),
    venue: event?.venue ?? null,
    amountCents: order.amount_cents,
    currency: event?.currency ?? "ZAR",
    ticketCodes: (tickets ?? []).map((t) => t.code),
  });
}
