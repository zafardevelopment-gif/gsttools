/**
 * Money handling for the whole app.
 *
 * RULE: all monetary amounts are stored and computed as INTEGER PAISE
 * (1 rupee = 100 paise). We never use floating point for currency math.
 * Convert to/from rupees only at the UI boundary.
 *
 * A `Paise` is just a number that we promise is an integer count of paise.
 */
export type Paise = number;

/** Convert a rupee value (possibly fractional, e.g. user input "199.50") to paise. */
export function rupeesToPaise(rupees: number | string): Paise {
  const n = typeof rupees === "string" ? Number(rupees) : rupees;
  if (!Number.isFinite(n)) return 0;
  // Multiply with rounding to avoid 0.1 + 0.2 style drift.
  return Math.round(n * 100);
}

/** Convert paise to a rupee number (for display / form fields). */
export function paiseToRupees(paise: Paise): number {
  return Math.round(paise) / 100;
}

/** Round a paise amount to the nearest integer paise (defensive). */
export function roundPaise(paise: number): Paise {
  return Math.round(paise);
}

/**
 * Indian-style currency formatting, e.g. ₹1,23,456.78
 * Accepts paise and renders rupees.
 */
export function formatINR(paise: Paise, opts?: { withSymbol?: boolean }): string {
  const withSymbol = opts?.withSymbol ?? true;
  const rupees = paiseToRupees(paise);
  const formatted = new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rupees);
  return withSymbol ? `₹${formatted}` : formatted;
}

/**
 * Compute the round-off needed to bring a paise total to the nearest rupee.
 * Returns the signed paise adjustment (e.g. total 12345 paise -> +(-45) ... )
 * Positive means we add, negative means we subtract.
 */
export function roundOffToNearestRupee(totalPaise: Paise): {
  roundOffPaise: Paise;
  roundedTotalPaise: Paise;
} {
  const roundedRupees = Math.round(totalPaise / 100);
  const roundedTotalPaise = roundedRupees * 100;
  return {
    roundOffPaise: roundedTotalPaise - totalPaise,
    roundedTotalPaise,
  };
}
