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
  organization_id: string;
  created_at: string;
}

/** Public view of an event — what the buyer page needs. */
export type PublicEvent = Omit<EventRecord, "status" | "organization_id">;

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
  /** Tenant site slug; when present the event must belong to that org. */
  tenant: z.string().min(1).nullish(),
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
// Organizations — white-label tenancy
// ---------------------------------------------------------------------------

export const ADMIN_ROLES = ["super_admin", "org_admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ORG_STATUSES = ["active", "suspended"] as const;
export type OrgStatus = (typeof ORG_STATUSES)[number];

/** Storage bucket that org logos are uploaded to (public read). */
export const ORG_ASSETS_BUCKET = "org-assets";

export const LOGO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/svg+xml",
] as const;
export type LogoContentType = (typeof LOGO_CONTENT_TYPES)[number];

export const LOGO_EXTENSIONS: Record<LogoContentType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

/**
 * Per-tenant theme. Keys mirror the CSS custom properties in the buyer app's
 * globals.css; a tenant only overrides the keys it cares about and the API
 * merges the rest from DEFAULT_THEME.
 */
export const tenantThemeSchema = z
  .object({
    ink: z.string().max(50),
    muted: z.string().max(50),
    accent: z.string().max(50),
    accent2: z.string().max(50),
    bg: z.string().max(50),
    card: z.string().max(50),
    cardInset: z.string().max(50),
    border: z.string().max(50),
    ok: z.string().max(50),
    bad: z.string().max(50),
  })
  .partial();
export type TenantTheme = z.infer<typeof tenantThemeSchema>;

/** The stock ProTickt look — must stay in sync with globals.css `:root`. */
export const DEFAULT_THEME: Required<TenantTheme> = {
  ink: "#f4f5f7",
  muted: "#9aa3b2",
  accent: "#8b5cf6",
  accent2: "#ec4899",
  bg: "#0b0d12",
  card: "#14171f",
  cardInset: "#0e1118",
  border: "#262b36",
  ok: "#34d399",
  bad: "#f87171",
};

/** Theme key → CSS custom property it overrides. */
export const THEME_CSS_VARS: Record<keyof Required<TenantTheme>, string> = {
  ink: "--ink",
  muted: "--muted",
  accent: "--accent",
  accent2: "--accent-2",
  bg: "--bg",
  card: "--card",
  cardInset: "--card-inset",
  border: "--border",
  ok: "--ok",
  bad: "--bad",
};

export const orgSocialsSchema = z
  .object({
    instagram: z.string().url(),
    facebook: z.string().url(),
    x: z.string().url(),
    tiktok: z.string().url(),
    website: z.string().url(),
  })
  .partial();
export type OrgSocials = z.infer<typeof orgSocialsSchema>;

export const orgInputSchema = z.object({
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "lowercase letters, numbers and dashes only"),
  name: z.string().min(2).max(200),
  site_url: z.string().url().max(500),
  logo_url: z.string().url().max(1000).nullish(),
  support_email: z.string().email().nullish(),
  support_phone: z.string().max(30).nullish(),
  socials: orgSocialsSchema.default({}),
  theme: tenantThemeSchema.default({}),
  default_currency: z.enum(SUPPORTED_CURRENCIES).default("ZAR"),
  status: z.enum(ORG_STATUSES).default("active"),
});
export type OrgInput = z.infer<typeof orgInputSchema>;

export const orgUpdateSchema = orgInputSchema.partial();
export type OrgUpdate = z.infer<typeof orgUpdateSchema>;

/** Write-only: keys are encrypted at rest and never returned by the API. */
export const orgPaystackKeysSchema = z.object({
  secret_key: z.string().startsWith("sk_").max(200),
  public_key: z.string().startsWith("pk_").max(200),
});
export type OrgPaystackKeys = z.infer<typeof orgPaystackKeysSchema>;

export const orgAdminInputSchema = z.object({
  email: z.string().email(),
  role: z.enum(ADMIN_ROLES).default("org_admin"),
});
export type OrgAdminInput = z.infer<typeof orgAdminInputSchema>;

export const logoUploadInputSchema = z.object({
  content_type: z.enum(LOGO_CONTENT_TYPES),
});
export type LogoUploadInput = z.infer<typeof logoUploadInputSchema>;

/** Org row as returned by admin endpoints — never includes key material. */
export interface OrganizationRecord {
  id: string;
  slug: string;
  name: string;
  site_url: string;
  logo_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  socials: OrgSocials;
  theme: TenantTheme;
  default_currency: string;
  status: OrgStatus;
  has_paystack_keys: boolean;
  created_at: string;
}

/** Response of GET /tenants/:slug/public — everything a buyer site needs
 *  to brand itself, and nothing an attacker could use. */
export interface TenantBranding {
  slug: string;
  name: string;
  logo_url: string | null;
  support_email: string | null;
  support_phone: string | null;
  socials: OrgSocials;
  theme: Required<TenantTheme>;
  default_currency: string;
}

/** Response of GET /admin/me. `org` is null only for legacy rows. */
export interface AdminMeResponse {
  user_id: string;
  role: AdminRole;
  org: { id: string; slug: string; name: string } | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const TICKET_CODE_PREFIX = "PTK-";

/** Timezone that decides when an event's sales day ends. */
export const EVENT_TIMEZONE = "Africa/Johannesburg";

/**
 * Ticket sales stay open for the whole calendar day of the event (venue
 * time) — late buyers at the gate are fine — and close at midnight going
 * into the next day.
 */
export function ticketSalesClosed(
  startsAt: string,
  now: Date = new Date(),
): boolean {
  // en-CA formats as YYYY-MM-DD, so comparing strings compares days.
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return day.format(now) > day.format(new Date(startsAt));
}

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
