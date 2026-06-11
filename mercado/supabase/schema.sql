-- Compra Inteligente - schema Supabase
-- Rode este arquivo no SQL Editor do Supabase.

create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  default_unit text default 'un',
  barcode text,
  created_at timestamptz not null default now()
);

create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  store_name text default 'Montserrat Jundiaí',
  quantity numeric not null default 1,
  unit text not null default 'un',
  unit_price numeric not null default 0,
  total_price numeric not null default 0,
  purchase_date date not null default current_date,
  source text not null default 'manual',
  coupon_import_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.shopping_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  store_name text default 'Montserrat Jundiaí',
  status text not null default 'open',
  predicted_total numeric not null default 0,
  actual_total numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.shopping_list_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.shopping_lists(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity numeric not null default 1,
  unit text not null default 'un',
  estimated_unit_price numeric not null default 0,
  actual_unit_price numeric,
  checked boolean not null default false,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.coupon_imports (
  id uuid primary key default gen_random_uuid(),
  qr_url text not null,
  uf text default 'SP',
  store_name text default 'Montserrat Jundiaí',
  status text not null default 'captured',
  raw_payload jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create or replace view public.product_price_summary as
select
  p.id,
  p.name,
  p.category,
  p.default_unit,
  (
    select pi.unit_price
    from public.purchase_items pi
    where pi.product_id = p.id
    order by pi.purchase_date desc, pi.created_at desc
    limit 1
  ) as last_price,
  (
    select round(avg(pi.unit_price), 2)
    from public.purchase_items pi
    where pi.product_id = p.id
      and pi.purchase_date >= current_date - interval '180 days'
  ) as avg_price
from public.products p;

create or replace function public.recalculate_list_totals(p_list_id uuid)
returns void
language plpgsql
as $$
begin
  update public.shopping_lists
  set
    predicted_total = coalesce((
      select sum(quantity * estimated_unit_price)
      from public.shopping_list_items
      where list_id = p_list_id
    ), 0),
    actual_total = coalesce((
      select sum(quantity * coalesce(actual_unit_price, estimated_unit_price))
      from public.shopping_list_items
      where list_id = p_list_id and checked = true
    ), 0)
  where id = p_list_id;
end;
$$;

alter table public.products enable row level security;
alter table public.purchase_items enable row level security;
alter table public.shopping_lists enable row level security;
alter table public.shopping_list_items enable row level security;
alter table public.coupon_imports enable row level security;

drop policy if exists "anon_all_products" on public.products;
drop policy if exists "anon_all_purchase_items" on public.purchase_items;
drop policy if exists "anon_all_shopping_lists" on public.shopping_lists;
drop policy if exists "anon_all_shopping_list_items" on public.shopping_list_items;
drop policy if exists "anon_all_coupon_imports" on public.coupon_imports;

create policy "anon_all_products" on public.products for all using (true) with check (true);
create policy "anon_all_purchase_items" on public.purchase_items for all using (true) with check (true);
create policy "anon_all_shopping_lists" on public.shopping_lists for all using (true) with check (true);
create policy "anon_all_shopping_list_items" on public.shopping_list_items for all using (true) with check (true);
create policy "anon_all_coupon_imports" on public.coupon_imports for all using (true) with check (true);
