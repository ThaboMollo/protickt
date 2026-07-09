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
  get paystackSecretKey() {
    return required("PAYSTACK_SECRET_KEY");
  },
  /** Buyer-facing Next.js app, e.g. https://protickt.app */
  get webUrl() {
    return process.env.WEB_URL ?? "http://localhost:3000";
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
