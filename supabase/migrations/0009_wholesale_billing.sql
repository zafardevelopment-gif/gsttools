-- =============================================================================
-- 0009 — Wholesale billing (DukaanMitra 2.0 spec, Module 2 B08)
-- =============================================================================
-- Retail vs wholesale pricing: items get a separate wholesale price, and each
-- party gets a pricing tier. Billing (form/POS/WhatsApp API) picks the price
-- by the party's tier; wholesale falls back to retail when unset.

alter table public."aimunim_items"
  add column if not exists wholesale_price_paise bigint not null default 0
    check (wholesale_price_paise >= 0);

alter table public."aimunim_parties"
  add column if not exists pricing_tier text not null default 'retail'
    check (pricing_tier in ('retail','wholesale'));

create index if not exists idx_parties_pricing_tier
  on public."aimunim_parties"(tenant_id, pricing_tier);
