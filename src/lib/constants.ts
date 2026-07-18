/**
 * Static reference data for the GST billing app.
 */

/**
 * Indian GST state codes — the first two digits of a GSTIN.
 * Used to decide intra-state (CGST+SGST) vs inter-state (IGST) supply.
 */
export const GST_STATE_CODES: { code: string; name: string }[] = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "25", name: "Daman & Diu" },
  { code: "26", name: "Dadra & Nagar Haveli and Daman & Diu" },
  { code: "27", name: "Maharashtra" },
  { code: "28", name: "Andhra Pradesh (Old)" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman & Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
  { code: "99", name: "Centre Jurisdiction" },
];

export const STATE_CODE_TO_NAME: Record<string, string> = Object.fromEntries(
  GST_STATE_CODES.map((s) => [s.code, s.name]),
);

/** Common GST rate slabs in India (percent). */
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const;
export type GstRate = (typeof GST_RATES)[number];

/** Common units of measure used by Indian SMBs. */
export const UNITS = [
  "PCS",
  "NOS",
  "KG",
  "QTL",
  "GM",
  "LTR",
  "ML",
  "MTR",
  "CM",
  "BOX",
  "DOZ",
  "PKT",
  "BAG",
  "BTL",
  "SET",
  "PAIR",
  "ROLL",
  "HOUR",
  "DAY",
  "UNIT",
] as const;

/** Payment modes for payment in/out. */
export const PAYMENT_MODES = ["cash", "upi", "bank", "cheque", "card", "other"] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/** Default expense categories (a tenant can add more later). */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Rent",
  "Salary",
  "Electricity",
  "Transport",
  "Purchase",
  "Marketing",
  "Office Supplies",
  "Maintenance",
  "Tax & Fees",
  "Miscellaneous",
] as const;

/** Subscription plans. Real Razorpay plan IDs are wired in Step 10. */
export const PLANS = {
  trial: {
    key: "trial",
    name: "Free Trial",
    pricePaise: 0,
    trialDays: 14,
    limits: { invoicesPerMonth: 50, users: 1, items: 100 },
  },
  silver: {
    key: "silver",
    name: "Silver",
    pricePaise: 49900, // ₹499/mo
    trialDays: 0,
    limits: { invoicesPerMonth: 500, users: 2, items: 1000 },
  },
  gold: {
    key: "gold",
    name: "Gold",
    pricePaise: 99900, // ₹999/mo
    trialDays: 0,
    limits: { invoicesPerMonth: 5000, users: 5, items: 10000 },
  },
  diamond: {
    key: "diamond",
    name: "Diamond",
    pricePaise: 199900, // ₹1999/mo
    trialDays: 0,
    limits: { invoicesPerMonth: Infinity, users: 2, items: Infinity },
  },
  platinum: {
    key: "platinum",
    name: "Platinum",
    pricePaise: 299900, // ₹2999/mo
    trialDays: 0,
    limits: { invoicesPerMonth: Infinity, users: 4, items: Infinity },
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    pricePaise: 499900, // "starts at" ₹4999/mo — talk to sales
    trialDays: 0,
    limits: { invoicesPerMonth: Infinity, users: Infinity, items: Infinity },
  },
} as const;

export type PlanKey = keyof typeof PLANS;

export const PARTY_TYPES = ["customer", "supplier", "both"] as const;
export type PartyType = (typeof PARTY_TYPES)[number];

export const INVOICE_TYPES = ["gst", "non_gst"] as const;
export type InvoiceType = (typeof INVOICE_TYPES)[number];

