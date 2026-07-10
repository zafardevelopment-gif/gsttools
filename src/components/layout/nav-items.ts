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
  Landmark,
  UserCheck,
  ShoppingCart,
  Megaphone,
  MonitorSmartphone,
  UserCog,
  Warehouse,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/invoices", label: "Sales & Purchases", icon: FileText },
  { href: "/parties", label: "Parties", icon: Users },
  { href: "/items", label: "Items", icon: Package },
  { href: "/payments", label: "Payments", icon: Wallet },
  { href: "/cash-bank", label: "Cash & Bank", icon: Landmark },
  { href: "/expenses", label: "Expenses", icon: Receipt },
  { href: "/reports", label: "Reports", icon: BarChart3 },
  { href: "/staff", label: "Staff & Payroll", icon: UserCheck },
  { href: "/orders", label: "Online Orders", icon: ShoppingCart },
  { href: "/marketing", label: "Marketing", icon: Megaphone },
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
      { href: "/invoices", label: "Invoices & Vouchers", icon: FileText },
      { href: "/pos", label: "POS Billing", icon: MonitorSmartphone },
      { href: "/recurring", label: "Automated Bills", icon: RefreshCw },
      { href: "/payments", label: "Payments", icon: Wallet },
      { href: "/expenses", label: "Expenses", icon: Receipt },
    ],
  },
  {
    title: "Accounting",
    items: [{ href: "/cash-bank", label: "Cash & Bank", icon: Landmark }],
  },
  {
    title: "Master Data",
    items: [
      { href: "/parties", label: "Parties", icon: Users },
      { href: "/items", label: "Items", icon: Package },
      { href: "/godowns", label: "Godowns", icon: Warehouse },
    ],
  },
  {
    title: "Business Tools",
    items: [
      { href: "/staff", label: "Staff & Payroll", icon: UserCheck },
      { href: "/users", label: "Manage Users", icon: UserCog },
      { href: "/orders", label: "Online Orders", icon: ShoppingCart },
      { href: "/marketing", label: "Marketing", icon: Megaphone },
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
