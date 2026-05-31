import { describe, it, expect } from "vitest";
import {
  computePartyBalance,
  invoiceBalanceDue,
  invoiceStatusFromPaid,
} from "@/lib/ledger";

describe("computePartyBalance", () => {
  it("a customer who was billed and partly paid still owes the remainder", () => {
    // Opening 0, one ₹1000 sale, ₹400 received => ₹600 receivable.
    expect(
      computePartyBalance({
        openingPaise: 0,
        salesTotalPaise: 100000,
        purchaseTotalPaise: 0,
        paymentsInPaise: 40000,
        paymentsOutPaise: 0,
      }),
    ).toBe(60000);
  });

  it("a supplier we owe shows a negative (payable) balance", () => {
    // We bought ₹500 from supplier, paid ₹200 => we still owe ₹300 (payable).
    expect(
      computePartyBalance({
        openingPaise: 0,
        salesTotalPaise: 0,
        purchaseTotalPaise: 50000,
        paymentsInPaise: 0,
        paymentsOutPaise: 20000,
      }),
    ).toBe(-30000);
  });

  it("honours the opening balance", () => {
    expect(
      computePartyBalance({
        openingPaise: 15000,
        salesTotalPaise: 0,
        purchaseTotalPaise: 0,
        paymentsInPaise: 0,
        paymentsOutPaise: 0,
      }),
    ).toBe(15000);
  });

  it("settles to zero when fully paid", () => {
    expect(
      computePartyBalance({
        openingPaise: 0,
        salesTotalPaise: 100000,
        purchaseTotalPaise: 0,
        paymentsInPaise: 100000,
        paymentsOutPaise: 0,
      }),
    ).toBe(0);
  });
});

describe("invoice payment helpers", () => {
  it("computes balance due, never negative on overpayment", () => {
    expect(invoiceBalanceDue(100000, 40000)).toBe(60000);
    expect(invoiceBalanceDue(100000, 120000)).toBe(0);
  });

  it("derives status from paid amount", () => {
    expect(invoiceStatusFromPaid(100000, 0)).toBe("unpaid");
    expect(invoiceStatusFromPaid(100000, 40000)).toBe("partial");
    expect(invoiceStatusFromPaid(100000, 100000)).toBe("paid");
  });
});
