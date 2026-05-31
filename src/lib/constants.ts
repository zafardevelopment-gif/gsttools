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
