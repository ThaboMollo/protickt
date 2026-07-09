-- ProTickt initial schema
-- All access goes through the Express API using the service-role key.
-- RLS is enabled deny-all on every table as defence in depth: the anon key
-- can read/write nothing even if it leaks into a client bundle.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- admin_users: allowlist of Supabase Auth users who may use the admin app.
-- Add an admin manually after they sign up:
--   insert into admin_users (user_id) select id from auth.users where email = '...';
-- ---------------------------------------------------------------------------
create table admin_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- events
-- ---------------------------------------------------------------------------
create table events (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text,
  venue       text,
  starts_at   timestamptz not null,
  price_cents integer not null check (price_cents >= 0),
  currency    text not null default 'ZAR',
  capacity    integer check (capacity > 0),
  status      text not null default 'draft'
              check (status in ('draft', 'published', 'closed')),
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- orders: one checkout attempt. Payment state lives here.
-- paystack_ref is the reference we hand to Paystack (we use the order id),
-- unique so webhook retries can never double-process.
-- ---------------------------------------------------------------------------
create table orders (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references events (id),
  buyer_name   text not null,
  buyer_email  text not null,
  buyer_phone  text,
  quantity     integer not null default 1 check (quantity between 1 and 10),
  amount_cents integer not null check (amount_cents >= 0),
  status       text not null default 'pending'
               check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  paystack_ref text unique,
  created_at   timestamptz not null default now(),
  paid_at      timestamptz
);

create index orders_event_id_idx on orders (event_id);
create index orders_status_created_idx on orders (status, created_at);

-- ---------------------------------------------------------------------------
-- tickets: issued only when an order is paid. `code` is the QR payload's
-- secret — 128 bits of entropy, possession of the code is the ticket.
-- event_id is denormalised so gate scans are a single-row operation.
-- ---------------------------------------------------------------------------
create table tickets (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references orders (id),
  event_id      uuid not null references events (id),
  code          text not null unique,
  status        text not null default 'valid'
                check (status in ('valid', 'checked_in', 'void')),
  checked_in_at timestamptz,
  checked_in_by uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

create index tickets_order_id_idx on tickets (order_id);
create index tickets_event_status_idx on tickets (event_id, status);

-- ---------------------------------------------------------------------------
-- scans: audit log of every scan attempt, including rejections.
-- ---------------------------------------------------------------------------
create table scans (
  id         bigint generated always as identity primary key,
  code       text not null,
  ticket_id  uuid references tickets (id),
  result     text not null
             check (result in ('ok', 'already_used', 'void', 'not_found', 'wrong_event')),
  scanned_by uuid references auth.users (id),
  scanned_at timestamptz not null default now()
);

create index scans_ticket_id_idx on scans (ticket_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
  before update on events
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Capacity helper: seats currently taken = paid tickets + quantity held by
-- fresh pending orders. Called by the API before creating a checkout and
-- again inside the webhook.
-- ---------------------------------------------------------------------------
create or replace function seats_taken(p_event_id uuid, p_pending_ttl_minutes int default 20)
returns integer language sql stable as $$
  select
    coalesce((
      select count(*) from tickets
      where event_id = p_event_id and status in ('valid', 'checked_in')
    ), 0)
    +
    coalesce((
      select sum(quantity) from orders
      where event_id = p_event_id
        and status = 'pending'
        and created_at > now() - make_interval(mins => p_pending_ttl_minutes)
    ), 0);
$$;

-- ---------------------------------------------------------------------------
-- Deny-all RLS. No policies are created on purpose: the service-role key
-- (API only) bypasses RLS; the anon/authenticated keys can touch nothing.
-- ---------------------------------------------------------------------------
alter table admin_users enable row level security;
alter table events      enable row level security;
alter table orders      enable row level security;
alter table tickets     enable row level security;
alter table scans       enable row level security;
