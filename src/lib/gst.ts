/**
 * GST tax calculation — the heart of the app.
 *
 * This is a PURE function: same inputs -> same outputs, no I/O, no Date, no
 * randomness. It is unit-tested hard (src/lib/gst.test.ts). Do NOT scatter tax
 * math anywhere else — call computeInvoiceTotals() and persist its result.
 *
 * Rules implemented:
 *  - Intra-state supply (business state == place of supply): tax splits into
 *    CGST + SGST, each = rate/2.
 *  - Inter-state supply (different states): a single IGST = full rate.
 *  - Non-GST invoices: no tax at all.
 *  - Per-line discount: percentage OR flat amount (reduces the taxable value).
 *  - Tax-inclusive lines: the rate already contains tax; we back it out.
 *  - Additional charges (freight/packaging): added after tax, untaxed (MVP).
 *  - Round-off: optionally round the grand total to the nearest rupee.
 *
 * Everything is integer paise. Rounding happens only at the documented points:
 *  - line gross (qty * rate)
 *  - backing out inclusive tax
 *  - per-line discount
 *  - per-line tax, then the CGST/SGST half-split (SGST absorbs the odd paisa so
 *    CGST + SGST == total line tax exactly)
 *  - final round-off
 */
import { roundPaise, roundOffToNearestRupee } from "@/lib/money";

export type GstLineInput = {
  /** Quantity (may be fractional, e.g. 2.5 kg). */
  qty: number;
  /** Unit price in paise. Tax-exclusive unless `isTaxInclusive` is true. */
  ratePaise: number;
  /** GST rate as a percentage, e.g. 18 for 18%. */
  taxRate: number;
  /** Percentage discount on the line (0–100). Takes precedence over flat. */
  discountPercent?: number;
  /** Flat discount on the line, in paise (used if discountPercent is absent). */
  discountFlatPaise?: number;
  /** If true, `ratePaise` already includes the tax; we back it out. */
  isTaxInclusive?: boolean;
};

export type GstCalcInput = {
  lines: GstLineInput[];
  /** true => inter-state (IGST); false => intra-state (CGST+SGST). */
  isInterstate: boolean;
  /** 'non_gst' zeroes out all tax regardless of line rates. */
  invoiceType: "gst" | "non_gst";
  /** Freight/packaging etc., in paise. Added after tax, untaxed. */
  additionalChargesPaise?: number;
  /** Round the grand total to the nearest rupee (default true). */
  roundOff?: boolean;
};

export type GstLineResult = {
  taxableValuePaise: number;
  discountPaise: number;
  taxRate: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  /** taxable + line tax (excludes invoice-level charges/round-off). */
  amountPaise: number;
};

export type GstCalcResult = {
  lines: GstLineResult[];
  subtotalPaise: number; // sum of pre-discount taxable values
  discountPaise: number; // sum of line discounts
  taxableValuePaise: number; // sum of post-discount taxable values
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  totalTaxPaise: number;
  additionalChargesPaise: number;
  roundOffPaise: number;
  totalPaise: number;
};

