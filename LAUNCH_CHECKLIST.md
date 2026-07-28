# AI Munim — Launch Checklist

**Maqsad:** "sab complete ho jaaye" ko ek finite list mein badalna. Is list ke saare
Section A items done = launch ke liye ready. Section C ki cheezein launch ke liye
zaroori **nahi** hain — unhe dekh kar ruko mat.

**Rule:** is file mein naya item tabhi jodo jab wo Section A ke definition pe khara
utarta ho — *"ye tootega to paisa ya bharosa jaayega."* Baaki sab Section C mein.

Last updated: 2026-07-28 · Status: **A1 code done, verification pending**

---

## Definition of Done

Har item ke liye teen cheez likhi hai:

- **Kyun** — ye launch blocker kyun hai
- **Files** — kahan kaam karna hai
- **Done kab** — objective test, "lag raha hai theek hai" nahi

Agar kisi item ka "Done kab" objectively check nahi kar sakte, to wo item galat
likha hai — usko dobara likho.

---

## Section A — Blockers (dono raaston mein zaroori)

Chahe self-serve SaaS banao ya agency delivery platform, ye 4 cheezein bina kiye
launch nahi karna.

### A1. Invoice numbering race condition 🔴 SABSE PEHLE

**Kyun**
GST ke tehat invoice number financial year mein unique aur sequential hona chahiye.
Abhi teen alag code paths invoice banate hain, aur do non-atomic hain:

| Path | File | Numbering |
|---|---|---|
| UI / Server Action | `src/server/actions/invoices.ts:29` | ✅ RPC `gst_next_invoice_number` — atomic |
| WhatsApp voice bill | `src/server/billing/whatsapp-bill.ts:73` | ❌ `SELECT last_seq` → `UPSERT last_seq+1` |
| Recurring / cron | `src/app/api/cron/route.ts:41` | ❌ `SELECT last_seq` → `UPSERT last_seq+1` |

Ek WhatsApp bill aur ek UI bill same second mein save huye → duplicate number
(unique index pe error, user ko failure dikhega) ya counter interleave → **gap**.
Ye polish nahi, **compliance defect** hai. Pehle client ke saamne phata to bharosa
wapas nahi aata.

Yahi teen paths **stock movement** aur **GST totals** bhi alag-alag jagah likhte
hain — matlab teen jagah alag tarah se galat ho sakte hain.

**Files**
- Extract: `src/server/services/invoices.ts` (naya) — `createInvoice({ tenantId, userId, input, source })`
- `src/server/actions/invoices.ts` — patla wrapper ban jaaye (`safeParse` → `requireActiveContext` → service → `revalidatePath`)
- `src/server/billing/whatsapp-bill.ts` — apna `nextNumber()` hatao, service call karo
- `src/app/api/cron/route.ts` — apna `nextInvoiceNumber()` hatao, service call karo
- RPC pehle se sahi hai: `supabase/migrations/0010_fix_number_fn_devmode.sql`

**Done kab**
- [x] `grep -rn "invoice_counters" src/` sirf comments dikhaaye — teeno counter writes hat gaye
- [x] Teeno path `createInvoice()` se guzarte hain (`actions/invoices.ts:36`, `billing/whatsapp-bill.ts:232`, `api/cron/route.ts:93`)
- [ ] `npm run typecheck` clean
- [ ] `npm test` green
- [ ] `npm run lint` clean
- [ ] Concurrency test: 20 parallel `createInvoice()` calls → 20 unique numbers, zero gaps
- [ ] WhatsApp bill aur UI bill ka number format + ledger + stock behaviour bilkul identical
- [ ] Purane teeno path ka behaviour nahi badla (existing QA rounds dobara pass)

**Effort:** ~4-5 din · **Code likha ja chuka, verification baaki**

---

### A2. `/api/internal` ka cross-tenant hole 🔴

**Kyun**
Ek global `INTERNAL_API_TOKEN` hai, aur `tenant_id` request **body** se aata hai.
Route `createAdminClient()` use karta hai (RLS bypass). Matlab jiske paas token hai
wo **kisi bhi tenant** ka data padh aur likh sakta hai.

Abhi sirf demo tenant hai isliye dikh nahi raha. Doosra real tenant aate hi ye live
data-breach hai — aur agency model mein to har client ek tenant hai.

**Files**
- `src/app/api/internal/route.ts` (497 lines, 14 actions)
- Naya: per-tenant hashed API key model (Phase 0 report ka Phase 1/2 plan)

