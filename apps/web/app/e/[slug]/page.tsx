import { notFound } from "next/navigation";
import { formatMoney, type PublicEvent } from "@protickt/shared";
import { apiGet } from "../../../lib/api";
import { CheckoutForm } from "./checkout-form";

type EventWithAvailability = PublicEvent & { sold_out: boolean };

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const event = await apiGet<EventWithAvailability>(`/events/${slug}`);
  if (!event) notFound();

  const flyerIsImage = event.flyer_url !== null && !event.flyer_url.endsWith(".pdf");

  return (
    <>
      <div className="card">
        {event.flyer_url && flyerIsImage && (
          // eslint-disable-next-line @next/next/no-img-element -- flyer lives on Supabase storage, dimensions unknown
          <img
            src={event.flyer_url}
            alt={`${event.name} flyer`}
            style={{ width: "100%", borderRadius: "8px", marginBottom: "1rem" }}
          />
        )}
        <h1>{event.name}</h1>
        <p className="meta">
          📅 {new Date(event.starts_at).toLocaleString("en-ZA", { dateStyle: "full", timeStyle: "short" })}
        </p>
        {event.venue && <p className="meta">📍 {event.venue}</p>}
        {event.description && <p>{event.description}</p>}
        {event.flyer_url && (
          <p>
            {/* ?download makes Supabase storage serve the file as an attachment */}
            <a href={`${event.flyer_url}?download`}>⬇ Download flyer</a>
          </p>
        )}
        <p className="price">
          {event.price_cents === 0
            ? "Free"
            : formatMoney(event.price_cents, event.currency)}
        </p>
      </div>

      <div className="card">
        {event.sold_out ? (
          <p className="status-bad">Sold out</p>
        ) : (
          <CheckoutForm slug={event.slug} />
        )}
      </div>
    </>
  );
}
