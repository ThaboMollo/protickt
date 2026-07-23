import { Router, type Request, type Response } from "express";
import { supabase } from "../lib/supabase.js";
import {
  isValidWebhookSignature,
  verifyTransaction,
} from "../services/paystack.js";
import { generateTicketCode } from "../lib/ticketCode.js";
import { sendTicketEmail } from "../services/email.js";
import { getOrgBySlug, orgPaystackSecret, type OrgRow } from "../lib/orgs.js";

export const webhooksRouter = Router();

// POST /webhooks/paystack/:orgSlug
// Each organization configures this URL (with their slug) in their own
// Paystack dashboard; signatures are verified with that org's secret key.
webhooksRouter.post("/paystack/:orgSlug", (req, res) =>
  handlePaystackWebhook(req.params.orgSlug as string, req, res),
);

// Legacy path from before per-org Paystack accounts. Keep until the original
// Paystack dashboard webhook is repointed to /webhooks/paystack/protickt.
webhooksRouter.post("/paystack", (req, res) =>
  handlePaystackWebhook("protickt", req, res),
);

// The single source of truth for "paid". Idempotent: the pending→paid
// transition is a conditional UPDATE, so Paystack retries are no-ops.
async function handlePaystackWebhook(
  orgSlug: string,
  req: Request,
  res: Response,
): Promise<void> {
  const org = await getOrgBySlug(orgSlug);
  const secretKey = org ? orgPaystackSecret(org) : null;

  const rawBody = (req as { rawBody?: Buffer }).rawBody;
  const signature = req.headers["x-paystack-signature"] as string | undefined;

  if (
    !org ||
    !secretKey ||
    !rawBody ||
    !isValidWebhookSignature(secretKey, rawBody, signature)
  ) {
    res.status(401).json({ error: "Invalid signature" });
    return;
  }

  const payload = req.body as {
    event: string;
    data: { reference: string; amount: number; currency: string };
  };

  if (payload.event === "charge.success") {
    await handleChargeSuccess(org, secretKey, payload.data.reference);
  } else if (payload.event === "charge.failed") {
    // Scoped to the org: a valid signature from tenant A must not be able
    // to flip tenant B's orders.
    const { data: order } = await supabase()
      .from("orders")
      .select("id, events!inner ( organization_id )")
      .eq("id", payload.data.reference)
      .maybeSingle();
    const orderOrg = (order?.events as unknown as { organization_id: string } | null)
      ?.organization_id;
    if (order && orderOrg === org.id) {
      await supabase()
        .from("orders")
        .update({ status: "failed" })
        .eq("id", order.id)
        .eq("status", "pending");
    }
  }
  // Unknown events are acknowledged so Paystack stops retrying them.
  res.json({ received: true });
}

async function handleChargeSuccess(
  org: OrgRow,
  secretKey: string,
  reference: string,
): Promise<void> {
  // Belt and braces: confirm with Paystack directly rather than trusting the
  // webhook body, and check the amount matches what we expect to be paid.
  const verification = await verifyTransaction(secretKey, reference);
  if (verification.status !== "success") {
    console.warn(`[webhook] charge.success for ${reference} but verify says ${verification.status}`);
    return;
  }

  const { data: order } = await supabase()
    .from("orders")
    .select(
      "id, event_id, buyer_name, buyer_email, quantity, amount_cents, status, events!inner ( organization_id )",
    )
    .eq("id", reference)
    .maybeSingle();

  if (!order) {
    console.warn(`[webhook] no order for reference ${reference}`);
    return;
  }
  const eventOrg = (order.events as unknown as { organization_id: string })
    .organization_id;
  if (eventOrg !== org.id) {
    // A validly-signed webhook from one tenant's Paystack account naming
    // another tenant's order is a replay/misconfiguration — never honour it.
    console.error(
      `[webhook] org mismatch: ${org.slug} webhook referenced order ${reference} of another org`,
    );
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
    org: {
      name: org.name,
      site_url: org.site_url,
      support_email: org.support_email,
    },
  });
}
