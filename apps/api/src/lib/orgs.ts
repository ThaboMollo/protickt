import {
  DEFAULT_THEME,
  type OrganizationRecord,
  type OrgSocials,
  type OrgStatus,
  type TenantBranding,
  type TenantTheme,
} from "@protickt/shared";
import { supabase } from "./supabase.js";
import { decryptSecret } from "./orgSecrets.js";

/** Full organizations row as stored — *_enc columns never leave the API. */
export interface OrgRow {
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
  paystack_secret_key_enc: string | null;
  paystack_public_key_enc: string | null;
  status: OrgStatus;
  created_at: string;
}

export const ORG_COLUMNS =
  "id, slug, name, site_url, logo_url, support_email, support_phone, socials, theme, default_currency, paystack_secret_key_enc, paystack_public_key_enc, status, created_at";

export async function getOrgBySlug(slug: string): Promise<OrgRow | null> {
  const { data, error } = await supabase()
    .from("organizations")
    .select(ORG_COLUMNS)
    .eq("slug", slug)
    .maybeSingle();
  if (error) throw error;
  return data as OrgRow | null;
}

export async function getOrgById(id: string): Promise<OrgRow | null> {
  const { data, error } = await supabase()
    .from("organizations")
    .select(ORG_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as OrgRow | null;
}

/** Public branding payload: merged theme, no key material. */
export function toTenantBranding(org: OrgRow): TenantBranding {
  return {
    slug: org.slug,
    name: org.name,
    logo_url: org.logo_url,
    support_email: org.support_email,
    support_phone: org.support_phone,
    socials: org.socials ?? {},
    theme: { ...DEFAULT_THEME, ...(org.theme ?? {}) },
    default_currency: org.default_currency,
  };
}

/** Admin-facing org shape: encrypted columns become a has-keys flag. */
export function toOrganizationRecord(org: OrgRow): OrganizationRecord {
  const { paystack_secret_key_enc, paystack_public_key_enc, ...rest } = org;
  return {
    ...rest,
    socials: rest.socials ?? {},
    theme: rest.theme ?? {},
    has_paystack_keys:
      paystack_secret_key_enc != null && paystack_public_key_enc != null,
  };
}

/** Decrypted Paystack secret for charging, or null when not yet configured. */
export function orgPaystackSecret(
  org: Pick<OrgRow, "paystack_secret_key_enc">,
): string | null {
  return org.paystack_secret_key_enc
    ? decryptSecret(org.paystack_secret_key_enc)
    : null;
}
