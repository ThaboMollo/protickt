import { Router } from "express";
import type { PublicEvent } from "@protickt/shared";
import { supabase } from "../lib/supabase.js";
import { getOrgBySlug, toTenantBranding } from "../lib/orgs.js";

export const tenantsRouter = Router();

// GET /tenants/:slug/public — branding for a buyer site. Cacheable: tenant
// sites fetch this on every render (with revalidation), and theme edits
// should go live without a redeploy.
tenantsRouter.get("/:slug/public", async (req, res) => {
  const org = await getOrgBySlug(req.params.slug);
  if (!org || org.status !== "active") {
    res.status(404).json({ error: "Unknown tenant" });
    return;
  }
  res.set("Cache-Control", "public, max-age=300");
  res.json(toTenantBranding(org));
});

// GET /tenants/:slug/events — the org's published events for the tenant
// home page. Includes events from the last day so "happening now" still shows.
tenantsRouter.get("/:slug/events", async (req, res) => {
  const org = await getOrgBySlug(req.params.slug);
  if (!org || org.status !== "active") {
    res.status(404).json({ error: "Unknown tenant" });
    return;
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: events, error } = await supabase()
    .from("events")
    .select(
      "id, slug, name, description, venue, starts_at, price_cents, currency, capacity, flyer_url, created_at",
    )
    .eq("organization_id", org.id)
    .eq("status", "published")
    .gte("starts_at", since)
    .order("starts_at", { ascending: true });

  if (error) throw error;
  res.set("Cache-Control", "public, max-age=60");
  res.json({ events: (events ?? []) as PublicEvent[] });
});
