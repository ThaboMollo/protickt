import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "../env.js";

let client: SupabaseClient | null = null;

/**
 * Service-role client — bypasses RLS. This key must never leave the API.
 */
export function supabase(): SupabaseClient {
  if (!client) {
    client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
