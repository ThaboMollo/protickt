import type { NextFunction, Request, Response } from "express";
import { supabase } from "../lib/supabase.js";

declare module "express-serve-static-core" {
  interface Request {
    adminId?: string;
  }
}

/**
 * Requires a Supabase Auth JWT (Authorization: Bearer <token>) belonging to a
 * user listed in admin_users. Sets req.adminId on success.
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
    .select("user_id")
    .eq("user_id", data.user.id)
    .maybeSingle();

  if (!adminRow) {
    res.status(403).json({ error: "Not an admin" });
    return;
  }

  req.adminId = data.user.id;
  next();
}
