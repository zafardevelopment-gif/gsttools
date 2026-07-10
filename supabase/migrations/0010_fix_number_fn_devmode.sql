-- =============================================================================
-- 0010 — Fix: gst_next_invoice_number under service-role (dev auth mode)
-- =============================================================================
-- The dev-auth bypass (NEXT_PUBLIC_AUTH_DISABLED) runs the app on the
-- service-role client, where auth.uid() is NULL — so the strict
-- is_tenant_member() check raised "Not a member of this tenant" on every
-- invoice save. Service role isn't RLS-bound anyway, and EXECUTE on this
-- function is revoked from public/anon, so a NULL uid caller can only be the
-- trusted server. Keep the membership check for real signed-in users.

create or replace function public.gst_next_invoice_number(
  p_tenant_id uuid,
  p_direction text default 'sale',
  p_voucher_type text default 'invoice'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq    bigint;
  v_prefix text;
  v_fy     text;
begin
  -- NULL uid = trusted server context (service role); real users must belong.
  if auth.uid() is not null and not public.is_tenant_member(p_tenant_id) then
    raise exception 'Not a member of this tenant';
  end if;

  insert into public."aimunim_invoice_counters" (tenant_id, direction, voucher_type, last_seq)
  values (p_tenant_id, p_direction, p_voucher_type, 1)
  on conflict (tenant_id, direction, voucher_type)
  do update set last_seq = public."aimunim_invoice_counters".last_seq + 1
  returning last_seq into v_seq;

  v_prefix := case p_voucher_type
    when 'quotation'        then 'QUO'
    when 'proforma'         then 'PRF'
    when 'delivery_challan' then 'DC'
    when 'sales_return'     then 'SRN'
    when 'credit_note'      then 'CRN'
    when 'purchase_return'  then 'PRN'
    when 'debit_note'       then 'DBN'
    when 'purchase_order'   then 'PO'
    else case when p_direction = 'purchase' then 'PUR' else null end
  end;

  if v_prefix is null then
    select coalesce(invoice_prefix, 'INV') into v_prefix
      from public."aimunim_tenants" where id = p_tenant_id;
  end if;

  v_fy := to_char(
            case when extract(month from current_date) >= 4
                 then current_date else current_date - interval '1 year' end,
            'YY')
        || to_char(
            case when extract(month from current_date) >= 4
                 then current_date + interval '1 year' else current_date end,
            'YY');

  return v_prefix || '/' || v_fy || '/' || lpad(v_seq::text, 5, '0');
end;
$$;
