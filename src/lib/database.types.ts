/**
 * Database types mirroring supabase/migrations (the `GST_` schema).
 *
 * Hand-authored to match the SQL. After applying migrations to your project you
 * can regenerate this exactly with:
 *   npx supabase gen types typescript --project-id <id> > src/lib/database.types.ts
 *
 * Money fields are integer paise (bigint -> number here). numeric(…) columns
 * (qty, tax_rate, stock) are returned by supabase-js as `number`.
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type Timestamps = { created_at: string; updated_at: string };

// ---- Row shapes -------------------------------------------------------------
export type TenantRow = Timestamps & {
  id: string;
  name: string;
  legal_name: string | null;
  gstin: string | null;
  state_code: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  logo_path: string | null;
  plan: PlanName;
  invoice_prefix: string;
  notification_channel: "whatsapp" | "sms" | "both";
  store_enabled: boolean;
  store_slug: string | null;
  pan: string | null;
  financial_year_start: string | null;
  invoice_settings: Json;
  print_settings: Json;
  default_terms: string | null;
}

export type PlanName =
  | "trial"
  | "silver"
  | "gold"
  | "diamond"
  | "platinum"
  | "enterprise";

export type MembershipRow = Timestamps & {
  id: string;
  tenant_id: string;
  user_id: string;
  role:
    | "owner"
    | "admin"
    | "partner"
    | "ca"
    | "salesman"
    | "stock_manager"
    | "delivery_boy"
    | "staff";
}

export type SubscriptionRow = Timestamps & {
  id: string;
  tenant_id: string;
  plan: PlanName;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
}

export type PartyRow = Timestamps & {
  id: string;
  tenant_id: string;
  type: "customer" | "supplier" | "both";
  name: string;
  gstin: string | null;
  state_code: string | null;
  phone: string | null;
  email: string | null;
  billing_address: string | null;
  shipping_address: string | null;
  opening_balance_paise: number;
  balance_paise: number;
  notes: string | null;
  is_active: boolean;
  pan: string | null;
  category: string | null;
  credit_period_days: number;
  credit_limit_paise: number;
  contact_person: string | null;
  date_of_birth: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_ifsc: string | null;
  share_token: string;
}

export type ItemRow = Timestamps & {
  id: string;
  tenant_id: string;
  type: "product" | "service";
  name: string;
  sku: string | null;
  hsn_sac: string | null;
  unit: string;
  category: string | null;
  sale_price_paise: number;
  purchase_price_paise: number;
  tax_rate: number;
  is_tax_inclusive: boolean;
  stock_qty: number;
  low_stock_level: number;
  is_active: boolean;
  barcode: string | null;
  mrp_paise: number;
  alt_unit: string | null;
  alt_unit_factor: number | null;
  description: string | null;
  image_path: string | null;
  default_discount_percent: number;
}

export type VoucherType =
  | "invoice"
  | "quotation"
  | "proforma"
  | "delivery_challan"
  | "sales_return"
  | "credit_note"
  | "purchase_return"
  | "debit_note"
  | "purchase_order";

export type InvoiceRow = Timestamps & {
  id: string;
  tenant_id: string;
  party_id: string | null;
  direction: "sale" | "purchase";
  invoice_type: "gst" | "non_gst";
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  place_of_supply_state: string | null;
  is_interstate: boolean;
  subtotal_paise: number;
  discount_paise: number;
  taxable_value_paise: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  total_tax_paise: number;
  additional_charges_paise: number;
  round_off_paise: number;
  total_paise: number;
  amount_paid_paise: number;
  status: "draft" | "unpaid" | "partial" | "paid";
  template: string;
  notes: string | null;
  terms: string | null;
  created_by: string | null;
  voucher_type: VoucherType;
  against_invoice_id: string | null;
  payment_terms_days: number | null;
  is_cancelled: boolean;
  cancelled_reason: string | null;
}

export type InvoiceItemRow = {
  id: string;
  tenant_id: string;
  invoice_id: string;
  item_id: string | null;
  line_no: number;
  name: string;
  hsn_sac: string | null;
  unit: string;
  qty: number;
  rate_paise: number;
  discount_percent: number;
  discount_paise: number;
  taxable_value_paise: number;
  tax_rate: number;
  cgst_paise: number;
  sgst_paise: number;
  igst_paise: number;
  amount_paise: number;
  created_at: string;
}

export type PaymentRow = Timestamps & {
  id: string;
  tenant_id: string;
  party_id: string | null;
  invoice_id: string | null;
  direction: "in" | "out";
  amount_paise: number;
  mode: "cash" | "upi" | "bank" | "cheque" | "card" | "other";
  reference: string | null;
  payment_date: string;
  notes: string | null;
  created_by: string | null;
  bank_account_id: string | null;
}

export type ExpenseRow = Timestamps & {
  id: string;
  tenant_id: string;
  category: string;
  amount_paise: number;
  expense_date: string;
  party_id: string | null;
  payment_mode: "cash" | "upi" | "bank" | "cheque" | "card" | "other";
  notes: string | null;
  created_by: string | null;
}

export type StockMovementRow = {
  id: string;
  tenant_id: string;
  item_id: string;
  qty_delta: number;
  type: "sale" | "purchase" | "adjustment" | "opening" | "return";
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  godown_id: string | null;
}

// ---- New tables (0007 full-spec expansion) ----------------------------------
export type GodownRow = Timestamps & {
  id: string;
  tenant_id: string;
  name: string;
  address: string | null;
  is_default: boolean;
}

export type ItemStockRow = {
  tenant_id: string;
  item_id: string;
  godown_id: string;
  qty: number;
}

export type BankAccountRow = Timestamps & {
  id: string;
  tenant_id: string;
  name: string;
  account_number: string | null;
  ifsc: string | null;
  opening_balance_paise: number;
  is_default: boolean;
  is_active: boolean;
}

export type CashbankTxnRow = {
  id: string;
  tenant_id: string;
  account_id: string | null;
  direction: "in" | "out";
  amount_paise: number;
  kind: "adjustment" | "transfer";
  transfer_group: string | null;
  txn_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export type NotificationLogRow = {
  id: string;
  tenant_id: string;
  channel: "whatsapp" | "sms";
  template: string;
  recipient: string;
  status: "queued" | "sent" | "delivered" | "failed" | "skipped";
  error: string | null;
  payload: Json | null;
  entity_type: string | null;
  entity_id: string | null;
  created_at: string;
}

export type WhatsappTemplateRow = Timestamps & {
  id: string;
  tenant_id: string;
  name: string;
  language: string;
  category: string;
  body: string | null;
  status: "pending" | "approved" | "rejected";
}

export type RecurringInvoiceRow = Timestamps & {
  id: string;
  tenant_id: string;
  party_id: string;
  name: string;
  frequency: "daily" | "weekly" | "monthly";
  next_run_date: string;
  last_run_at: string | null;
  items: Json;
  auto_share: boolean;
  is_active: boolean;
}

export type ReminderRuleRow = {
  id: string;
  tenant_id: string;
  offset_days: number;
  enabled: boolean;
  created_at: string;
}

export type StaffRow = Timestamps & {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  designation: string | null;
  basic_salary_paise: number;
  hra_paise: number;
  conveyance_paise: number;
  is_active: boolean;
  joined_on: string | null;
}

export type AttendanceRow = {
  id: string;
  tenant_id: string;
  staff_id: string;
  day: string;
  status: "present" | "absent" | "half_day" | "overtime";
  overtime_hours: number;
  notes: string | null;
  created_at: string;
}

export type StaffLedgerRow = {
  id: string;
  tenant_id: string;
  staff_id: string;
  kind: "advance" | "loan" | "deduction" | "repayment";
  amount_paise: number;
  entry_date: string;
  notes: string | null;
  created_at: string;
}

export type PayslipRow = {
  id: string;
  tenant_id: string;
  staff_id: string;
  month: string;
  days_present: number;
  days_in_month: number;
  gross_paise: number;
  deductions_paise: number;
  net_paise: number;
  generated_at: string;
}

export type OnlineOrderRow = Timestamps & {
  id: string;
  tenant_id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  items: Json;
  total_paise: number;
  status: "new" | "confirmed" | "dispatched" | "delivered" | "cancelled";
  payment_mode: "cod" | "upi" | "online";
  notes: string | null;
}

export type CampaignRow = Timestamps & {
  id: string;
  tenant_id: string;
  name: string;
  channel: "whatsapp" | "sms";
  template: string | null;
  body: string | null;
  audience: "all" | "customers" | "suppliers";
  status: "draft" | "sending" | "sent" | "failed";
  sent_count: number;
}

export type InvoiceCounterRow = {
  tenant_id: string;
  direction: "sale" | "purchase";
  voucher_type: string;
  last_seq: number;
}

export type AuditLogRow = {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  data: Json | null;
  created_at: string;
}

// Insert = Row without DB-generated fields; Update = partial insert.
type Generated = "id" | "created_at" | "updated_at";
type Insert<T, ReqKeep extends keyof T = never> = Partial<Omit<T, Generated>> &
  Pick<T, ReqKeep>;

// `Relationships: []` is required for supabase-js to recognise the table type.
type TableDef<Row, Ins, Upd> = {
  Row: Row;
  Insert: Ins;
  Update: Upd;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      aimunim_tenants: TableDef<TenantRow, Insert<TenantRow, "name" | "state_code">, Partial<TenantRow>>;
      aimunim_memberships: TableDef<MembershipRow, Insert<MembershipRow, "tenant_id" | "user_id">, Partial<MembershipRow>>;
      aimunim_subscriptions: TableDef<SubscriptionRow, Insert<SubscriptionRow, "tenant_id">, Partial<SubscriptionRow>>;
      aimunim_parties: TableDef<PartyRow, Insert<PartyRow, "tenant_id" | "name">, Partial<PartyRow>>;
      aimunim_items: TableDef<ItemRow, Insert<ItemRow, "tenant_id" | "name">, Partial<ItemRow>>;
      aimunim_invoices: TableDef<InvoiceRow, Insert<InvoiceRow, "tenant_id" | "invoice_number">, Partial<InvoiceRow>>;
      aimunim_invoice_items: TableDef<InvoiceItemRow, Insert<InvoiceItemRow, "tenant_id" | "invoice_id" | "name">, Partial<InvoiceItemRow>>;
      aimunim_payments: TableDef<PaymentRow, Insert<PaymentRow, "tenant_id" | "direction" | "amount_paise">, Partial<PaymentRow>>;
      aimunim_expenses: TableDef<ExpenseRow, Insert<ExpenseRow, "tenant_id" | "amount_paise">, Partial<ExpenseRow>>;
      aimunim_stock_movements: TableDef<StockMovementRow, Insert<StockMovementRow, "tenant_id" | "item_id" | "qty_delta" | "type">, Partial<StockMovementRow>>;
      aimunim_audit_logs: TableDef<AuditLogRow, Insert<AuditLogRow, "tenant_id" | "action">, Partial<AuditLogRow>>;
      aimunim_invoice_counters: TableDef<InvoiceCounterRow, InvoiceCounterRow, Partial<InvoiceCounterRow>>;
      aimunim_godowns: TableDef<GodownRow, Insert<GodownRow, "tenant_id" | "name">, Partial<GodownRow>>;
      aimunim_item_stocks: TableDef<ItemStockRow, Insert<ItemStockRow, "tenant_id" | "item_id" | "godown_id">, Partial<ItemStockRow>>;
      aimunim_bank_accounts: TableDef<BankAccountRow, Insert<BankAccountRow, "tenant_id" | "name">, Partial<BankAccountRow>>;
      aimunim_cashbank_txns: TableDef<CashbankTxnRow, Insert<CashbankTxnRow, "tenant_id" | "direction" | "amount_paise">, Partial<CashbankTxnRow>>;
      aimunim_notification_logs: TableDef<NotificationLogRow, Insert<NotificationLogRow, "tenant_id" | "channel" | "template" | "recipient">, Partial<NotificationLogRow>>;
      aimunim_whatsapp_templates: TableDef<WhatsappTemplateRow, Insert<WhatsappTemplateRow, "tenant_id" | "name">, Partial<WhatsappTemplateRow>>;
      aimunim_recurring_invoices: TableDef<RecurringInvoiceRow, Insert<RecurringInvoiceRow, "tenant_id" | "party_id" | "name" | "frequency" | "next_run_date">, Partial<RecurringInvoiceRow>>;
      aimunim_reminder_rules: TableDef<ReminderRuleRow, Insert<ReminderRuleRow, "tenant_id" | "offset_days">, Partial<ReminderRuleRow>>;
      aimunim_staff: TableDef<StaffRow, Insert<StaffRow, "tenant_id" | "name">, Partial<StaffRow>>;
      aimunim_attendance: TableDef<AttendanceRow, Insert<AttendanceRow, "tenant_id" | "staff_id" | "day" | "status">, Partial<AttendanceRow>>;
      aimunim_staff_ledger: TableDef<StaffLedgerRow, Insert<StaffLedgerRow, "tenant_id" | "staff_id" | "kind" | "amount_paise">, Partial<StaffLedgerRow>>;
      aimunim_payslips: TableDef<PayslipRow, Insert<PayslipRow, "tenant_id" | "staff_id" | "month">, Partial<PayslipRow>>;
      aimunim_online_orders: TableDef<OnlineOrderRow, Insert<OnlineOrderRow, "tenant_id" | "order_number" | "customer_name" | "customer_phone">, Partial<OnlineOrderRow>>;
      aimunim_campaigns: TableDef<CampaignRow, Insert<CampaignRow, "tenant_id" | "name">, Partial<CampaignRow>>;
    };
    Views: Record<string, never>;
    Functions: {
      gst_create_tenant_with_owner: {
        Args: {
          p_name: string;
          p_state_code: string;
          p_gstin?: string | null;
          p_legal_name?: string | null;
          p_address_line1?: string | null;
          p_address_line2?: string | null;
          p_city?: string | null;
          p_state?: string | null;
          p_pincode?: string | null;
          p_phone?: string | null;
          p_email?: string | null;
          p_logo_path?: string | null;
        };
        Returns: string;
      };
      gst_next_invoice_number: {
        Args: { p_tenant_id: string; p_direction?: string; p_voucher_type?: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
