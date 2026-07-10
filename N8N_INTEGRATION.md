# n8n Integration Guide — WhatsApp Billing (DukaanMitra Module 2)

App ka pura "bolke bill banao" flow n8n me banta hai. Architecture:

```
Owner WhatsApp voice/text
   → WhatsApp Business API (360dialog/Wati/Meta Cloud)
   → n8n webhook (ya app ka /api/webhooks/whatsapp jo N8N_WEBHOOK_URL pe forward karta hai)
   → n8n: [voice ho to STT] → Claude se intent + structured JSON parse
   → is app ka /api/internal (Bearer INTERNAL_API_TOKEN)
   → app: bill/payment/summary process karke JSON return karta hai
   → n8n: reply WhatsApp par bhej deta hai
```

## Setup

`.env.local` me:

```
INTERNAL_API_TOKEN=<koi-strong-secret>     # n8n HTTP Request node me Bearer token
N8N_WEBHOOK_URL=https://<n8n>/webhook/...  # inbound WhatsApp forward (optional)
```

Demo tenant id: `11111111-1111-1111-1111-111111111111`

Har request: `POST https://<app>/api/internal`
Headers: `Authorization: Bearer <INTERNAL_API_TOKEN>`, `Content-Type: application/json`

---

## Actions

### 1. `create_bill` — B01 Voice Bill (hero)

Owner bola: *"Ramesh ne liya 3kg aata 120, 1L tel 150, udhaar pe"* → Claude se ye JSON parse karwao:

```json
{
  "action": "create_bill",
  "tenant_id": "11111111-1111-1111-1111-111111111111",
  "customer": { "name": "Ramesh", "phone": "9811111111" },
  "items": [
    { "name": "aata", "qty": 3, "rate": 40 },
    { "name": "tel", "qty": 1, "rate": 150 }
  ],
  "payment_mode": "credit",
  "notes": "WhatsApp voice bill"
}
```

- `customer` optional (cash sale), lekin `payment_mode: "credit"` ke liye required — naya customer auto-create hota hai (B03)
- `items[].rate` (rupees) optional — catalog me item mile to catalog price lagta hai (wholesale party ho to wholesale price); owner ka bola rate ho to wahi jeet-ta hai
- `payment_mode`: `cash` | `upi` | `bank` | `card` | `credit` (credit = udhar ledger, B04)
- `voucher_type`: `invoice` (default) | `sales_return` | `credit_note` (B07 — return pe stock wapas + balance minus)
- Customer ke phone par PDF link auto-send hota hai (`auto_share: false` se band)

Response me `bill.number`, `bill.total`, `bill.pdf_url`, `bill.customer_outstanding_paise` milta hai — n8n se owner ko confirm bhejo:
> "Bill INV/2627/00012 ready! Total ₹270 (udhaar). Ramesh ka total baaki: ₹720. PDF bhej diya."

### 2. `record_payment` — B04/B06

*"Ramesh ne 200 diye"*:

```json
{ "action": "record_payment", "tenant_id": "...", "party": { "name": "Ramesh" }, "amount": 200, "mode": "cash" }
```

Response: `received`, `new_outstanding`.

### 3. `today_summary` — B06 / W02 daily summary

*"Aaj kitna hua?"*:

```json
{ "action": "today_summary", "tenant_id": "..." }
```

Response: `sales`, `bills`, `received_by_mode` (cash/upi split), `credit_given`, `expenses`. (`date: "2026-07-10"` se kisi bhi din ka.)

### 4. `outstanding_list` — B04 udhar

*"Kaun kaun baaki hai?"* → `{ "action": "outstanding_list", "tenant_id": "..." }`
Response: total + top-25 parties with amounts.

### 5. `party_summary` — B03 customer history

*"Ramesh ka kya hisaab hai?"* → `{ "action": "party_summary", "tenant_id": "...", "party": { "name": "Ramesh" } }`
Response: outstanding, is month ka total, recent 10 bills.

### 6. `lookup_item` / `update_item_price` — B02 catalog

*"Aata ka price kya hai?"* → `{ "action": "lookup_item", "tenant_id": "...", "item": "aata" }`
*"Aata price update karo 245"* → `{ "action": "update_item_price", "tenant_id": "...", "item": "aata", "price": 245 }`
(`wholesale_price` bhi bhej sakte hain.)

### 7. `low_stock` — W05

*"Stock low kya hai?"* → `{ "action": "low_stock", "tenant_id": "..." }`

### 8. Pehle se maujood

`send_message`, `lookup_party`, `lookup_invoice`, `create_reminder` (W03 payment reminder — party ke saare unpaid bills ka total leke polite reminder bhejta hai).

---

## n8n workflow blueprint (suggested nodes)

1. **Webhook** — WhatsApp inbound (ya app ke `/api/webhooks/whatsapp` se forward)
2. **IF voice** → STT (Sarvam/Whisper) → text
3. **Claude node** — system prompt: *"Tum ek billing parser ho. Owner ke Hindi/Bhojpuri message se intent nikalo aur neeche diye actions me se ek ka JSON banao: create_bill / record_payment / today_summary / outstanding_list / party_summary / lookup_item / update_item_price / low_stock. Sirf JSON return karo."*
4. **HTTP Request** — `POST /api/internal`, Bearer token, Claude ka JSON body me (tenant_id inject karo)
5. **Claude node (optional)** — API response ko friendly Hindi reply me convert karo
6. **WhatsApp send** — owner ko reply

Cron bhi n8n se chala sakte hain: **Schedule node (daily)** → `POST /api/cron` (Bearer `CRON_SECRET`) — recurring bills + reminders.
