import { Router } from "express";
import {
  checkoutInputSchema,
  PENDING_ORDER_TTL_MINUTES,
  type OrderStatusResponse,
  type PublicEvent,
  type TicketViewResponse,
} from "@protickt/shared";
import { env } from "../env.js";
import { supabase } from "../lib/supabase.js";
import { initializeTransaction } from "../services/paystack.js";

export const publicRouter = Router();

// GET /events/:slug — public event page data (published events only).
publicRouter.get("/events/:slug", async (req, res) => {
  const { data: event, error } = await supabase()
    .from("events")
    .select(
      "id, slug, name, description, venue, starts_at, price_cents, currency, capacity, flyer_url, created_at",
    )
    .eq("slug", req.params.slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) throw error;
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const { data: taken } = await supabase().rpc("seats_taken", {
    p_event_id: event.id,
    p_pending_ttl_minutes: PENDING_ORDER_TTL_MINUTES,
  });

  const sold_out =
    event.capacity != null && (taken as number ?? 0) >= event.capacity;

  res.json({ ...(event as PublicEvent), sold_out });
});

// POST /checkout — create a pending order and a Paystack checkout session.
publicRouter.post("/checkout", async (req, res) => {
  const parsed = checkoutInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }
  const input = parsed.data;

  const { data: event } = await supabase()
    .from("events")
    .select("id, name, slug, price_cents, currency, capacity, status")
    .eq("slug", input.event_slug)
    .maybeSingle();

  if (!event || event.status !== "published") {
    res.status(404).json({ error: "Event not found or not open for sales" });
    return;
  }

  if (event.capacity != null) {
    const { data: taken } = await supabase().rpc("seats_taken", {
      p_event_id: event.id,
      p_pending_ttl_minutes: PENDING_ORDER_TTL_MINUTES,
    });
    if (((taken as number) ?? 0) + input.quantity > event.capacity) {
      res.status(409).json({ error: "Not enough tickets left" });
      return;
    }
  }

  const amountCents = event.price_cents * input.quantity;

  const { data: order, error: orderError } = await supabase()
    .from("orders")
    .insert({
      event_id: event.id,
      buyer_name: input.buyer_name,
      buyer_email: input.buyer_email,
      buyer_phone: input.buyer_phone ?? null,
      quantity: input.quantity,
      amount_cents: amountCents,
      status: "pending",
    })
    .select("id")
    .single();

  if (orderError) throw orderError;

  try {
    // The order id doubles as the Paystack reference: webhook → reference → order.
    const init = await initializeTransaction({
      email: input.buyer_email,
      amountCents,
      currency: event.currency,
      reference: order.id,
      callbackUrl: `${env.webUrl}/success?order=${order.id}`,
      metadata: { event_slug: event.slug, event_name: event.name },
    });

    await supabase()
      .from("orders")
      .update({ paystack_ref: init.reference })
      .eq("id", order.id);

    res.json({ order_id: order.id, authorization_url: init.authorization_url });
  } catch (err) {
    await supabase().from("orders").update({ status: "failed" }).eq("id", order.id);
    console.error("[checkout] Paystack initialize failed:", err);
    res.status(502).json({ error: "Payment provider unavailable, please try again" });
  }
});

// GET /orders/:id — polled by the success page. Order id is an unguessable
// uuid; knowing it grants access to this order's ticket codes (v1 tradeoff).
publicRouter.get("/orders/:id", async (req, res) => {
  const { data: order } = await supabase()
    .from("orders")
    .select(
      "id, status, buyer_name, quantity, amount_cents, events ( name, starts_at, venue, currency )",
    )
    .eq("id", req.params.id)
    .maybeSingle();

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  const event = order.events as unknown as {
    name: string;
    starts_at: string;
    venue: string | null;
    currency: string;
  };

  const response: OrderStatusResponse = {
    id: order.id,
    status: order.status,
    event: { name: event.name, starts_at: event.starts_at, venue: event.venue },
    buyer_name: order.buyer_name,
    quantity: order.quantity,
    amount_cents: order.amount_cents,
    currency: event.currency,
  };

  if (order.status === "paid") {
    const { data: tickets } = await supabase()
      .from("tickets")
      .select("code, status")
      .eq("order_id", order.id)
      .order("created_at");
    response.tickets = tickets ?? [];
  }

  res.json(response);
});

// GET /tickets/:code — renders the buyer's ticket page (/t/<code>).
publicRouter.get("/tickets/:code", async (req, res) => {
  const { data: ticket } = await supabase()
    .from("tickets")
    .select(
      "code, status, checked_in_at, orders ( buyer_name ), events ( name, starts_at, venue )",
    )
    .eq("code", req.params.code)
    .maybeSingle();

  if (!ticket) {
    res.status(404).json({ error: "Ticket not found" });
    return;
  }

  const order = ticket.orders as unknown as { buyer_name: string };
  const event = ticket.events as unknown as {
    name: string;
    starts_at: string;
    venue: string | null;
  };

  const response: TicketViewResponse = {
    code: ticket.code,
    status: ticket.status,
    checked_in_at: ticket.checked_in_at,
    buyer_name: order.buyer_name,
    event,
  };
  res.json(response);
});
