function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseServiceRoleKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  /**
   * Master key for encrypting per-organization Paystack keys at rest.
   * 32 bytes, base64 — generate with `openssl rand -base64 32`.
   */
  get paystackKeyEncryptionKey() {
    return required("PAYSTACK_KEY_ENCRYPTION_KEY");
  },
  get corsOrigins(): string[] {
    return (
      process.env.CORS_ORIGINS ?? "http://localhost:3000,http://localhost:4200"
    )
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);
  },
  /** Optional — emails are skipped (and logged) when unset. */
  get resendApiKey() {
    return process.env.RESEND_API_KEY ?? null;
  },
  get emailFrom() {
    return process.env.EMAIL_FROM ?? "ProTickt <tickets@example.com>";
  },
  /** Shared secret for the order-expiry cron endpoint. */
  get cronSecret() {
    return process.env.CRON_SECRET ?? null;
  },
  get port() {
    return Number(process.env.PORT ?? 4000);
  },
};
