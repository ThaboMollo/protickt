import { Router } from "express";
import {
  checkinInputSchema,
  eventInputSchema,
  eventUpdateSchema,
  extractTicketCode,
  FLYER_BUCKET,
  FLYER_EXTENSIONS,
  flyerUploadInputSchema,
  type CheckinResponse,
  type EventStats,
  type FlyerUploadUrlResponse,
  type ScanResult,
} from "@protickt/shared";
import { supabase } from "../lib/supabase.js";
import { requireAdmin } from "../middleware/adminAuth.js";

export const adminRouter = Router();

adminRouter.use(requireAdmin);

// GET /admin/events
adminRouter.get("/events", async (_req, res) => {
  const { data, error } = await supabase()
    .from("events")
    .select("*")
    .order("starts_at", { ascending: false });
  if (error) throw error;
  res.json(data);
});

// POST /admin/events
adminRouter.post("/events", async (req, res) => {
  const parsed = eventInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabase()
    .from("events")
    .insert({ ...parsed.data, created_by: req.adminId })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "That slug is already taken" });
      return;
    }
    throw error;
  }
  res.status(201).json(data);
});

// GET /admin/events/:id
adminRouter.get("/events/:id", async (req, res) => {
  const { data } = await supabase()
    .from("events")
    .select("*")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!data) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(data);
});

// PATCH /admin/events/:id
adminRouter.patch("/events/:id", async (req, res) => {
  const parsed = eventUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabase()
    .from("events")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "That slug is already taken" });
      return;
    }
    throw error;
  }
  if (!data) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(data);
});

// POST /admin/events/:id/flyer-upload-url — mint a signed storage upload URL.
// The admin app uploads the flyer straight to the bucket with the returned
// token, then PATCHes the event with public_url. Timestamped paths mean a
// replacement never fights CDN caching of the old file.
adminRouter.post("/events/:id/flyer-upload-url", async (req, res) => {
  const parsed = flyerUploadInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { data: event } = await supabase()
    .from("events")
    .select("id")
    .eq("id", req.params.id)
    .maybeSingle();
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }

  const path = `${event.id}/${Date.now()}.${FLYER_EXTENSIONS[parsed.data.content_type]}`;
  const bucket = supabase().storage.from(FLYER_BUCKET);

  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error) throw error;

  res.json({
    path,
    token: data.token,
    public_url: bucket.getPublicUrl(path).data.publicUrl,
  } satisfies FlyerUploadUrlResponse);
});

// GET /admin/events/:id/stats
adminRouter.get("/events/:id/stats", async (req, res) => {
  const eventId = req.params.id;

  const [sold, checkedIn, paidOrders] = await Promise.all([
    supabase()
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("status", ["valid", "checked_in"]),
    supabase()
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "checked_in"),
    supabase()
      .from("orders")
      .select("amount_cents")
      .eq("event_id", eventId)
      .eq("status", "paid"),
  ]);

  const stats: EventStats = {
    tickets_sold: sold.count ?? 0,
    checked_in: checkedIn.count ?? 0,
    orders_paid: paidOrders.data?.length ?? 0,
    revenue_cents: (paidOrders.data ?? []).reduce(
      (sum, o) => sum + o.amount_cents,
      0,
    ),
  };
  res.json(stats);
});

// GET /admin/events/:id/orders — who bought tickets for this event.
adminRouter.get("/events/:id/orders", async (req, res) => {
  const { data, error } = await supabase()
    .from("orders")
    .select("id, buyer_name, buyer_email, buyer_phone, quantity, amount_cents, status, created_at, paid_at")
    .eq("event_id", req.params.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  res.json(data);
});

// POST /admin/checkin — the gate scan. One atomic UPDATE makes double
// check-in impossible even with several gates scanning concurrently.
adminRouter.post("/checkin", async (req, res) => {
  const parsed = checkinInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const code = extractTicketCode(parsed.data.code);
  if (!code) {
    await logScan(parsed.data.code.slice(0, 200), null, "not_found", req.adminId!);
    res.json({ result: "not_found" } satisfies CheckinResponse);
    return;
  }

  let query = supabase()
    .from("tickets")
    .update({
      status: "checked_in",
      checked_in_at: new Date().toISOString(),
      checked_in_by: req.adminId,
    })
    .eq("code", code)
    .eq("status", "valid");

  if (parsed.data.event_id) {
    query = query.eq("event_id", parsed.data.event_id);
  }

  const { data: updated, error } = await query.select(
    "id, code, checked_in_at, orders ( buyer_name ), events ( name )",
  );
  if (error) throw error;

  if (updated && updated.length === 1) {
    const ticket = updated[0];
    await logScan(code, ticket.id, "ok", req.adminId!);
    res.json({
      result: "ok",
      ticket: {
        code: ticket.code,
        buyer_name: (ticket.orders as unknown as { buyer_name: string }).buyer_name,
        event_name: (ticket.events as unknown as { name: string }).name,
        checked_in_at: ticket.checked_in_at,
      },
    } satisfies CheckinResponse);
    return;
  }

  // Zero rows: find out why for an honest red screen.
  const { data: existing } = await supabase()
    .from("tickets")
    .select("id, code, status, event_id, checked_in_at, orders ( buyer_name ), events ( name )")
    .eq("code", code)
    .maybeSingle();

  let result: ScanResult = "not_found";
  if (existing) {
    if (parsed.data.event_id && existing.event_id !== parsed.data.event_id) {
      result = "wrong_event";
    } else if (existing.status === "checked_in") {
      result = "already_used";
    } else if (existing.status === "void") {
      result = "void";
    }
  }

  await logScan(code, existing?.id ?? null, result, req.adminId!);

  res.json({
    result,
    ticket: existing
      ? {
          code: existing.code,
          buyer_name: (existing.orders as unknown as { buyer_name: string }).buyer_name,
          event_name: (existing.events as unknown as { name: string }).name,
          checked_in_at: existing.checked_in_at,
        }
      : undefined,
  } satisfies CheckinResponse);
});

async function logScan(
  code: string,
  ticketId: string | null,
  result: ScanResult,
  adminId: string,
): Promise<void> {
  const { error } = await supabase().from("scans").insert({
    code,
    ticket_id: ticketId,
    result,
    scanned_by: adminId,
  });
  if (error) console.error("[checkin] failed to log scan:", error);
}
