import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Pending orders older than this release their capacity hold. */
export const PENDING_ORDER_TTL_MINUTES = 20;

export const EVENT_STATUSES = ["draft", "published", "closed"] as const;

/**
 * Currencies offered in the admin UI. Paystack only settles a subset per
 * merchant country — charging a currency not enabled on the Paystack account
 * fails at checkout, so keep this list to currencies the account supports.
 */
export const SUPPORTED_CURRENCIES = ["ZAR", "USD", "NGN", "GHS", "KES"] as const;

/** Storage bucket that event flyers are uploaded to (public read). */
export const FLYER_BUCKET = "event-flyers";

export const FLYER_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export const FLYER_EXTENSIONS: Record<FlyerContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export const ORDER_STATUSES = [
  "pending",
  "paid",
  "failed",
  "expired",
  "refunded",
] as const;
export const TICKET_STATUSES = ["valid", "checked_in", "void"] as const;
export const SCAN_RESULTS = [
  "ok",
  "already_used",
  "void",
  "not_found",
  "wrong_event",
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];
export type Currency = (typeof SUPPORTED_CURRENCIES)[number];
export type FlyerContentType = (typeof FLYER_CONTENT_TYPES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type ScanResult = (typeof SCAN_RESULTS)[number];

// ---------------------------------------------------------------------------
// Entity types (as returned by the API)
// ---------------------------------------------------------------------------

export interface EventRecord {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  venue: string | null;
  starts_at: string;
  price_cents: number;
  currency: string;
  capacity: number | null;
  status: EventStatus;
  flyer_url: string | null;
  created_at: string;
}

/** Public view of an event — what the buyer page needs. */
export type PublicEvent = Omit<EventRecord, "status">;

export interface OrderRecord {
  id: string;
  event_id: string;
  buyer_name: string;
  buyer_email: string;
  buyer_phone: string | null;
  quantity: number;
  amount_cents: number;
  status: OrderStatus;
  paystack_ref: string | null;
  created_at: string;
  paid_at: string | null;
}

export interface TicketRecord {
  id: string;
  order_id: string;
  event_id: string;
  code: string;
  status: TicketStatus;
  checked_in_at: string | null;
}

export interface EventStats {
  tickets_sold: number;
  checked_in: number;
  revenue_cents: number;
  orders_paid: number;
}

/** Response of GET /orders/:id — what the success page polls. */
export interface OrderStatusResponse {
  id: string;
  status: OrderStatus;
  event: { name: string; starts_at: string; venue: string | null };
  buyer_name: string;
  quantity: number;
  amount_cents: number;
  currency: string;
  /** Only present once the order is paid. */
  tickets?: { code: string; status: TicketStatus }[];
}

/** Response of GET /tickets/:code — what the ticket page renders. */
export interface TicketViewResponse {
  code: string;
  status: TicketStatus;
  buyer_name: string;
  event: { name: string; starts_at: string; venue: string | null };
  checked_in_at: string | null;
}

/** Response of POST /admin/checkin. */
export interface CheckinResponse {
  result: ScanResult;
  ticket?: {
    code: string;
    buyer_name: string;
    event_name: string;
    checked_in_at: string | null;
  };
}

// ---------------------------------------------------------------------------
// Input schemas (shared between API validation and frontend forms)
// ---------------------------------------------------------------------------

export const eventInputSchema = z.object({
  name: z.string().min(2).max(200),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, numbers and dashes only"),
  description: z.string().max(5000).nullish(),
  venue: z.string().max(300).nullish(),
  starts_at: z.string().datetime({ offset: true }),
  price_cents: z.number().int().min(0),
  currency: z.enum(SUPPORTED_CURRENCIES).default("ZAR"),
  capacity: z.number().int().positive().nullish(),
  status: z.enum(EVENT_STATUSES).default("draft"),
  flyer_url: z.string().url().max(1000).nullish(),
});
export type EventInput = z.infer<typeof eventInputSchema>;

export const eventUpdateSchema = eventInputSchema.partial();
export type EventUpdate = z.infer<typeof eventUpdateSchema>;

export const checkoutInputSchema = z.object({
  event_slug: z.string().min(1),
  buyer_name: z.string().min(2).max(200),
  buyer_email: z.string().email(),
  buyer_phone: z.string().max(30).nullish(),
  quantity: z.number().int().min(1).max(10),
});
export type CheckoutInput = z.infer<typeof checkoutInputSchema>;

export const flyerUploadInputSchema = z.object({
  content_type: z.enum(FLYER_CONTENT_TYPES),
});
export type FlyerUploadInput = z.infer<typeof flyerUploadInputSchema>;

/** Response of POST /admin/events/:id/flyer-upload-url. The admin app uploads
 *  the file straight to storage with the token, then PATCHes the event with
 *  public_url — flyer bytes never pass through the API. */
export interface FlyerUploadUrlResponse {
  path: string;
  token: string;
  public_url: string;
}

export const checkinInputSchema = z.object({
  /** Raw scan payload: either a bare ticket code or a ticket URL containing it. */
  code: z.string().min(4).max(500),
  /** If provided, tickets for other events are rejected as wrong_event. */
  event_id: z.string().uuid().nullish(),
});
export type CheckinInput = z.infer<typeof checkinInputSchema>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const TICKET_CODE_PREFIX = "PTK-";

/**
 * Extract a ticket code from a raw QR payload. The QR encodes a ticket URL
 * (https://…/t/<code>) so phone cameras resolve to the ticket page, but the
 * scanner may also receive a bare code.
 */
export function extractTicketCode(payload: string): string | null {
  const trimmed = payload.trim();
  const urlMatch = trimmed.match(/\/t\/([A-Za-z0-9-]+)/);
  const candidate = urlMatch ? urlMatch[1] : trimmed;
  return /^PTK-[A-Z2-7]{26}$/.test(candidate) ? candidate : null;
}

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency }).format(
    cents / 100,
  );
}