**Done kab**
- [ ] Har key exactly ek tenant se bandhi hai; `tenant_id` body se **nahi** aata
- [ ] Automated test: tenant A ki key se tenant B ka record maangne pe 403/404
- [ ] Key DB mein hashed (SHA-256 over 256-bit random), plaintext kabhi log nahi
- [ ] Purana `/api/internal` ya to hata diya, ya token rotate karke sirf ek tenant se bandha

**Effort:** ~5-6 din
**Blocked by:** A1 (service layer pehle chahiye)

**Open decision:** API-key request mein `auth.uid()` NULL hota hai, isliye
`is_tenant_member()` wali RLS **kaam nahi karegi**. Do options —
(a) app-layer chokepoint (jaisa abhi hai, risky), ya
(b) `set_config('request.jwt.claims', …)` se scoped connection taaki maujooda RLS
policies chalein. (b) behtar hai; Supabase connection pooling pe verify karna padega.

---

### A3. Integration tests 🟠

**Kyun**
Abhi sirf 3 pure unit tests hain — `gst.test.ts`, `ledger.test.ts`, `money.test.ts`.
Invoice creation, payment settlement, stock movement, tenant isolation — kuch bhi
covered nahi. Isiliye har change ke baad manual QA ka poora round chalana padta hai
(`AI_Munim_QA_Test_Report_Round1/2/3.docx` isi ka saboot hai).

Ye "complete karne" ka sabse dheema tareeka hai — har naya feature purane features
ko dobara manually test karwata hai.

**Files**
- `vitest.config.ts` — abhi `environment: "node"`, `include: src/**/*.test.ts`
- Naya: `src/test/fixtures.ts` — do tenants + parties + items ka seed
- Naye tests: `invoices.test.ts`, `payments.test.ts`, `tenant-isolation.test.ts`

**Done kab**
- [ ] Local Supabase (`supabase start`) ke against test suite chalti hai
- [ ] Invoice: GST intra/inter-state, numbering, stock deduction, party balance — covered
- [ ] Payment: partial, full, allocated-across-invoices, status transition — covered
- [ ] Tenant isolation: tenant A tenant B ka data na padh sakta hai na likh sakta hai
- [ ] `npm test` green, aur ek CI file (GitHub Action) pe chalti hai

**Effort:** ~4-5 din

**Dhyaan:** test **dev-persona cookie ke bina** chalein. `gst_dev_auth` cookie
`createClient()` ko service-role client bana deti hai
(`src/lib/supabase/server.ts:28`) — us mode mein RLS off hai aur isolation test
jhoota pass ho jayega.

---

### A4. Clean deploy dry-run 🟠

**Kyun**
`DEPLOY.md` bolta hai `cp .env.example .env.local`, par **wo file repo mein hai hi
nahi**. Matlab fresh clone se deploy ek baar bhi test nahi hua. Launch ke din ye
pata chalna sabse bura waqt hai.

Aur ek unresolved cheez: `DEPLOY.md` **Vercel + Supabase** document karta hai, par
plan **VPS + Docker + Nginx** ka hai. Ye do alag deployment hain — cron, background
jobs aur rate limiting teeno ka design isi pe depend karta hai.

**Files**
- Naya: `.env.example` (saare vars: Supabase, Razorpay, WhatsApp, `INTERNAL_API_TOKEN`, `CRON_SECRET`, `N8N_WEBHOOK_URL`, `SUPERADMIN_EMAILS`)
- `src/lib/env.ts` — abhi `INTERNAL_API_TOKEN`, `CRON_SECRET`, `WHATSAPP_*`, `N8N_WEBHOOK_URL` raw `process.env` se padhe jaate hain, zod validation ke bahar
- `DEPLOY.md` — actual deployment target ke hisaab se update

**Done kab**
- [ ] Fresh clone → `.env.example` copy → migrations → build → run, bina kisi undocumented step ke
- [ ] Missing env var pe saaf error message, silent failure nahi
- [ ] Deployment target final (Vercel **ya** VPS), `DEPLOY.md` usi ke hisaab se
- [ ] Cron trigger documented — abhi `/api/cron` ko **koi bhi automatically nahi bulaata**; repo mein na `vercel.json` cron hai, na pg_cron, na GitHub Action

**Effort:** ~2 din

---

## Section B — Raaste ke hisaab se (ek chuno)

Section A ke baad ye faisla lena aasan hoga, kyunki tab tak pata hoga bacha hua kaam
kitna hai.

### B-SELF — Agar self-serve SaaS

