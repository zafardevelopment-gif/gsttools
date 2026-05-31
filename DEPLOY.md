# Deployment — Vercel + Supabase

This guide takes the MVP from a fresh clone to production.

## 1. Create the Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. **Project Settings → API** — copy:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

## 2. Apply the database schema

The migrations live in `supabase/migrations/` and are numbered in order.

**Option A — Supabase CLI (recommended):**

```bash
npm i -g supabase
supabase link --project-ref <your-project-ref>
supabase db push
```

**Option B — SQL editor:** open each file `0001 … 0006` in the Supabase
Dashboard SQL editor and run them **in order**.

Then (optional) load demo data: sign in to the app once so an `auth.users` row
exists, set `demo_email` in `supabase/seed/seed.sql`, and run it in the SQL editor.

Regenerate typed DB types from the live schema (optional but recommended):

```bash
npx supabase gen types typescript --project-id <project-id> > src/lib/database.types.ts
```

## 3. Configure Auth

- **Authentication → Providers → Phone:** enable and connect an SMS provider
  (MSG91 or Twilio) for production phone OTP. Keys live in Supabase, not in this repo.
- **Authentication → Providers → Email:** enable email OTP as a fallback.
- **Authentication → URL Configuration:** add your production URL (and
  `http://localhost:3000` for dev) to the redirect allow-list.

## 4. Storage

Migration `0006_storage.sql` creates the public-read `logos` bucket with
member-scoped write policies. No manual step needed beyond running migrations.

## 5. Deploy the app to Vercel

1. Push this repo to GitHub and **import it into Vercel**.
2. Set the environment variables (from `.env.example`):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_SITE_URL` = your production URL (e.g. `https://app.example.com`)
   - `SUPERADMIN_EMAILS` = comma-separated admin emails for `/admin`
   - `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` — leave blank until you wire payments
3. Deploy. Vercel runs `next build` automatically.

## 6. Razorpay (when you're ready to charge)

The MVP ships a **stub** (`src/lib/razorpay.ts`). To go live:

1. Add `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
2. Implement `createCheckoutOrder()` with the Razorpay SDK and open Checkout
   on the client.
3. Add a webhook route that calls `verifyWebhookSignature()` and sets
   `GST_subscriptions.status = 'active'`. Gate `changePlanAction` behind it.

## 7. Post-deploy checklist

- [ ] Phone OTP login works (SMS provider connected).
- [ ] A new user can complete the business-setup wizard.
- [ ] RLS isolation: a user in tenant A cannot see tenant B's data.
- [ ] Invoice PDF (`/invoices/:id/pdf`) renders.
- [ ] Reports export to Excel.
- [ ] `/admin` is reachable only by `SUPERADMIN_EMAILS`.

## Notes

- **Next.js 16** renames `middleware` → `proxy`; session refresh + route
  guarding live in `src/proxy.ts`.
- All money is integer **paise**; the GST tax logic is a single pure,
  unit-tested function (`src/lib/gst.ts`).
- All tables are prefixed `GST_`.
