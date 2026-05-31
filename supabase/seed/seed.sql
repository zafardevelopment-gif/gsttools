-- =============================================================================
-- Seed: one demo tenant ("Sharma Traders") with sample masters + transactions.
--
-- HOW TO USE
--   1. Run all migrations first (supabase db push, or paste each 000x file).
--   2. Sign up in the app (phone or email OTP) so an auth.users row exists.
--   3. Set `demo_email` below to that account's email, then run this file in
--      the Supabase SQL editor. It links the demo business to your user as
--      'owner', so you see it on login.
--
-- Safe to re-run: it upserts the demo tenant by a fixed UUID.
-- Runs as a privileged role in the SQL editor, so RLS does not block it.
-- =============================================================================

do $$
declare
  v_tenant  uuid := '11111111-1111-1111-1111-111111111111';
  v_user    uuid;
  demo_email text := 'mdzafareqbal@gmail.com';   -- <-- change to your login email

  v_cust1   uuid := '21111111-1111-1111-1111-111111111111';
  v_cust2   uuid := '22222222-2222-2222-2222-222222222222';
  v_supp1   uuid := '23333333-3333-3333-3333-333333333333';

  v_item1   uuid := '31111111-1111-1111-1111-111111111111';
  v_item2   uuid := '32222222-2222-2222-2222-222222222222';
  v_item3   uuid := '33333333-3333-3333-3333-333333333333';

  v_inv     uuid := '41111111-1111-1111-1111-111111111111';
