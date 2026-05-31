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
  plan: "trial" | "silver" | "gold" | "diamond";
  invoice_prefix: string;
}

export type MembershipRow = Timestamps & {
  id: string;
  tenant_id: string;
  user_id: string;
  role: "owner" | "admin" | "staff";
}

export type SubscriptionRow = Timestamps & {
  id: string;
  tenant_id: string;
  plan: "trial" | "silver" | "gold" | "diamond";
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
}

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
      GST_tenants: TableDef<TenantRow, Insert<TenantRow, "name" | "state_code">, Partial<TenantRow>>;
      GST_memberships: TableDef<MembershipRow, Insert<MembershipRow, "tenant_id" | "user_id">, Partial<MembershipRow>>;
      GST_subscriptions: TableDef<SubscriptionRow, Insert<SubscriptionRow, "tenant_id">, Partial<SubscriptionRow>>;
      GST_parties: TableDef<PartyRow, Insert<PartyRow, "tenant_id" | "name">, Partial<PartyRow>>;
      GST_items: TableDef<ItemRow, Insert<ItemRow, "tenant_id" | "name">, Partial<ItemRow>>;
      GST_invoices: TableDef<InvoiceRow, Insert<InvoiceRow, "tenant_id" | "invoice_number">, Partial<InvoiceRow>>;
      GST_invoice_items: TableDef<InvoiceItemRow, Insert<InvoiceItemRow, "tenant_id" | "invoice_id" | "name">, Partial<InvoiceItemRow>>;
      GST_payments: TableDef<PaymentRow, Insert<PaymentRow, "tenant_id" | "direction" | "amount_paise">, Partial<PaymentRow>>;
      GST_expenses: TableDef<ExpenseRow, Insert<ExpenseRow, "tenant_id" | "amount_paise">, Partial<ExpenseRow>>;
      GST_stock_movements: TableDef<StockMovementRow, Insert<StockMovementRow, "tenant_id" | "item_id" | "qty_delta" | "type">, Partial<StockMovementRow>>;
      GST_audit_logs: TableDef<AuditLogRow, Insert<AuditLogRow, "tenant_id" | "action">, Partial<AuditLogRow>>;
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
        Args: { p_tenant_id: string; p_direction?: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
