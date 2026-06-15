alter table public.coupon_imports
add column if not exists processed_at timestamptz,
add column if not exists imported_items integer default 0,
add column if not exists access_key text;

create index if not exists idx_coupon_imports_status on public.coupon_imports(status);
create index if not exists idx_coupon_imports_access_key on public.coupon_imports(access_key);

create unique index if not exists idx_coupon_imports_access_key_unique
on public.coupon_imports(access_key)
where access_key is not null;
