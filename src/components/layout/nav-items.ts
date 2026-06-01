import {
  LayoutDashboard,
  FileText,
  Users,
  Package,
  Wallet,
  Receipt,
  BarChart3,
  CreditCard,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Invoices", icon: FileText },
  { href: "/parties", label: "Parties", icon: Users },
  { href: "/items", label: "Items", icon: Package },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/subscription", label: "Subscription", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: Settings },
];

export type NavGroup = {
  title: string;
  items: NavItem[];
};

/** Grouped navigation used by the sidebar and mobile drawer. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    title: "Sales & Purchases",
    items: [
      { href: "/invoices", label: "Invoices", icon: FileText },
      { href: "/payments", label: "Payments", icon: Wallet },
      { href: "/expenses", label: "Expenses", icon: Receipt },
    ],
  },
  {
    title: "Master Data",
    items: [
      { href: "/parties", label: "Parties", icon: Users },
      { href: "/items", label: "Items", icon: Package },
    ],
  },
  {
    title: "Insights",
    items: [{ href: "/reports", label: "Reports", icon: BarChart3 }],
  },
  {
    title: "Account",
    items: [
      { href: "/subscription", label: "Subscription", icon: CreditCard },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];
