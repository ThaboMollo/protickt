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

  // Truthy check (not `!== null`): an API that predates the flyer migration
  // omits the field entirely, so flyer_url can also be undefined.
  const flyerIsImage = !!event.flyer_url && !event.flyer_url.endsWith(".pdf");

  return (
    <>
      {flyerIsImage && (
        <div className="event-hero">
          {/* eslint-disable-next-line @next/next/no-img-element -- flyer lives on Supabase storage, dimensions unknown */}
          <img
            className="hero-backdrop"
            src={event.flyer_url!}
            alt=""
            aria-hidden="true"
          />
          {/* eslint-disable-next-line @next/next/no-img-element -- flyer lives on Supabase storage, dimensions unknown */}
          <img
            className="hero-flyer"
            src={event.flyer_url!}
            alt={`${event.name} flyer`}
          />
        </div>
      )}

      <div className="card">
        <h1>{event.name}</h1>
        <div className="pills">
          <span className="pill">
            📅 {new Date(event.starts_at).toLocaleString("en-ZA", { dateStyle: "full", timeStyle: "short" })}
          </span>
          {event.venue && <span className="pill">📍 {event.venue}</span>}
        </div>
        {event.description && <p>{event.description}</p>}
        {event.flyer_url && (
          <p>
            {/* ?download makes Supabase storage serve the file as an attachment */}
            <a href={`${event.flyer_url}?download`}>⬇ Download flyer</a>
          </p>
        )}
      </div>

      <div className="card">
        <div className="buy-bar">
          <p className="price">
            {event.price_cents === 0 ? (
              "Free"
            ) : (
              <>
                {formatMoney(event.price_cents, event.currency)}{" "}
                <small>per ticket</small>
              </>
            )}
          </p>
          {event.sold_out && <span className="status-bad">Sold out</span>}
        </div>
        {!event.sold_out && <CheckoutForm slug={event.slug} />}
      </div>
    </>
  );
}
