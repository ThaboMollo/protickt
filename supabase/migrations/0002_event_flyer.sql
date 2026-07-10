-- Event flyers: a downloadable image/PDF shown on the public event page.
-- Files live in a public storage bucket; the URL is stored on the event.
-- Uploads go through signed upload URLs minted by the API (service role),
-- so no storage RLS policies are needed — public read comes from the
-- bucket's `public` flag, writes are authorised by the signed token.

alter table events add column flyer_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-flyers',
  'event-flyers',
  true,
  10485760, -- 10 MB
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;
