# GST Billing SaaS

A production-grade, multi-tenant **GST billing SaaS** for Indian small businesses
(myBillBook / Vyapar style). Built with **Next.js 16 (App Router)** + **Supabase**
(Postgres, Auth, Storage, RLS).

> Scope: **MVP (Phase 1)** only — auth, business setup, items & parties, GST
> invoicing, payments & ledger, expenses, dashboard & reports, subscriptions.
> See `../billing_saas_plan.md` for the full product blueprint and later phases.

## Tech stack

| Area            | Choice                                              |
| --------------- | --------------------------------------------------- |
| Framework       | Next.js 16, App Router, TypeScript, Server Actions  |
| DB / Auth / Storage | Supabase (Postgres + RLS, phone OTP auth, Storage) |
| Styling         | Tailwind CSS v4 + shadcn/ui (Radix base)            |
| Forms           | react-hook-form + zod                               |
| PDF             | `@react-pdf/renderer` (server-side)                 |
| Excel export    | `xlsx`                                              |
| Payments        | Razorpay (stubbed in MVP)                           |
| Tests           | Vitest                                              |

## Architecture rules (non-negotiable)

1. **Multi-tenancy via Postgres RLS.** Every tenant-scoped table has `tenant_id`
   and RLS policies. RLS — not app-layer filtering — is the security boundary.
2. A user can belong to **multiple tenants** via `GST_memberships`. The active
   tenant is stored in the `gst_active_tenant` cookie.
3. The **service-role key never reaches the client.** Browser uses the anon key
   (guarded by RLS); the service-role key is used only in trusted server code.
4. **GST tax logic** lives in one pure, unit-tested function (Step 5).
5. **Money is integer paise** everywhere (`src/lib/money.ts`). No floats for currency.
6. **All DB tables are prefixed `GST_`** (e.g. `GST_invoices`).

## Prerequisites

- Node.js 20+ (tested on v24)
- A free [Supabase](https://supabase.com) project
- (Optional) [Supabase CLI](https://supabase.com/docs/guides/cli) for running migrations locally

## Setup

```bash
# 1. Install deps
npm install

# 2. Configure environment
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# and SUPABASE_SERVICE_ROLE_KEY from Supabase > Project Settings > API.
```

### Database migrations (added in Step 2)

Migrations live in `supabase/migrations/`. Apply them via the Supabase CLI:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

…or paste each migration's SQL into the Supabase Dashboard SQL editor in order.

After the schema exists, regenerate typed DB types:

```bash
npx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
```

### Phone OTP

Configure an SMS provider (MSG91 / Twilio) under
**Supabase Dashboard → Authentication → Providers → Phone**. The keys live in
Supabase, not in this repo. For local dev without a provider, use the email-OTP
fallback on the login page.

## Run

```bash
npm run dev        # http://localhost:3000
npm run build      # production build
npm start          # serve production build
```

The app boots even without Supabase configured (landing page renders, a console
warning is printed); auth and data features activate once `.env.local` is set.

## Quality

```bash
npm run typecheck  # tsc --noEmit
npm run lint       # eslint
npm run test       # vitest (GST tax + money + ledger math)
```

## Project structure

```
src/
  app/
    (auth)/login          # phone/email OTP login
    (app)/                # authenticated app shell
      dashboard items parties invoices payments expenses reports settings subscription
    auth/callback         # Supabase auth callback
    onboarding            # business setup wizard
    api/health            # liveness probe
  components/ui           # shadcn/ui components
  lib/
    supabase/             # client.ts, server.ts, proxy.ts (SSR clients)
    env.ts money.ts constants.ts tenant.ts database.types.ts
  server/
    actions queries       # Server Actions & data queries
  proxy.ts                # session refresh + route guard (Next 16 "proxy")
supabase/
  migrations/             # schema + RLS (SQL)
  seed/                   # demo tenant + sample data
```

## Super-admin panel

`/admin` is an internal cross-tenant view (all businesses, plans, subscription
status, lifetime sales). It uses the service-role client (bypasses RLS) and is
gated by the `SUPERADMIN_EMAILS` allow-list. A super admin doesn't need to
belong to any tenant; they open `/admin` directly.

## Deploy

See **[DEPLOY.md](DEPLOY.md)** for the full Vercel + Supabase walkthrough
(migrations, phone OTP/SMS provider, storage, env vars, Razorpay go-live,
post-deploy checklist).

Quick version:
- **App:** Vercel — import the repo, set the env vars from `.env.example`.
- **DB/Auth:** Supabase hosted project; run migrations via `supabase db push`.
- Set `NEXT_PUBLIC_SITE_URL` to the production URL and add it to Supabase Auth
  redirect URLs.

## License

Proprietary — internal project.
