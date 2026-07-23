import {
  DEFAULT_THEME,
  THEME_CSS_VARS,
  type TenantBranding,
  type TenantTheme,
} from "@protickt/shared";
import { API_URL } from "./api";

// Which organization this deployment sells for. Every client gets their own
// Vercel project of this same app with only this env var (and the domain)
// differing; branding itself lives in the DB and is fetched below, so theme
// or logo edits go live within the revalidate window without a redeploy.
export const TENANT_SLUG = process.env.NEXT_PUBLIC_TENANT_SLUG ?? "protickt";

const FALLBACK_BRANDING: TenantBranding = {
  slug: TENANT_SLUG,
  name: "ProTickt",
  logo_url: null,
  support_email: null,
  support_phone: null,
  socials: {},
  theme: DEFAULT_THEME,
  default_currency: "ZAR",
};

export async function getTenantBranding(): Promise<TenantBranding> {
  try {
    const res = await fetch(`${API_URL}/tenants/${TENANT_SLUG}/public`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return FALLBACK_BRANDING;
    return (await res.json()) as TenantBranding;
  } catch {
    // A down API must never take the storefront chrome down with it.
    return FALLBACK_BRANDING;
  }
}

/** Theme → inline CSS custom properties that override globals.css `:root`. */
export function themeStyle(theme: Required<TenantTheme>): React.CSSProperties {
  return Object.fromEntries(
    (Object.keys(THEME_CSS_VARS) as (keyof typeof THEME_CSS_VARS)[]).map(
      (key) => [THEME_CSS_VARS[key], theme[key]],
    ),
  ) as React.CSSProperties;
}
