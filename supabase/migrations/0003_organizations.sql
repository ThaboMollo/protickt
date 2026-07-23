-- Organizations: the white-label tenant root. Each event manager we lease
-- proTickt to gets one row holding their branding (theme/logo/contact),
-- their buyer-site URL, and their own Paystack keys (encrypted by the API
-- with an app-level master key — never stored or returned in plaintext).
--
-- Existing data is backfilled into a default 'protickt' org so every code
-- path is uniform: there is no "legacy" branch, the original deployment is
-- simply tenant number one.

create table organizations (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique
                check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name          text not null,               -- display name, also the email from-name
  site_url      text not null,               -- buyer site origin, e.g. https://tickets.wildmedia.co.bw
  logo_url      text,
  support_email text,
  support_phone text,
  socials       jsonb not null default '{}', -- { instagram, facebook, x, tiktok, website }
  theme         jsonb not null default '{}', -- partial; keys mirror the web app's CSS vars
  default_currency text not null default 'ZAR',
  paystack_secret_key_enc text,              -- AES-256-GCM, base64(iv || tag || ciphertext)
  paystack_public_key_enc text,
  status        text not null default 'active'
                check (status in ('active', 'suspended')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on organizations
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Backfill: the default org owns everything that exists today.
-- ---------------------------------------------------------------------------
insert into organizations (slug, name, site_url)
values ('protickt', 'ProTickt', 'https://protickt-web.vercel.app');

alter table events add column organization_id uuid references organizations (id);

update events
set organization_id = (select id from organizations where slug = 'protickt');

alter table events alter column organization_id set not null;

create index events_org_idx on events (organization_id);

-- ---------------------------------------------------------------------------
-- Admin users become org-scoped. Existing admins are proTickt staff, so they
-- get super_admin (sees every org, onboards new ones); client staff are
-- org_admins and only see their own org's events/orders/scans.
-- ---------------------------------------------------------------------------
alter table admin_users
  add column organization_id uuid references organizations (id),
  add column role text not null default 'org_admin'
      check (role in ('super_admin', 'org_admin'));

update admin_users
set organization_id = (select id from organizations where slug = 'protickt'),
    role = 'super_admin';

-- ---------------------------------------------------------------------------
-- Org assets (logos). Same model as event-flyers: public-read bucket,
-- uploads via API-minted signed URLs, no storage RLS policies needed.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'org-assets',
  'org-assets',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Email → user id lookup for the super-admin "add org admin" flow (the
-- client's staff sign up first, then get allowlisted by email). auth.users
-- is not exposed over PostgREST, hence this function; only the service role
-- may call it.
-- ---------------------------------------------------------------------------
create or replace function get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

revoke execute on function get_user_id_by_email(text) from public, anon, authenticated;

-- Deny-all RLS like every other table: only the API's service-role key
-- can touch org rows (they contain encrypted payment credentials).
alter table organizations enable row level security;