export const ITEM_TYPES = ["product", "service"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

/**
 * Voucher types — one invoice table serves them all.
 *   ledger : +1 adds to party outstanding, -1 reduces it, 0 none
 *   stock  : +1 stock in, -1 stock out, 0 none (relative to the party side)
 */
export const VOUCHER_TYPES = {
  invoice: { label: "Invoice", shortLabel: "Invoice", direction: "sale", ledger: 1, stock: -1 },
  quotation: { label: "Quotation / Estimate", shortLabel: "Quotation", direction: "sale", ledger: 0, stock: 0 },
  proforma: { label: "Proforma Invoice", shortLabel: "Proforma", direction: "sale", ledger: 0, stock: 0 },
  delivery_challan: { label: "Delivery Challan", shortLabel: "Challan", direction: "sale", ledger: 0, stock: -1 },
  sales_return: { label: "Sales Return", shortLabel: "Sale Return", direction: "sale", ledger: -1, stock: 1 },
  credit_note: { label: "Credit Note", shortLabel: "Credit Note", direction: "sale", ledger: -1, stock: 0 },
  purchase_return: { label: "Purchase Return", shortLabel: "Pur. Return", direction: "purchase", ledger: -1, stock: -1 },
  debit_note: { label: "Debit Note", shortLabel: "Debit Note", direction: "purchase", ledger: -1, stock: 0 },
  purchase_order: { label: "Purchase Order", shortLabel: "PO", direction: "purchase", ledger: 0, stock: 0 },
} as const;

export type VoucherTypeKey = keyof typeof VOUCHER_TYPES;

/**
 * Title printed on the document itself (screen preview, PDF, WhatsApp/email
 * share). Was previously hardcoded to always say "Tax Invoice" / "Purchase
 * Bill" regardless of voucher_type, so a Quotation, Proforma, Delivery
 * Challan, Credit/Debit Note etc. all incorrectly rendered as a "Tax
 * Invoice" — misleading for a document type with a specific legal meaning
 * under GST. "invoice" keeps the direction-based Tax Invoice / Purchase
 * Bill wording; every other voucher type gets its own proper document name.
 */
export function documentTitle(
  voucherType: VoucherTypeKey,
  direction: "sale" | "purchase",
): string {
  if (voucherType === "invoice") {
    return direction === "purchase" ? "Purchase Bill" : "Tax Invoice";
  }
  return VOUCHER_TYPES[voucherType]?.label ?? "Invoice";
}

/** Voucher types shown under the Sales section vs the Purchases section. */
export const SALE_VOUCHER_TYPES: VoucherTypeKey[] = [
  "invoice",
  "quotation",
  "proforma",
  "delivery_challan",
  "sales_return",
  "credit_note",
];
export const PURCHASE_VOUCHER_TYPES: VoucherTypeKey[] = [
  "invoice",
  "purchase_order",
  "purchase_return",
  "debit_note",
];

/** Outbound notification channels (WhatsApp-first; SMS dormant). */
export const NOTIFICATION_CHANNELS = ["whatsapp", "sms", "both"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/**
 * Invoice PDF themes (client-safe metadata; the PDF renderer maps these keys
 * to @react-pdf styles in components/invoice/invoice-pdf.tsx).
 */
export const INVOICE_THEMES = {
  classic: { label: "Classic", accent: "#18181b", headerBand: false, tableHead: "#f4f4f5" },
  modern: { label: "Modern Indigo", accent: "#4f46e5", headerBand: true, tableHead: "#eef2ff" },
  emerald: { label: "Emerald", accent: "#047857", headerBand: true, tableHead: "#ecfdf5" },
  minimal: { label: "Minimal", accent: "#404040", headerBand: false, tableHead: "#ffffff" },
} as const;
export type InvoiceThemeKey = keyof typeof INVOICE_THEMES;

/** Print paper sizes (client-safe metadata; dimensions live in invoice-pdf). */
export const PAPER_SIZE_KEYS = ["A4", "A5", "THERMAL"] as const;
export type PaperSizeKey = (typeof PAPER_SIZE_KEYS)[number];
export const PAPER_SIZE_LABELS: Record<PaperSizeKey, string> = {
  A4: "A4 (standard)",
  A5: "A5 (half page)",
  THERMAL: "Thermal 80mm (receipt)",
};
