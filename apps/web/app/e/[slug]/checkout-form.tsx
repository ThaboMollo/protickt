"use client";

import { useState, type FormEvent } from "react";
import { API_URL } from "../../../lib/api";

export function CheckoutForm({ slug }: { slug: string }) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${API_URL}/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_slug: slug,
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
    <form onSubmit={onSubmit}>
      <h2 style={{ marginTop: 0 }}>Get your tickets</h2>

      <label htmlFor="buyer_name">Full name</label>
      <input id="buyer_name" name="buyer_name" required minLength={2} />

      <label htmlFor="buyer_email">Email (tickets are sent here)</label>
      <input id="buyer_email" name="buyer_email" type="email" required />

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
    </form>
  );
}
