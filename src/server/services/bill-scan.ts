import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { rupeesToPaise, paiseToRupees } from "@/lib/money";
import { logAudit } from "@/server/audit";
import { createExpense } from "@/server/services/expenses";
import { createInvoice, type DbClient } from "@/server/services/invoices";
import { createParty } from "@/server/services/parties";
import {
  billScanExtractionSchema,
  billScanConfirmSchema,
  type BillScanExtraction,
  type BillScanConfirmInput,
  type BillScanType,
} from "@/lib/validation/bill-scan";
import type { BillScanRow } from "@/lib/database.types";

const normalizeName = (s: string) => s.toLowerCase().trim().replace(/\s+/g, " ");

/**
 * Match an existing supplier/both party by name, or create one — same
 * "auto-profile on first bill" pattern the WhatsApp billing engine uses for
 * customers (server/billing/whatsapp-bill.ts). Lets a "purchase" scan land on
 * the right party ledger without the owner typing it in twice.
 *
 * The AI doesn't extract the vendor name identically every time (e.g. "Test
 * Traders" one scan, "Test Traders Wholesale Supplier" the next, off the same
 * bill header) — a plain equality/ILIKE check would create a duplicate
 * supplier per phrasing. So this pulls the tenant's existing suppliers and
 * does a normalized, bidirectional substring match in JS instead of a single
 * SQL pattern (there's no one ILIKE pattern that catches "A contains B" and
 * "B contains A" at once).
 */
async function findOrCreateSupplierParty(
  db: DbClient,
  tenantId: string,
  userId: string | null | undefined,
  vendorName: string | null | undefined,
): Promise<string | null> {
  const name = vendorName?.trim();
  if (!name) return null;
  const target = normalizeName(name);

  const { data: candidates } = await db
    .from("aimunim_parties")
    .select("id, name")
    .eq("tenant_id", tenantId)
    .in("type", ["supplier", "both"]);

  const match = (candidates ?? []).find((p) => {
    const existingName = normalizeName(p.name);
    return existingName === target || existingName.includes(target) || target.includes(existingName);
  });
  if (match) return match.id;

  const res = await createParty({
    db,
    tenantId,
    userId,
    input: { type: "supplier", name, opening_balance: 0, credit_period_days: 0, credit_limit: 0 },
    source: "bill_scan",
  });
  return res.id ?? null;
}

const BUCKET = "bill-scans";

/**
 * OpenRouter vision models to try, in order. The cheap paid model goes FIRST:
 * free-tier models on OpenRouter are frequently queued/slow (a single scan
 * measured 50-60s falling through 3 free models before landing on this one),
 * which is a bad wait for someone scanning a bill, and they're occasionally
 * deprecated/renamed by upstream (check
 * https://openrouter.ai/collections/free-models if these start 404ing).
 * Free models stay as a fallback in case the paid one is ever down.
 * Override with OPENROUTER_VISION_MODEL to pin a single model.
 */
const DEFAULT_MODEL_CHAIN = [
  "google/gemini-3.1-flash-lite", // fast + cheap — primary
  "nvidia/nemotron-nano-12b-v2-vl:free", // document/OCR-tuned fallback
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
];

/** Per-model request timeout — don't let one slow/queued model eat the whole scan. */
const MODEL_TIMEOUT_MS = 20_000;

// ---- Image upload ------------------------------------------------------------

