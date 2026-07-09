# ProTickt

Event ticketing platform: an admin creates an event and shares a link, buyers pay online (Paystack) and receive a QR-code ticket, and the admin scans the QR at the gate to validate entry.

## Architecture

| App | Stack | Local port | Purpose |
|---|---|---|---|
| `apps/api` | Express + Node (TypeScript) | 4000 | All business logic; the only thing that talks to Supabase |
| `apps/web` | Next.js | 3000 | Buyer: event page → checkout → QR tickets |
| `apps/admin` | Angular | 4200 | Admin: login, event CRUD, sales dashboard, gate scanner |
| `packages/shared` | TypeScript + zod | — | Types and validation schemas shared by all three |
| `supabase/migrations` | SQL | — | Postgres schema (events, orders, tickets, scans, admin_users) |

Key design decisions:

- **Only the API touches the database.** RLS is deny-all; the service-role key lives in the API env only. The Angular app uses Supabase Auth purely to obtain a JWT, which the API verifies against the `admin_users` allowlist.
- **The Paystack webhook is the sole source of truth for "paid".** Tickets are generated inside the webhook handler; the success page just polls the order status. The handler is idempotent (conditional `pending → paid` update), so Paystack retries are harmless.
- **QR = high-entropy ticket code** (`PTK-` + 26 base32 chars) encoded as a ticket URL. Check-in is one atomic `UPDATE … WHERE status='valid'`, so double entry is impossible even with multiple gates. Every scan attempt is logged in `scans`.

## One-time setup

### 1. Install

```sh
npm install
npm run build:shared
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com) (region: closest to your users).
2. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `supabase db push` with the CLI).
3. Create your admin user: **Authentication → Users → Add user** (email + password), then in the SQL editor:
   ```sql
   insert into admin_users (user_id)
   select id from auth.users where email = 'you@example.com';
   ```
4. Grab from **Project Settings → API**: the project URL, the `anon` key (for the Angular app) and the `service_role` key (for the API only).

### 3. Paystack

Create an account at [paystack.com](https://paystack.com), grab the **test** secret key (`sk_test_…`). In the Paystack dashboard set the webhook URL to `https://<your-api-domain>/webhooks/paystack` (for local testing, use an ngrok/localtunnel URL pointing at `localhost:4000`).

### 4. Environment

- `apps/api`: copy `.env.example` → `.env` and fill in.
- `apps/web`: copy `.env.example` → `.env.local` (defaults work for local dev).
- `apps/admin`: edit `src/environments/environment.ts` with your Supabase URL + anon key (the anon key is publishable — it can do nothing against the RLS-locked tables).

## Run locally

```sh
npm run dev:api    # Express on :4000
npm run dev:web    # Next.js on :3000
npm run dev:admin  # Angular on :4200
```

Flow to test end-to-end: sign in to the admin (`:4200`) → create an event → set status **published** → open the share link (`:3000/e/<slug>`) → buy with a [Paystack test card](https://paystack.com/docs/payments/test-payments) (`4084 0840 8408 4081`) → webhook fires → QR appears on the success page and at `/t/<code>` → admin **Scan** page → point camera at the QR → green screen.

> The webhook needs to reach your machine for local end-to-end tests — run `ngrok http 4000` and set the Paystack webhook URL to the tunnel.

## Deploy (Vercel)

Three Vercel projects, all pointing at this repo with different **Root Directory** settings ("Include source files outside of the Root Directory" must stay enabled — it's the default). The shared package builds itself on install via its `prepare` script, so no custom install/build commands are needed anywhere.

| Project | Root directory | Settings | Env vars |
|---|---|---|---|
| protickt-api | `apps/api` | Framework: **Other**. `apps/api/vercel.json` provides the catch-all rewrite into the Express function and the order-expiry cron. | Everything from `apps/api/.env.example` — with `WEB_URL` + `CORS_ORIGINS` set to the deployed frontend URLs and a strong `CRON_SECRET` (Vercel Cron sends it as the bearer token automatically). |
| protickt-web | `apps/web` | Framework: **Next.js** (auto-detected), defaults are fine. | `NEXT_PUBLIC_API_URL` = the api deployment URL. |
| protickt-admin | `apps/admin` | Framework: **Angular**. Output directory: `dist/admin/browser`. `apps/admin/vercel.json` rewrites deep links to `index.html` (SPA routing). | None — production URLs/keys are baked in at build time from `src/environments/environment.production.ts` (swapped in by `fileReplacements`; `ng serve` still uses the local `environment.ts`). |

Deploy order and the loose ends that follow:

1. Deploy **protickt-api** first, note its URL.
2. Put that URL in `environment.production.ts` (admin) and `NEXT_PUBLIC_API_URL` (web), deploy both frontends.
3. Update the api project's `WEB_URL` / `CORS_ORIGINS` to the real frontend URLs and redeploy.
4. Paystack dashboard → set the webhook URL to `https://<api-url>/webhooks/paystack` (replaces any local ngrok tunnel).
5. Going live: swap `PAYSTACK_SECRET_KEY` for the live key.

No Git remote is required to try it out — `vercel --cwd apps/api` (and siblings) deploys straight from the working tree. For CI-style deploys on push, connect the repo to the three projects in the Vercel dashboard.

## API surface

Public: `GET /events/:slug` · `POST /checkout` · `GET /orders/:id` · `GET /tickets/:code` · `POST /webhooks/paystack`
Admin (Bearer JWT + `admin_users`): `GET|POST /admin/events` · `GET|PATCH /admin/events/:id` · `GET /admin/events/:id/stats` · `GET /admin/events/:id/orders` · `POST /admin/checkin`
Internal: `GET /internal/expire-orders` (cron, `Authorization: Bearer $CRON_SECRET`)
