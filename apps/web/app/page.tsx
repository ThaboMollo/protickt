import Link from "next/link";
import { formatMoney, type PublicEvent } from "@protickt/shared";
import { API_URL } from "../lib/api";
import { getTenantBranding, TENANT_SLUG } from "../lib/tenant";

async function getTenantEvents(): Promise<PublicEvent[]> {
  try {
    const res = await fetch(`${API_URL}/tenants/${TENANT_SLUG}/events`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { events: PublicEvent[] };
    return body.events;
  } catch {
    return [];
  }
}

export default async function Home() {
  const [branding, events] = await Promise.all([
    getTenantBranding(),
    getTenantEvents(),
  ]);

  return (
    <>
      <div className="home-hero">
        <h1>
          {branding.name} tickets.
          <br />
          <span className="gradient-text">One QR. Walk straight in.</span>
        </h1>
        <p className="lead">
          Buy your ticket online, get a QR code, walk straight in at the gate.
        </p>
      </div>

      {events.length > 0 ? (
        <div className="event-list">
          {events.map((event) => (
            <Link key={event.id} href={`/e/${event.slug}`} className="card event-card">
              {event.flyer_url && !event.flyer_url.endsWith(".pdf") && (
                // eslint-disable-next-line @next/next/no-img-element -- flyer lives on Supabase storage, dimensions unknown
                <img className="event-card-flyer" src={event.flyer_url} alt="" />
              )}
              <div>
                <h2>{event.name}</h2>
                <div className="pills">
                  <span className="pill">
                    📅{" "}
                    {new Date(event.starts_at).toLocaleString("en-ZA", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                  {event.venue && <span className="pill">📍 {event.venue}</span>}
                </div>
                <p className="price">
                  {event.price_cents === 0
                    ? "Free"
                    : formatMoney(event.price_cents, event.currency)}
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="meta" style={{ textAlign: "center" }}>
          No events on sale right now — check back soon. Bought a ticket
          already? Your QR code is in your email.
        </p>
      )}
    </>
  );
}