export async function uploadBillImage(
  tenantId: string,
  scanId: string,
  file: File,
): Promise<string> {
  if (!file || file.size === 0) throw new Error("Bill image is required.");
  if (file.size > 8 * 1024 * 1024) throw new Error("File max 8 MB honi chahiye.");
  if (!/^image\/(png|jpe?g|webp|heic|heif)$/.test(file.type) && file.type !== "application/pdf") {
    throw new Error("PNG/JPG/WEBP image ya PDF hi chalega.");
  }
  const ext =
    file.type === "application/pdf" ? "pdf" : file.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const path = `${tenantId}/${scanId}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: true,
    });
  if (error) throw new Error(error.message);
  return path;
}

/** Short-lived signed URL to render a scanned bill photo in the UI. */
export async function getBillImageUrl(path: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

// ---- AI extraction ------------------------------------------------------------

const EXTRACTION_PROMPT = `You are reading a photo of a business bill/receipt from an Indian small business (could be a purchase bill, an expense receipt, or something else). Extract the following fields and reply with ONLY a single JSON object, no markdown fences, no explanation:

{
  "vendor_name": string or null — the shop/supplier/vendor name on the bill,
  "bill_date": string or null — date in YYYY-MM-DD format (guess the year if only day/month is legible; if you cannot read a date, use null),
  "amount": number or null — the final total/grand total amount in rupees (not paise), as a plain number without currency symbols or commas,
  "category": string or null — a short category such as "Purchase", "Rent", "Transport", "Electricity", "Office Supplies", "Maintenance", "Marketing", "Miscellaneous",
  "type": one of "purchase", "expense", "other" — "purchase" if this looks like a stock/goods purchase bill from a supplier, "expense" if it's a business running expense (rent, electricity, transport, etc.), "other" if unclear,
  "confidence": one of "high", "medium", "low" — your confidence in the extracted amount and date
}

If the image is not a bill/receipt at all, set all fields to null except confidence: "low".`;

async function callOpenRouterVision(
  model: string,
  dataUrl: string,
  mimeType: string,
  apiKey: string,
): Promise<unknown> {
  // PDFs go through OpenRouter's "file" content part (document understanding,
  // supported by Gemini/Claude-family models); photos use "image_url" as usual.
  const filePart =
    mimeType === "application/pdf"
      ? { type: "file", file: { filename: "bill.pdf", file_data: dataUrl } }
      : { type: "image_url", image_url: { url: dataUrl } };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://aimunim.app",
      "X-Title": "AI Munim - Bill Scan",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: EXTRACTION_PROMPT }, filePart],
        },
      ],
      temperature: 0,
      max_tokens: 500,
      ...(mimeType === "application/pdf"
        ? { plugins: [{ id: "file-parser", pdf: { engine: "native" } }] }
        : {}),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${model} failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content;
  if (!content) throw new Error(`OpenRouter ${model} returned no content.`);

  // Strip ```json fences if the model added them despite instructions.
  const cleaned = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error(`OpenRouter ${model} did not return JSON.`);

  return JSON.parse(cleaned.slice(start, end + 1));
}

export type ExtractResult =
  | { ok: true; data: BillScanExtraction; modelUsed: string }
  | { ok: false; error: string };