/** Compute one line's taxable value, discount and tax split. */
function computeLine(line: GstLineInput, input: GstCalcInput): GstLineResult {
  const qty = Number.isFinite(line.qty) ? line.qty : 0;
  const rate = Number.isFinite(line.ratePaise) ? line.ratePaise : 0;
  const taxRate =
    input.invoiceType === "non_gst" ? 0 : Math.max(0, line.taxRate || 0);

  const gross = roundPaise(qty * rate);

  // Back out tax if the rate is inclusive.
  const taxableBeforeDiscount =
    line.isTaxInclusive && taxRate > 0
      ? roundPaise((gross * 100) / (100 + taxRate))
      : gross;

  // Discount: percentage wins over flat. Never exceed the taxable value.
  let discountPaise = 0;
  if (line.discountPercent && line.discountPercent > 0) {
    discountPaise = roundPaise(
      (taxableBeforeDiscount * Math.min(line.discountPercent, 100)) / 100,
    );
  } else if (line.discountFlatPaise && line.discountFlatPaise > 0) {
    discountPaise = Math.min(roundPaise(line.discountFlatPaise), taxableBeforeDiscount);
  }

  const taxableValuePaise = taxableBeforeDiscount - discountPaise;

  // Tax.
  const lineTax = taxRate > 0 ? roundPaise((taxableValuePaise * taxRate) / 100) : 0;

  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;
  if (lineTax > 0) {
    if (input.isInterstate) {
      igstPaise = lineTax;
    } else {
      cgstPaise = roundPaise(lineTax / 2);
      sgstPaise = lineTax - cgstPaise; // SGST absorbs any odd paisa
    }
  }

  return {
    taxableValuePaise,
    discountPaise,
    taxRate,
    cgstPaise,
    sgstPaise,
    igstPaise,
    amountPaise: taxableValuePaise + cgstPaise + sgstPaise + igstPaise,
    // Note: store the pre-discount taxable separately via the aggregate below.
  };
}

/**
 * Compute all invoice totals from the lines + invoice-level params.
 * Returns per-line results (for invoice_items) and the invoice aggregates.
 */
export function computeInvoiceTotals(input: GstCalcInput): GstCalcResult {
  const additionalChargesPaise = Math.max(
    0,
    roundPaise(input.additionalChargesPaise ?? 0),
  );
  const roundOff = input.roundOff ?? true;

  let subtotalPaise = 0; // pre-discount taxable
  let discountPaise = 0;
  let taxableValuePaise = 0;
  let cgstPaise = 0;
  let sgstPaise = 0;
  let igstPaise = 0;

  const lines = input.lines.map((line) => {
    const r = computeLine(line, input);
    subtotalPaise += r.taxableValuePaise + r.discountPaise;
    discountPaise += r.discountPaise;
    taxableValuePaise += r.taxableValuePaise;
    cgstPaise += r.cgstPaise;
    sgstPaise += r.sgstPaise;
    igstPaise += r.igstPaise;
    return r;
  });

  const totalTaxPaise = cgstPaise + sgstPaise + igstPaise;
  const preRound = taxableValuePaise + totalTaxPaise + additionalChargesPaise;

  let roundOffPaise = 0;
  let totalPaise = preRound;
  if (roundOff) {
    const r = roundOffToNearestRupee(preRound);
    roundOffPaise = r.roundOffPaise;
    totalPaise = r.roundedTotalPaise;
  }

  return {
    lines,
    subtotalPaise,
    discountPaise,
    taxableValuePaise,
    cgstPaise,
    sgstPaise,
    igstPaise,
    totalTaxPaise,
    additionalChargesPaise,
    roundOffPaise,
    totalPaise,
  };
}

// ---------------------------------------------------------------------------
// Place-of-supply helpers
// ---------------------------------------------------------------------------

/** First 2 digits of a GSTIN are the state code. */
export function stateCodeFromGstin(gstin?: string | null): string | undefined {
  if (!gstin || gstin.length < 2) return undefined;
  return gstin.slice(0, 2);
}

/**
 * Resolve a party's place-of-supply state code: explicit field first, else the
 * GSTIN prefix.
 */
export function resolvePlaceOfSupply(party: {
  state_code?: string | null;
  gstin?: string | null;
}): string | undefined {
  return party.state_code || stateCodeFromGstin(party.gstin);
}

/**
 * Inter-state if the business state differs from the place of supply.
 * If place of supply is unknown, default to intra-state (CGST+SGST) — the
 * common case for local/unregistered B2C customers.
 */
export function isInterstateSupply(
  businessStateCode: string,
  placeOfSupplyStateCode?: string,
): boolean {
  if (!placeOfSupplyStateCode) return false;
  return businessStateCode !== placeOfSupplyStateCode;
}
