"use client";

import { useState, type FormEvent } from "react";
import { API_URL } from "../../../lib/api";
import { TENANT_SLUG } from "../../../lib/tenant";

export function CheckoutForm({ slug }: { slug: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInvalid, setShowInvalid] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // noValidate suppresses the browser's popup bubbles; instead the
    // .show-invalid class lights up every missing/invalid field at once.
    if (!e.currentTarget.checkValidity()) {
      setShowInvalid(true);
      setError("Please fill in the highlighted fields.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${API_URL}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_slug: slug,
          tenant: TENANT_SLUG,
          buyer_name: form.get("buyer_name"),
          buyer_email: form.get("buyer_email"),
          buyer_phone: (form.get("buyer_phone") as string) || null,
          quantity: Number(form.get("quantity")),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Something went wrong, please try again.");
        setSubmitting(false);
        return;
      }
      // Off to Paystack's hosted checkout.
      window.location.href = body.authorization_url;
    } catch {
      setError("Could not reach the server. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className={showInvalid ? "show-invalid" : undefined}>
      <h2 style={{ marginTop: 0 }}>Get your tickets</h2>

      <label htmlFor="buyer_name" className="required">Full name</label>
      <input id="buyer_name" name="buyer_name" required minLength={2} />
      <p className="field-error">Please enter your full name</p>

      <label htmlFor="buyer_email" className="required">Email (tickets are sent here)</label>
      <input id="buyer_email" name="buyer_email" type="email" required />
      <p className="field-error">Enter a valid email address</p>

      <label htmlFor="buyer_phone">Phone (optional)</label>
      <input id="buyer_phone" name="buyer_phone" type="tel" />

      <label htmlFor="quantity">Number of tickets</label>
      <select id="quantity" name="quantity" defaultValue="1">
        {Array.from({ length: 10 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1}
          </option>
        ))}
      </select>

      {error && <p className="error">{error}</p>}

      <button className="primary" type="submit" disabled={submitting}>
        {submitting ? "Redirecting to payment…" : "Pay & get tickets"}
      </button>

      <p className="secure-note">🔒 Secure payment via Paystack</p>
    </form>
  );
}