begin
  -- ---- Tenant (Maharashtra, state code 27) ---------------------------------
  insert into public."GST_tenants"
    (id, name, legal_name, gstin, state_code, address_line1, city, state, pincode, phone, email, plan, invoice_prefix)
  values
    (v_tenant, 'Sharma Traders', 'Sharma Traders Pvt Ltd', '27ABCDE1234F1Z5', '27',
     'Shop 14, MG Road', 'Pune', 'Maharashtra', '411001', '9876543210',
     'owner@sharmatraders.test', 'trial', 'INV')
  on conflict (id) do update set name = excluded.name;

  insert into public."GST_subscriptions"
    (tenant_id, plan, status, trial_ends_at, current_period_start, current_period_end)
  values
    (v_tenant, 'trial', 'trialing', now() + interval '14 days', now(), now() + interval '14 days')
  on conflict (tenant_id) do nothing;

  -- ---- Link your logged-in user as owner (if it exists) --------------------
  select id into v_user from auth.users where email = demo_email limit 1;
  if v_user is not null then
    insert into public."GST_memberships" (tenant_id, user_id, role)
    values (v_tenant, v_user, 'owner')
    on conflict (tenant_id, user_id) do update set role = 'owner';
    raise notice 'Linked demo tenant to user %', demo_email;
  else
    raise notice 'No auth user for %. Sign up first, then re-run to link.', demo_email;
  end if;

  -- ---- Parties --------------------------------------------------------------
  -- Customer in Maharashtra (intra-state -> CGST+SGST)
  insert into public."GST_parties"
    (id, tenant_id, type, name, gstin, state_code, phone, billing_address)
  values
    (v_cust1, v_tenant, 'customer', 'Gupta Electronics', '27AAACG1234M1Z2', '27',
     '9811111111', 'FC Road, Pune, Maharashtra')
  on conflict (id) do nothing;

  -- Customer in Karnataka (inter-state -> IGST)
  insert into public."GST_parties"
    (id, tenant_id, type, name, gstin, state_code, phone, billing_address)
  values
    (v_cust2, v_tenant, 'customer', 'Reddy Hardware', '29AAACR5678K1Z9', '29',
     '9822222222', 'MG Road, Bengaluru, Karnataka')
  on conflict (id) do nothing;

  -- Supplier (Maharashtra)
  insert into public."GST_parties"
    (id, tenant_id, type, name, gstin, state_code, phone)
  values
    (v_supp1, v_tenant, 'supplier', 'Mahalaxmi Distributors', '27AAACM9999P1Z1', '27', '9833333333')
  on conflict (id) do nothing;

  -- ---- Items (prices in paise) ---------------------------------------------
  insert into public."GST_items"
    (id, tenant_id, type, name, sku, hsn_sac, unit, category, sale_price_paise, purchase_price_paise, tax_rate, stock_qty, low_stock_level)
  values
    (v_item1, v_tenant, 'product', 'LED Bulb 9W', 'LED-9W', '85395000', 'PCS', 'Lighting',
      9900, 6500, 12, 120, 20),
    (v_item2, v_tenant, 'product', 'Extension Board 4-Socket', 'EXT-4', '85366910', 'PCS', 'Accessories',
      24900, 18000, 18, 8, 10),     -- below low-stock level on purpose
    (v_item3, v_tenant, 'service', 'Electrician Visit', 'SVC-ELEC', '998719', 'HOUR', 'Service',
      30000, 0, 18, 0, 0)
  on conflict (id) do nothing;

  -- ---- A sample GST invoice (intra-state to Gupta Electronics) -------------
  -- 10 x LED Bulb @ ₹99 (12%) + 2 x Extension Board @ ₹249 (18%)
  -- Computed with the same rounding the app uses (see src/lib/gst.ts).
  insert into public."GST_invoices"
    (id, tenant_id, party_id, direction, invoice_type, invoice_number, invoice_date,
     place_of_supply_state, is_interstate,
     subtotal_paise, discount_paise, taxable_value_paise,
     cgst_paise, sgst_paise, igst_paise, total_tax_paise,
     additional_charges_paise, round_off_paise, total_paise, status, template)
  values
    (v_inv, v_tenant, v_cust1, 'sale', 'gst', 'INV/2526/00001', current_date,
     '27', false,
     148800, 0, 148800,         -- subtotal = 10*9900 + 2*24900 = 99000 + 49800 = 148800
     10422, 10422, 0, 20844,    -- CGST/SGST = (11880 + 8964)/2 = 10422 each; total tax 20844
     0, 0, 169644, 'unpaid', 'classic')  -- total = 148800 + 20844
  on conflict (id) do nothing;

  insert into public."GST_invoice_items"
    (tenant_id, invoice_id, item_id, line_no, name, hsn_sac, unit, qty, rate_paise,
     discount_percent, discount_paise, taxable_value_paise, tax_rate, cgst_paise, sgst_paise, igst_paise, amount_paise)
  values
    (v_tenant, v_inv, v_item1, 1, 'LED Bulb 9W', '85395000', 'PCS', 10, 9900,
     0, 0, 99000, 12, 5940, 5940, 0, 110880),
    (v_tenant, v_inv, v_item2, 2, 'Extension Board 4-Socket', '85366910', 'PCS', 2, 24900,
     0, 0, 49800, 18, 4482, 4482, 0, 58764)
  on conflict do nothing;

  -- ---- Stock out for the sale (drives current stock down) ------------------
  insert into public."GST_stock_movements"
    (tenant_id, item_id, qty_delta, type, reference_type, reference_id)
  values
    (v_tenant, v_item1, -10, 'sale', 'invoice', v_inv),
    (v_tenant, v_item2, -2,  'sale', 'invoice', v_inv)
  on conflict do nothing;

  -- ---- A partial payment received against the invoice ----------------------
  insert into public."GST_payments"
    (tenant_id, party_id, invoice_id, direction, amount_paise, mode, payment_date, reference)
  values
    (v_tenant, v_cust1, v_inv, 'in', 100000, 'upi', current_date, 'UPI-DEMO-001')
  on conflict do nothing;

  -- ---- A sample expense ----------------------------------------------------
  insert into public."GST_expenses"
    (tenant_id, category, amount_paise, expense_date, payment_mode, notes)
  values
    (v_tenant, 'Rent', 1500000, current_date, 'bank', 'Shop rent (demo)')
  on conflict do nothing;

  -- Balances/stock/invoice-status are maintained by triggers automatically.
  raise notice 'Seed complete for tenant % (Sharma Traders).', v_tenant;
end $$;
