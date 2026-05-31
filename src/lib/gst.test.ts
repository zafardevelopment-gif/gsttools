import { describe, it, expect } from "vitest";
import {
  computeInvoiceTotals,
  stateCodeFromGstin,
  resolvePlaceOfSupply,
  isInterstateSupply,
  type GstCalcInput,
} from "@/lib/gst";

const base = (over: Partial<GstCalcInput>): GstCalcInput => ({
  lines: [],
  isInterstate: false,
  invoiceType: "gst",
  roundOff: false,
  ...over,
});

describe("computeInvoiceTotals — intra vs inter state", () => {
  it("splits intra-state tax into equal CGST + SGST", () => {
    const r = computeInvoiceTotals(
      base({ lines: [{ qty: 1, ratePaise: 10000, taxRate: 18 }] }),
    );
    expect(r.taxableValuePaise).toBe(10000);
    expect(r.cgstPaise).toBe(900);
    expect(r.sgstPaise).toBe(900);
    expect(r.igstPaise).toBe(0);
    expect(r.totalTaxPaise).toBe(1800);
    expect(r.totalPaise).toBe(11800);
  });

  it("uses a single IGST for inter-state supply", () => {
    const r = computeInvoiceTotals(
      base({
        isInterstate: true,
        lines: [{ qty: 1, ratePaise: 10000, taxRate: 18 }],
      }),
    );
    expect(r.cgstPaise).toBe(0);
    expect(r.sgstPaise).toBe(0);
    expect(r.igstPaise).toBe(1800);
    expect(r.totalPaise).toBe(11800);
  });

  it("absorbs the odd paisa into SGST so CGST + SGST equals total tax", () => {
    // taxable 101 paise @ 5% => tax 5 paise => cgst 3, sgst 2
    const r = computeInvoiceTotals(
      base({ lines: [{ qty: 1, ratePaise: 101, taxRate: 5 }] }),
    );
    expect(r.cgstPaise).toBe(3);
    expect(r.sgstPaise).toBe(2);
    expect(r.cgstPaise + r.sgstPaise).toBe(r.totalTaxPaise);
  });
});

describe("computeInvoiceTotals — discounts", () => {
  it("applies a percentage discount to the taxable value", () => {
    const r = computeInvoiceTotals(
      base({
        lines: [{ qty: 2, ratePaise: 10000, taxRate: 18, discountPercent: 10 }],
      }),
    );
    expect(r.subtotalPaise).toBe(20000); // pre-discount taxable
    expect(r.discountPaise).toBe(2000);
    expect(r.taxableValuePaise).toBe(18000);
    expect(r.totalTaxPaise).toBe(3240);
    expect(r.totalPaise).toBe(21240);
  });

  it("applies a flat discount and never below zero taxable", () => {
    const r = computeInvoiceTotals(
      base({
        lines: [{ qty: 1, ratePaise: 10000, taxRate: 18, discountFlatPaise: 1500 }],
      }),
    );
    expect(r.taxableValuePaise).toBe(8500);
    expect(r.totalTaxPaise).toBe(1530);
    expect(r.totalPaise).toBe(10030);
  });
});

describe("computeInvoiceTotals — tax-inclusive & non-GST & 0%", () => {
  it("backs tax out of an inclusive rate", () => {
    // ₹118 inclusive of 18% => taxable ₹100, tax ₹18
    const r = computeInvoiceTotals(
      base({
        lines: [{ qty: 1, ratePaise: 11800, taxRate: 18, isTaxInclusive: true }],
      }),
    );
    expect(r.taxableValuePaise).toBe(10000);
    expect(r.cgstPaise).toBe(900);
    expect(r.sgstPaise).toBe(900);
    expect(r.totalPaise).toBe(11800);
  });

  it("charges no tax on a non-GST invoice even if lines carry a rate", () => {
    const r = computeInvoiceTotals(
      base({
        invoiceType: "non_gst",
        lines: [{ qty: 1, ratePaise: 10000, taxRate: 18 }],
      }),
    );
    expect(r.totalTaxPaise).toBe(0);
    expect(r.totalPaise).toBe(10000);
  });

  it("charges no tax at 0%", () => {
    const r = computeInvoiceTotals(
      base({ lines: [{ qty: 3, ratePaise: 5000, taxRate: 0 }] }),
    );
    expect(r.totalTaxPaise).toBe(0);
    expect(r.totalPaise).toBe(15000);
  });
});

describe("computeInvoiceTotals — charges & round-off", () => {
  it("adds additional charges after tax, untaxed", () => {
    const r = computeInvoiceTotals(
      base({
        additionalChargesPaise: 5000,
        lines: [{ qty: 1, ratePaise: 10000, taxRate: 18 }],
      }),
    );
    expect(r.additionalChargesPaise).toBe(5000);
    expect(r.totalPaise).toBe(11800 + 5000);
  });

  it("rounds the grand total to the nearest rupee (down)", () => {
    const r = computeInvoiceTotals(
      base({
        roundOff: true,
        invoiceType: "non_gst",
        lines: [{ qty: 1, ratePaise: 12345, taxRate: 0 }],
      }),
    );
    expect(r.roundOffPaise).toBe(-45);
    expect(r.totalPaise).toBe(12300);
  });

  it("rounds the grand total to the nearest rupee (up)", () => {
    const r = computeInvoiceTotals(
      base({
        roundOff: true,
        invoiceType: "non_gst",
        lines: [{ qty: 1, ratePaise: 12355, taxRate: 0 }],
      }),
    );
    expect(r.roundOffPaise).toBe(45);
    expect(r.totalPaise).toBe(12400);
  });
});

describe("computeInvoiceTotals — multi-line (matches seed invoice)", () => {
  it("aggregates two lines at different rates correctly", () => {
    const r = computeInvoiceTotals(
      base({
        roundOff: false, // seed invoice stores no round-off
        lines: [
          { qty: 10, ratePaise: 9900, taxRate: 12 }, // LED bulbs
          { qty: 2, ratePaise: 24900, taxRate: 18 }, // extension boards
        ],
      }),
    );
    expect(r.subtotalPaise).toBe(148800);
    expect(r.taxableValuePaise).toBe(148800);
    expect(r.cgstPaise).toBe(10422);
    expect(r.sgstPaise).toBe(10422);
    expect(r.totalTaxPaise).toBe(20844);
    expect(r.totalPaise).toBe(169644);
    // Per-line breakdown is preserved for invoice_items.
    expect(r.lines[0].amountPaise).toBe(110880);
    expect(r.lines[1].amountPaise).toBe(58764);
  });
});

describe("place-of-supply helpers", () => {
  it("derives state code from a GSTIN prefix", () => {
    expect(stateCodeFromGstin("27ABCDE1234F1Z5")).toBe("27");
    expect(stateCodeFromGstin(null)).toBeUndefined();
  });

  it("prefers an explicit state_code over the GSTIN prefix", () => {
    expect(resolvePlaceOfSupply({ state_code: "29", gstin: "27ABCDE1234F1Z5" })).toBe("29");
    expect(resolvePlaceOfSupply({ gstin: "27ABCDE1234F1Z5" })).toBe("27");
  });

  it("treats different states as inter-state; unknown as intra-state", () => {
    expect(isInterstateSupply("27", "29")).toBe(true);
    expect(isInterstateSupply("27", "27")).toBe(false);
    expect(isInterstateSupply("27", undefined)).toBe(false);
  });
});
