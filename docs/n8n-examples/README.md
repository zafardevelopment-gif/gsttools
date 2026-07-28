# n8n example workflows

Teen ready-to-import workflows. Har ek ko n8n me **Import from File** karke
credentials aur URLs badal lein.

Full API reference: [`../automation-api.yaml`](../automation-api.yaml)

---

## Pehle ek baar ka setup

**1. AI Munim me Automation on karein**
`/automation` → *Automation on karein* → **API Keys** → *Nayi key*.
Key sirf ek baar dikhti hai — turant copy karein.

**2. n8n me credential banayein**
Credentials → **Header Auth**:

| | |
|---|---|
| Name | `Authorization` |
| Value | `Bearer amk_live_…` |

Har HTTP Request node me isi credential ko use karein. Key ko kabhi node ke
andar hardcode na karein — n8n export me plaintext chala jayega.

**3. Webhook lagayein (workflow 2 aur 3 ke liye)**
`/automation` → **Webhooks** → *Naya webhook*, aur n8n ke Webhook node ka
**Production URL** paste karein. Sirf `https` chalega.

---

## Idempotency — sabse zaroori baat

Har write request me `Idempotency-Key` header **zaroori** hai.

```
Idempotency-Key: {{ $execution.id }}
```

n8n network problem pe apne aap retry karta hai. Bina is header ke ek hi bill
do baar ban jayega, aur GST me invoice number series kharab ho jayegi. Isi key
ke saath dobara bhejenge to purana hi jawab wapas milta hai — naya record nahi
banta.

---

## 1. `01-lead-to-party.json` — Form se party + WhatsApp reply

**Kya karta hai:** website/Meta form → AI Munim me customer banata hai →
customer ko turant WhatsApp acknowledgement.

**Kyun:** Playbook ka W1. Lead 30 second me reply paati hai, aur uska record
sales bande ke phone me nahi, business ke system me rehta hai.

**Badalna hoga:**
- Webhook node ka path
- `AI_MUNIM_URL`
- WhatsApp node ki credentials

**Note:** party create hone par AI Munim khud `party.created` event bhejta hai.
Agar aap us event pe alag workflow chala rahe hain to yahan WhatsApp step hata
dein, warna do message jayenge.

---

## 2. `02-overdue-reminder.json` — Overdue par staged reminder

**Kya karta hai:** `invoice.overdue` webhook aata hai → signature verify karta
hai → customer ko WhatsApp reminder → 3 din intezaar → agar tab tak payment
nahi aayi to doosra reminder.

**Kyun:** Playbook ka W6 payment reminder ladder.

**Payment aane par ruk jaata hai:** doosra reminder bhejne se pehle workflow
`payment.received` events check karta hai. AI Munim automatic band nahi karta —
ye check aapke workflow me hona zaroori hai.

**Signature verification** pehle node me hai. Isko hataayein mat: uske bina koi
bhi aapke webhook URL par fake "overdue" bhej kar aapke customers ko message
karwa sakta hai.

---

## 3. `03-daily-summary.json` — Roz raat ka summary

**Kya karta hai:** roz 9 baje chalta hai → din ka sales/collection nikaalta hai
→ owner ko WhatsApp par ek chhota summary.

**Kyun:** Playbook ka W7, aur Chapter 9 ka "churn insurance" — jo system dikhta
nahi, uske paise dene ka mann nahi karta.

**Setup:** Schedule node me apna timezone set karein.

---

## Bonus: retry sweep (5 minute wala)

Failed webhook delivery ka retry backoff 1 / 5 / 25 minute ka hai, lekin usko
chalane wala sweep khud trigger hona chahiye. Agar aapka Vercel plan roz se
zyada cron allow nahi karta, to n8n se karein:

**Schedule Trigger** (har 5 minute) → **HTTP Request**

```
POST  https://<app>/api/cron/sweep
Header: Authorization: Bearer <CRON_SECRET>
```

Ye endpoint sirf pending deliveries retry karta hai — billing ko haath nahi
lagata, isliye baar-baar chalana safe hai.

---

## Signature verify karne ka code

Workflow 2 me ye Function node pehle se hai. Kisi bhi doosre workflow me chahiye
to yahi copy karein:

```js
const crypto = require('crypto');

const SECRET = 'whsec_…';                    // Automation → Webhooks se
const raw    = JSON.stringify($json.body);
const header = $json.headers['x-aimunim-signature'];

const parts = Object.fromEntries(header.split(',').map(kv => kv.split('=')));
const t = Number(parts.t);

// 5 minute se purani request reject — replay attack rokne ke liye
if (Math.abs(Math.floor(Date.now() / 1000) - t) > 300) {
  throw new Error('Signature too old');
}

const expected = crypto
  .createHmac('sha256', SECRET)
  .update(`${t}.${raw}`)
  .digest('hex');

if (expected !== parts.v1) {
  throw new Error('Bad signature');
}

return items;
```

Dhyaan dein: HMAC `timestamp + "." + body` par hai, sirf body par nahi. Isi wajah
se koi purani valid request pakad kar dobara nahi bhej sakta.
