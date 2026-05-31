import { describe, it, expect } from "vitest";
import {
  rupeesToPaise,
  paiseToRupees,
  formatINR,
  roundOffToNearestRupee,
} from "@/lib/money";

describe("money paise helpers", () => {
  it("converts rupees to integer paise without float drift", () => {
    expect(rupeesToPaise(199.5)).toBe(19950);
    expect(rupeesToPaise("0.1")).toBe(10);
    expect(rupeesToPaise(0.1 + 0.2)).toBe(30); // would be 30.000000004 in float
  });

  it("converts paise back to rupees", () => {
    expect(paiseToRupees(19950)).toBe(199.5);
    expect(paiseToRupees(100)).toBe(1);
  });

  it("formats INR in Indian grouping", () => {
    expect(formatINR(12345678)).toBe("₹1,23,456.78");
    expect(formatINR(10000, { withSymbol: false })).toBe("100.00");
  });

  it("computes round-off to nearest rupee", () => {
    // 12345 paise = ₹123.45 -> nearest rupee ₹123 (12300), adjust -45
    expect(roundOffToNearestRupee(12345)).toEqual({
      roundOffPaise: -45,
      roundedTotalPaise: 12300,
    });
    // 12355 paise = ₹123.55 -> nearest rupee ₹124 (12400), adjust +45
    expect(roundOffToNearestRupee(12355)).toEqual({
      roundOffPaise: 45,
      roundedTotalPaise: 12400,
    });
  });
});
