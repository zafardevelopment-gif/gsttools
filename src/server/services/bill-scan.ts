import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { getServerEnv } from "@/lib/env";
import { rupeesToPaise, paiseToRupees } from "@/lib/money";
import { logAudit } from "@/server/audit";
import { createExpense } from "@/server/services/expenses";
import {
  billScanExtractionSchema,
  billScanConfirmSchema,
  type BillScanExtraction,
  type BillScanConfirmInput,
  type BillScanType,
} from "@/lib/validation/bill-scan";
import type { DbClient } from "@/server/services/invoices";
import type { BillScanRow } from "@/lib/database.types";

const BUCKET = "bill-scans";

/**
 * OpenRouter vision models to try, in order. Free tiers first (rate-limited
 * and occasionally deprecated by upstream), then a cheap paid fallback so
 * scanning still works if every free option is unavailable that day.
 * Override with OPENROUTER_VISION_MODEL to pin a single model.
 */
const DEFAULT_MODEL_CHAIN = [
  "google/gemini-2.0-flash-exp:free",
  "qwen/qwen2.5-vl-72b-instruct:free",
  "meta-llama/llama-3.2-11b-vision-instruct:free",
  "google/gemini-flash-1.5-8b",
];

// ---- Image upload ------------------------------------------------------------

export async function uploadBillImage(
  tenantId: string,
  scanId: string,
  file: File,
): Promise<string> {
  if (!file || file.size === 0) throw new Error("Bill image is required.");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image max 8 MB honi chahiye.");
  if (!/^image\/(png|jpe?g|webp|heic|heif)$/.test(file.type)) {
    throw new Error("PNG/JPG/WEBP image hi chalegi.");
  }
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
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
  imageDataUrl: string,
  apiKey: string,
): Promise<unknown> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://aimunim.app",
      "X-Title": "AI Munim — Bill Scan",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: EXTRACTION_PROMPT },
            { type: "image_url", image_url: { url: imageDataUrl } },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 500,
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

  const imageDataUrl = `data:${mimeType};base64,${imageBuffer.toString("base64")}`;
  const modelChain = OPENROUTER_VISION_MODEL ? [OPENROUTER_VISION_MODEL] : DEFAULT_MODEL_CHAIN;

  let lastError = "";
  for (const model of modelChain) {
    try {
      const raw = await callOpenRouterVision(model, imageDataUrl, OPENROUTER_API_KEY);
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

/** Owner reviewed/edited the extracted fields — save and (for purchase/expense) post an expense. */
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
  if (v.type === "purchase" || v.type === "expense") {
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
    data: { type: v.type, expense_id: expenseId },
  });

  return { row: updated as BillScanRow };
}

export function billScanAmountRupees(row: BillScanRow): number | null {
  return row.amount_paise == null ? null : paiseToRupees(row.amount_paise);
}
