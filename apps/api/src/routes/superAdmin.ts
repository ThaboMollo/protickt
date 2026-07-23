import { Router } from "express";
import {
  LOGO_EXTENSIONS,
  logoUploadInputSchema,
  ORG_ASSETS_BUCKET,
  orgAdminInputSchema,
  orgInputSchema,
  orgPaystackKeysSchema,
  orgUpdateSchema,
  type FlyerUploadUrlResponse,
} from "@protickt/shared";
import { supabase } from "../lib/supabase.js";
import { encryptSecret } from "../lib/orgSecrets.js";
import { getOrgById, ORG_COLUMNS, toOrganizationRecord } from "../lib/orgs.js";

// Mounted at /admin/orgs behind requireAdmin + requireSuperAdmin: this is
// the proTickt-staff onboarding surface for new client organizations.
export const superAdminRouter = Router();

// GET /admin/orgs
superAdminRouter.get("/", async (_req, res) => {
  const { data, error } = await supabase()
    .from("organizations")
    .select(ORG_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) throw error;
  res.json(data!.map((org) => toOrganizationRecord(org)));
});

// POST /admin/orgs
superAdminRouter.post("/", async (req, res) => {
  const parsed = orgInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabase()
    .from("organizations")
    .insert(parsed.data)
    .select(ORG_COLUMNS)
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "That organization slug is already taken" });
      return;
    }
    throw error;
  }
  res.status(201).json(toOrganizationRecord(data));
});

// PATCH /admin/orgs/:id — branding/theme edits go live on the tenant site
// within its revalidate window, no redeploy needed.
superAdminRouter.patch("/:id", async (req, res) => {
  const parsed = orgUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabase()
    .from("organizations")
    .update(parsed.data)
    .eq("id", req.params.id)
    .select(ORG_COLUMNS)
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "That organization slug is already taken" });
      return;
    }
    throw error;
  }
  if (!data) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json(toOrganizationRecord(data));
});

// PUT /admin/orgs/:id/paystack-keys — write-only: encrypted at rest, never
// readable back through the API. Revenue for this org's events settles into
// the account these keys belong to.
superAdminRouter.put("/:id/paystack-keys", async (req, res) => {
  const parsed = orgPaystackKeysSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const { data, error } = await supabase()
    .from("organizations")
    .update({
      paystack_secret_key_enc: encryptSecret(parsed.data.secret_key),
      paystack_public_key_enc: encryptSecret(parsed.data.public_key),
    })
    .eq("id", req.params.id)
    .select(ORG_COLUMNS)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }
  res.json(toOrganizationRecord(data));
});

// POST /admin/orgs/:id/logo-upload-url — same flow as event flyers: upload
// straight to storage with the signed token, then PATCH the org's logo_url.
superAdminRouter.post("/:id/logo-upload-url", async (req, res) => {
  const parsed = logoUploadInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const org = await getOrgById(req.params.id);
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const path = `${org.id}/${Date.now()}.${LOGO_EXTENSIONS[parsed.data.content_type]}`;
  const bucket = supabase().storage.from(ORG_ASSETS_BUCKET);

  const { data, error } = await bucket.createSignedUploadUrl(path);
  if (error) throw error;

  res.json({
    path,
    token: data.token,
    public_url: bucket.getPublicUrl(path).data.publicUrl,
  } satisfies FlyerUploadUrlResponse);
});

// GET /admin/orgs/:id/admins
superAdminRouter.get("/:id/admins", async (req, res) => {
  const { data, error } = await supabase()
    .from("admin_users")
    .select("user_id, role, created_at")
    .eq("organization_id", req.params.id)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const admins = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: user } = await supabase().auth.admin.getUserById(row.user_id);
      return { ...row, email: user?.user?.email ?? null };
    }),
  );
  res.json(admins);
});

// POST /admin/orgs/:id/admins — allowlist a user for this org. The person
// signs up in the admin app first (Supabase Auth), then gets added by email.
superAdminRouter.post("/:id/admins", async (req, res) => {
  const parsed = orgAdminInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
    return;
  }

  const org = await getOrgById(req.params.id);
  if (!org) {
    res.status(404).json({ error: "Organization not found" });
    return;
  }

  const { data: userId, error: lookupError } = await supabase().rpc(
    "get_user_id_by_email",
    { p_email: parsed.data.email },
  );
  if (lookupError) throw lookupError;
  if (!userId) {
    res.status(404).json({
      error: "No user with that email — ask them to sign up in the admin app first",
    });
    return;
  }

  const { error } = await supabase().from("admin_users").insert({
    user_id: userId,
    organization_id: org.id,
    role: parsed.data.role,
  });

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "That user is already an admin" });
      return;
    }
    throw error;
  }
  res.status(201).json({ user_id: userId, role: parsed.data.role });
});