- [ ] `NEXT_PUBLIC_REAL_AUTH_ENABLED` on + real signup/login/OTP ka poora testing
- [ ] Razorpay live (`README` khud kehta hai "stubbed in MVP"; `src/lib/razorpay.ts`)
- [ ] Subscription lifecycle: trial → expiry → upgrade → renewal → lapse
- [ ] Plan gating enforce (`src/server/gating.ts` `FEATURE_PLANS`, `canCreateInvoice`)
- [ ] Onboarding jo bina tumhari madad ke complete ho jaaye
- [ ] Dev-persona bypass production build mein band (`gst_dev_auth`)

**Effort:** ~4-5 hafte

### B-AGENCY — Agar agency delivery platform

- [ ] Ingest API `/api/v1/ingest/*` (party, invoice, payment, expense, lead)
- [ ] Idempotency (`Idempotency-Key` mandatory) — n8n retry karta hai, duplicate invoice acceptable nahi
- [ ] Outbound webhooks + HMAC signing (`invoice.created`, `payment.received`, `invoice.overdue`, `stock.low`)
- [ ] Activity Log screen — `aimunim_notification_logs` **pehle se bhar raha hai, par UI kahin nahi hai**
- [ ] `docs/automation-api.yaml` (OpenAPI) taaki n8n workflow source code padhe bina ban sake

**Effort:** ~3 hafte
**Note:** signup, Razorpay, plan gating — teeno skip. Tenant tum manually banate ho.

---

## Section C — Launch ke liye zaroori NAHI

Ye cheezein dikhengi adhoori, par inpe ruko mat. Launch ke baad, real usage dekh kar.

- Mobile app / PWA
- e-Invoice (IRN + QR via GSP) aur e-Way bill — `src/server/actions/einvoice.ts` abhi stub hai
- GSTR-1 / GSTR-3B export
- Multi-godown ka poora flow
- Barcode scan-to-bill
- Manual webhook retry button (delivery history dikhna kaafi hai)
- Detailed API scopes model (v1 mein `read`/`write` bas)
- Custom invoice themes (1-2 kaafi hain)
- Floating promises ko `after()` mein migrate karna (`logAudit`, invoice auto-share, WhatsApp→n8n forward) — serverless pe risk hai, par abhi data loss nahi ho raha

---

## Known bugs (logged, abhi fix nahi)

| # | Bug | File | Section |
|---|---|---|---|
| 1 | Non-atomic invoice numbering (2 jagah) | `whatsapp-bill.ts:73`, `api/cron/route.ts:41` | A1 |
| 2 | Global token se kisi bhi tenant tak pahunch | `api/internal/route.ts` | A2 |
| 3 | ~~`.env.example` missing~~ — **ye claim galat tha, file maujood thi.** Asli problem alag aur zyada serious nikli, neeche #8 dekhein | `.env.example` | A4 |
| 4 | Floating promises serverless pe kat sakte hain | `server/audit.ts`, `actions/invoices.ts:227` | C |
| 5 | `README` `GST_` table prefix bolta hai, actual `aimunim_` hai | `README.md` | C |
| 6 | Dev-persona cookie RLS poori tarah bypass karti hai | `lib/supabase/server.ts:28` | B-SELF |
| 11 | **Webhook retry backoff (1min / 5min / 25min) bekaar hai** — retry sirf cron sweep se hota hai, aur `vercel.json` mein cron **din mein ek baar** (`30 3 * * *`) chalta hai. Yaani fail hui delivery 1 minute baad nahi, **agle din** retry hogi | `vercel.json`, `dispatch.ts` | **faisla chahiye** |
| 10 | **Nayi API key ka secret dialog se apne aap gayab ho jaata tha** — `refreshWithRetry` ke baar-baar RSC refresh se dialog remount hota tha aur `secret` state reset. Ek hi baar dikhne wali key user ke copy karne se pehle chali jaati. Ab refresh dialog band hone ke baad hota hai | `automation-client.tsx` | ✅ fixed |
| 9 | **Automated Bills + payment reminders production mein chal hi nahi rahe the** — `/api/cron` ko koi trigger nahi karta tha (na `vercel.json`, na pg_cron). Upar se Vercel Cron **GET** bhejta hai jabki route sirf POST export karta tha. Dono fix: `vercel.json` + `export const GET = POST` | `api/cron/route.ts`, `vercel.json` | ✅ fixed |
| 7 | Plan ka monthly invoice cap **sirf UI pe** lagta hai — WhatsApp voice bill aur recurring bill dono bypass karte hain | `server/gating.ts` `canCreateInvoice` | **faisla chahiye** |

