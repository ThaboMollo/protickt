import { Router } from "express";
import { PENDING_ORDER_TTL_MINUTES } from "@protickt/shared";
import { env } from "../env.js";
import { supabase } from "../lib/supabase.js";

export const internalRouter = Router();

// GET /internal/expire-orders — hit by Vercel Cron (which sends
// "Authorization: Bearer $CRON_SECRET" when that env var is set).
// Expiring stale pending orders releases their capacity hold.
internalRouter.get("/expire-orders", async (req, res) => {
  if (!env.cronSecret || req.headers.authorization !== `Bearer ${env.cronSecret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const cutoff = new Date(
    Date.now() - PENDING_ORDER_TTL_MINUTES * 60_000,
  ).toISOString();

  const { data, error } = await supabase()
    .from("orders")
    .update({ status: "expired" })
    .eq("status", "pending")
    .lt("created_at", cutoff)
    .select("id");

  if (error) throw error;
  res.json({ expired: data?.length ?? 0 });
});
