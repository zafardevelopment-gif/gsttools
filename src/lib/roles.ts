/**
 * Role-based route access (spec: Manage Users / Multi-Staff Access Control).
 * Owner/admin see everything; other roles get a scoped slice of the app.
 * Used by the sidebar (hide links) AND by server-side page guards — never
 * trust the UI alone.
 */

export type AppRole =
  | "owner"
  | "admin"
  | "partner"
  | "ca"
  | "salesman"
  | "stock_manager"
  | "delivery_boy"
  | "staff";

/** Route prefixes each role may open. "all" = unrestricted. */
export const ROLE_ROUTES: Record<AppRole, "all" | string[]> = {
  owner: "all",
  admin: "all",
  // Partner: full business access minus team management.
  partner: [
    "/dashboard", "/invoices", "/pos", "/recurring", "/payments", "/expenses",
    "/cash-bank", "/parties", "/items", "/godowns", "/staff", "/orders",
    "/marketing", "/reports", "/subscription", "/settings",
  ],
  // CA: read-focused — reports, ledgers, vouchers, cash book.
  ca: ["/dashboard", "/reports", "/invoices", "/cash-bank", "/parties", "/payments"],
  salesman: ["/dashboard", "/invoices", "/pos", "/payments", "/parties", "/items"],
  stock_manager: ["/dashboard", "/items", "/godowns"],
  delivery_boy: ["/invoices", "/orders"],
  staff: ["/dashboard", "/invoices", "/pos", "/payments"],
};

export function canAccessRoute(role: string, href: string): boolean {
  const allowed = ROLE_ROUTES[role as AppRole] ?? ROLE_ROUTES.staff;
  if (allowed === "all") return true;
  return allowed.some((p) => href === p || href.startsWith(`${p}/`));
}