### #11 pe faisla chahiye — sweep kitni baar chale

Delivery retry ka backoff 1/5/25 minute ka hai, par sweep din mein ek baar chalta
hai. Teen raaste:

1. **n8n se sweep trigger karein (recommended)** — n8n Schedule node har 5 minute
   `POST /api/cron` maare. Free hai, aapke paas n8n pehle se hai, aur agency model
   mein fit baithta hai. Billing wala kaam din mein ek hi baar chalega kyunki wo
   date se guard hai.
2. **Vercel cron badhayein** — `vercel.json` mein `*/5 * * * *`. Hobby plan pe
   **daily se zyada allowed nahi** hai; Pro chahiye.
3. **Backoff ko din-bhar ka bana dein** — 1min/5min/25min ki jagah 6/12/24 ghante.
   Imaandaar hai par n8n down hone par reminder ek din late.

**Hal ho gaya:** ab ek alag halka endpoint hai — `POST /api/cron/sweep` — jo sirf
pending deliveries retry karta hai, billing ko haath nahi lagata. Isliye har 5
minute chalana safe hai.

- **Hobby plan:** n8n Schedule node se har 5 minute maarein
  (`docs/n8n-examples/README.md` me steps hain)
- **Pro plan:** `vercel.json` me ek aur cron entry `*/5 * * * *`

Jab tak koi ek nahi lagta, retry practically **daily** rahega.

### 🔴 #8 — `.env.example` mein LIVE credentials pade the

`.env.example` mein placeholder nahi, **asli values** thin:

- `SUPABASE_SERVICE_ROLE_KEY` — poora RLS bypass karne wala JWT
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` + project URL
- `RAZORPAY_KEY_ID=rzp_live_…` aur `RAZORPAY_KEY_SECRET` — **live** keys, test nahi

File ab sanitize ho chuki hai (sirf placeholders).

**Rahat ki baat:** `.gitignore` mein `.env*` hai, aur `git ls-files` confirm karta
hai ki file **kabhi commit nahi hui**. Yaani public repo mein leak nahi hui.

**Phir bhi dono credentials rotate kar dein.** Wajah: file `.example` naam se thi —
jise log normally share karte hain, zip karte hain, screen pe kholte hain. Main ye
nahi keh sakta ki 10 July se ab tak wo kahin gayi ya nahi. Rotation sasta hai,
service_role key ka leak nahi.

- Supabase → Project Settings → API → service_role key roll karein
- Razorpay → Settings → API Keys → regenerate

**#7 pe faisla chahiye.** A1 refactor mein `checkPlanLimit` optional rakha gaya hai
aur non-UI paths use pass nahi karte — yaani aaj ka behaviour jaisa tha waisa hai.
Do raay:

- **Cap lagao** — warna Silver wala poora mahina WhatsApp se unlimited bill kaat lega aur plan ka matlab hi khatam
- **Cap mat lagao** — owner beech dukaan mein bol raha hai; "limit khatam" ka error WhatsApp pe milna matlab sale ruk gayi

Beech ka raasta: bill ban jaaye, par owner ko WhatsApp pe warning jaaye ("is mahine
ka limit khatam ho raha hai — upgrade karein"). Ye business rule hai, isliye jab
tak faisla nahi hota tab tak behaviour purana hi rahega.

---

## Pilot phase (launch se pehle, bechna nahi)

Section A khatam hone ke baad, **2-3 free pilot tenants** lo — bechne ke liye nahi,
QA ke liye. Saaf bolo: *"testing chal rahi hai, aapka data safe rahega, feedback
chahiye."* Koi paisa nahi, koi contract nahi.

Kyun: 6 hafte ka real usage wo cheezein nikaalta hai jo 6 mahine ki solo QA nahi
nikaal sakti — aur "adhoora product bech diya" wali baat bhi nahi hoti.

**Pilot se ye 4 sawaal ka jawaab chahiye:**

1. Owner roz kaunsi 3 screens kholta hai? (baaki sab secondary hai)
2. Kaunsa step aisa hai jahan wo atak kar phone karta hai? (wahi onboarding gap hai)
3. WhatsApp voice bill kitni baar use hota hai vs manual entry? (yahi tumhara USP hai ya nahi, pata chal jayega)
4. Kya usne kabhi khud dashboard kholi, ya sirf WhatsApp summary padhta hai?

**Pilot exit:** 6 hafte, ya jab teeno pilot bina help ke ek poora hafta chala lein —
jo pehle ho.

---

## Open decisions

| # | Sawaal | Kis pe asar |
|---|---|---|
| ~~1~~ | ~~Deployment: Vercel ya VPS?~~ — **Vercel confirmed** (28 Jul deploy) | tay ho gaya |
| 2 | Migration source of truth: `migrations/000*.sql` ya `aimunim_final_schema.sql`? | har naya migration |
| 3 | API-key tenant isolation: app-layer ya `set_config` RLS? | A2 |
| 4 | `/api/cron` ko production mein abhi kaun trigger karta hai? | A4 |
| 5 | Self-serve ya agency pehle? | Section B |

---

## Progress

- [x] **A1** — Invoice numbering + service layer · *code done, verification pending*
- [x] **A2** — Per-tenant API keys + ingest surface · *code done, verification pending*
- [~] **A3** — Tests: pure unit tests done; DB integration tests likhe hain par
      chale nahi (`supabase start` chahiye)
- [x] **A4** — `.env.example` sanitize + deploy notes · *credentials rotate karna baaki*
- [ ] **Verification gate** — `npm run typecheck && npm test && npm run lint` +
      integration suite ek baar DB ke against
- [ ] **Pilot** — 2-3 free tenants, 6 hafte
- [ ] **Section B** — raasta chunkar

### Production smoke test — 28 Jul, PASS ✅

Live deployment pe browser se chalaya gaya (`aimunim.aivexallp.com`):

| Test | Result |
|---|---|
| Bina auth header | `401 unauthorized` ✓ |
| Galat key / galat prefix | `401 invalid_api_key` ✓ |
| `Idempotency-Key` nadarad | `400 idempotency_key_required` ✓ |
| Invoice create | `201` — `INV/2627/00002`, ₹236.00 ✓ |
| **Wahi key dobara** | **`Idempotency-Replayed: true`, wahi invoice id — naya invoice NAHI bana** ✓ |
| Wahi key, alag body | `409 idempotency_key_reused` ✓ |
| Galat field | `422` + `lines.0.rate: Rate can't be negative.` ✓ |
| Key UI se banti hai, secret ek baar dikhta hai | ✓ |
| `last_used_at` track hota hai | ✓ |
| Activity Log mein har request dikhti hai | ✓ |
| **API invoice UI invoice jaisa hi hai** | Tax Invoice layout, intra-state CGST+SGST auto-detect, ₹200 taxable + ₹18 + ₹18 = ₹236, saare actions (PDF/WhatsApp/Edit/Record payment) available ✓ |