/** Scan a bill image and extract vendor/date/amount/category via OpenRouter. */
export async function extractBillData(
  imageBuffer: Buffer,
  mimeType: string,
): Promise<ExtractResult> {
  const { OPENROUTER_API_KEY, OPENROUTER_VISION_MODEL } = getServerEnv();
  if (!OPENROUTER_API_KEY) {
    return {
      ok: false,
      error: "Bill scanning abhi configure nahi hai (OPENROUTER_API_KEY missing).",
    };
  }

  const dataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  const modelChain = OPENROUTER_VISION_MODEL ? [OPENROUTER_VISION_MODEL] : DEFAULT_MODEL_CHAIN;

  let lastError = "";
  for (const model of modelChain) {
    try {
      const raw = await callOpenRouterVision(model, dataUrl, mimeType, OPENROUTER_API_KEY);
      const parsed = billScanExtractionSchema.safeParse(raw);
      if (!parsed.success) {
        lastError = `${model}: unexpected response shape.`;
        continue;
      }
      return { ok: true, data: parsed.data, modelUsed: model };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  return { ok: false, error: lastError || "Bill scan failed. Try again." };
}

// ---- CRUD orchestration --------------------------------------------------------

export type CreateBillScanResult = { row?: BillScanRow; error?: string };

/** Upload the photo, run AI extraction, and store a 'pending' review row. */
export async function createBillScan(params: {
  db: DbClient;
  tenantId: string;
  userId?: string | null;
  file: File;
  type: BillScanType;
}): Promise<CreateBillScanResult> {
  const { db, tenantId, userId, file, type } = params;

  const { data: inserted, error: insertErr } = await db
    .from("aimunim_bill_scans")
    .insert({ tenant_id: tenantId, type, image_path: "", status: "pending", created_by: userId ?? null })
    .select("*")
    .single();
  if (insertErr || !inserted) return { error: insertErr?.message ?? "Could not start bill scan." };

  let imagePath: string;
  try {
    imagePath = await uploadBillImage(tenantId, inserted.id, file);
  } catch (e) {
    await db.from("aimunim_bill_scans").delete().eq("id", inserted.id);
    return { error: e instanceof Error ? e.message : "Image upload failed." };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const extraction = await extractBillData(buffer, file.type);

  const update: Partial<BillScanRow> = { image_path: imagePath };
  if (extraction.ok) {
    const d = extraction.data;
    update.vendor_name = d.vendor_name ?? null;
    update.bill_date = d.bill_date ?? null;
    update.amount_paise = typeof d.amount === "number" ? rupeesToPaise(d.amount) : null;
    update.category = d.category ?? null;
    update.type = d.type ?? type;
    update.raw_extracted = d;
    update.ai_error = null;
  } else {
    update.ai_error = extraction.error;
  }

  const { data: updated, error: updateErr } = await db
    .from("aimunim_bill_scans")
    .update(update)
    .eq("id", inserted.id)
    .select("*")
    .single();
  if (updateErr || !updated) return { error: updateErr?.message ?? "Could not save scan result." };

  logAudit({
    tenantId,
    userId: userId ?? null,
    action: "bill_scan.created",
    entityType: "bill_scan",
    entityId: updated.id,
    data: { type, ai_ok: extraction.ok },
  });

  return { row: updated as BillScanRow };
}

export type ConfirmBillScanResult = { row?: BillScanRow; error?: string };

/**
 * Owner reviewed/edited the extracted fields — save, and post the matching
 * record: 'expense' → aimunim_expenses, 'purchase' → a purchase invoice
 * (aimunim_invoices, direction='purchase') against a matched/new supplier
 * party, 'other' → the scan row only, nothing posted.
 */
export async function confirmBillScan(params: {
  db: DbClient;
  tenantId: string;
  userId?: string | null;
  input: BillScanConfirmInput;
}): Promise<ConfirmBillScanResult> {
  const parsed = billScanConfirmSchema.safeParse(params.input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid data." };
  const v = parsed.data;
  const { db, tenantId, userId } = params;

  const { data: existing } = await db
    .from("aimunim_bill_scans")
    .select("id")
    .eq("id", v.id)
    .eq("tenant_id", tenantId)
    .single();
  if (!existing) return { error: "Bill scan not found." };

  let expenseId: string | null = null;
  let invoiceId: string | null = null;

  if (v.type === "expense") {
    const res = await createExpense({
      db,
      tenantId,
      userId,
      input: {
        category: v.category,
        amount: v.amount,
        expense_date: v.bill_date,
        payment_mode: "other",
        partyId: null,
        notes: [v.vendor_name && `Vendor: ${v.vendor_name}`, v.notes].filter(Boolean).join(" — ") || undefined,
      },
      source: "bill_scan",
    });
    if (res.error) return { error: res.error };
    expenseId = res.id ?? null;
  } else if (v.type === "purchase") {
    // A purchase bill belongs on the Purchases side (Invoices & Vouchers) and
    // the supplier's party ledger, not in Expenses — see server/actions/bill-scan.ts.
    const partyId = await findOrCreateSupplierParty(db, tenantId, userId, v.vendor_name);
    const res = await createInvoice({
      db,
      tenantId,
      userId,
      source: "ui",
      autoShare: false, // don't WhatsApp a "purchase bill" PDF to the supplier
      input: {
        direction: "purchase",
        voucherType: "invoice",
        invoiceType: "non_gst", // scanned total only — no real GST breakup to trust
        partyId,
        invoiceDate: v.bill_date,
        additionalCharges: 0,
        roundOff: true,
        notes: v.notes || undefined,
        status: "final",
        lines: [
          {
            name: v.category || "Purchase",
            unit: "PCS",
            qty: 1,
            rate: v.amount,
            taxRate: 0,
            discountPercent: 0,
          },
        ],
      },
    });
    if (res.error) return { error: res.error };
    invoiceId = res.id ?? null;
  }

  const { data: updated, error } = await db
    .from("aimunim_bill_scans")
    .update({
      type: v.type,
      status: "confirmed",
      vendor_name: v.vendor_name || null,
      bill_date: v.bill_date,
      amount_paise: rupeesToPaise(v.amount),
      category: v.category,
      notes: v.notes || null,
      expense_id: expenseId,
      invoice_id: invoiceId,
    })
    .eq("id", v.id)
    .eq("tenant_id", tenantId)
    .select("*")
    .single();
  if (error || !updated) return { error: error?.message ?? "Could not confirm bill scan." };

  logAudit({
    tenantId,
    userId: userId ?? null,
    action: "bill_scan.confirmed",
    entityType: "bill_scan",
    entityId: updated.id,
    data: { type: v.type, expense_id: expenseId, invoice_id: invoiceId },
  });

  return { row: updated as BillScanRow };
}

export function billScanAmountRupees(row: BillScanRow): number | null {
  return row.amount_paise == null ? null : paiseToRupees(row.amount_paise);
}
