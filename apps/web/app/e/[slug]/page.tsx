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

  return (
    <>
      <div className="card">
        <h1>{event.name}</h1>
        <p className="meta">
          📅 {new Date(event.starts_at).toLocaleString("en-ZA", { dateStyle: "full", timeStyle: "short" })}
        </p>
        {event.venue && <p className="meta">📍 {event.venue}</p>}
        {event.description && <p>{event.description}</p>}
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