Yaani **n8n ka retry duplicate invoice nahi banayega** — A2 ki sabse zaroori
guarantee production mein prove ho chuki hai.

Abhi bhi baaki: `npm test` (unit) aur integration suite (`supabase start` wali) —
gapless numbering *under concurrency* aur cross-tenant denial abhi tak sirf likhe
hue tests hain, chalaye nahi gaye.

### Verification gate — ye poora hue bina A1/A2 "done" nahi hain

Saara code sandbox mein likha gaya hai jahan `node_modules` Windows-native hai
(rolldown ka linux binary nahi hai) aur `tsc` per-call time limit se zyada leta
hai. Yaani **ek bhi line chal kar verify nahi hui hai.**

```bash
npm run typecheck
npm test
npm run lint

# integration suite (asli guarantees yahin prove hoti hain)
supabase start && supabase db push
SUPABASE_TEST_URL=http://127.0.0.1:54321 \
SUPABASE_TEST_SERVICE_KEY=<local service_role> \
npm test
```

Scratch file `tsconfig.check.json` bhi delete kar dein — sandbox se permission
nahi mili.

## Aage kya (Section A ke baad)

Automation surface ka backend ban chuka hai, par ye abhi baaki hai:

- [x] ~~Automation UI~~ — ban gaya: `app/(app)/automation/`, sidebar +
  `ROLE_ROUTES` dono wired
- [x] ~~OpenAPI spec~~ — `docs/automation-api.yaml` (4 endpoints, 6 schemas)
- [x] ~~n8n example workflows~~ — `docs/n8n-examples/` (3 workflows + README)
- **Outbound webhooks** — events, HMAC signing, retry/backoff
- **n8n example workflows** `docs/n8n-examples/`
- **`/api/internal` deprecate karna** — ab bhi live hai aur ab bhi kisi bhi
  tenant tak pahunch sakta hai (bug #2)
