import type { NextFunction, Request, Response } from "express";
import type { AdminRole } from "@protickt/shared";
import { supabase } from "../lib/supabase.js";

declare module "express-serve-static-core" {
  interface Request {
    adminId?: string;
    adminRole?: AdminRole;
    /** Null only for legacy/misconfigured rows; org_admins are rejected without one. */
    adminOrgId?: string | null;
  }
}

/**
 * Requires a Supabase Auth JWT (Authorization: Bearer <token>) belonging to a
 * user listed in admin_users. Sets req.adminId/adminRole/adminOrgId.
 * org_admins act only within their organization; super_admins (proTickt
 * staff) see every org.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const { data, error } = await supabase().auth.getUser(token);
  if (error || !data.user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const { data: adminRow } = await supabase()
    .from("admin_users")
    .select("user_id, organization_id, role")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!adminRow) {
    res.status(403).json({ error: "Not an admin" });
    return;
  }
  if (adminRow.role !== "super_admin" && !adminRow.organization_id) {
    res.status(403).json({ error: "Admin account has no organization" });
    return;
  }

  req.adminId = data.user.id;
  req.adminRole = adminRow.role as AdminRole;
  req.adminOrgId = adminRow.organization_id;
  next();
}

export function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.adminRole !== "super_admin") {
    res.status(403).json({ error: "Super admin only" });
    return;
  }
  next();
}

/** True when this request may touch data belonging to `orgId`. */
export function canAccessOrg(req: Request, orgId: string): boolean {
  return req.adminRole === "super_admin" || req.adminOrgId === orgId;
}
