import { createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_BASE = "https://api.paystack.co";

interface PaystackResponse<T> {
  status: boolean;
  message: string;
  data: T;
}

export interface InitializeResult {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface VerifyResult {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amount: number; // subunits (cents for ZAR)
  currency: string;
}

// Every call takes the secret key explicitly: each organization pays through
// its own Paystack account, so there is no process-wide key.

async function paystackFetch<T>(
  secretKey: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  const body = (await res.json()) as PaystackResponse<T>;
  if (!res.ok || !body.status) {
    throw new Error(`Paystack ${path} failed: ${body.message ?? res.status}`);
  }
  return body.data;
}

export function initializeTransaction(
  secretKey: string,
  params: {
    email: string;
    amountCents: number;
    currency: string;
    reference: string;
    callbackUrl: string;
    metadata?: Record<string, unknown>;
  },
): Promise<InitializeResult> {
  return paystackFetch<InitializeResult>(secretKey, "/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: params.email,
      amount: params.amountCents,
      currency: params.currency,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  });
}

export function verifyTransaction(
  secretKey: string,
  reference: string,
): Promise<VerifyResult> {
  return paystackFetch<VerifyResult>(
    secretKey,
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}

/** Paystack signs webhooks with HMAC-SHA512 of the raw body using the secret key. */
export function isValidWebhookSignature(
  secretKey: string,
  rawBody: Buffer,
  signature: string | undefined,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
