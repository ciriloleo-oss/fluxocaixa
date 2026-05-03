create extension if not exists "pgcrypto";

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'bank',
  bank_name text,
  initial_balance numeric(14,2) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('income', 'expense', 'both')),
  color text,
  icon text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  transaction_date date not null,
  description text not null,
  amount numeric(14,2) not null check (amount >= 0),
  type text not null check (type in ('income', 'expense')),
  status text not null default 'confirmed' check (status in ('confirmed', 'scheduled', 'cancelled')),
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  notes text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bank_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  received_at timestamptz not null default now(),
  raw_message text not null,
  bank_name text,
  detected_amount numeric(14,2),
  detected_type text check (detected_type in ('income', 'expense')),
  detected_description text,
  transaction_id uuid references public.transactions(id) on delete set null,
  processed boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.bank_messages enable row level security;

drop policy if exists "accounts_select_own" on public.accounts;
drop policy if exists "accounts_insert_own" on public.accounts;
drop policy if exists "accounts_update_own" on public.accounts;
drop policy if exists "accounts_delete_own" on public.accounts;
create policy "accounts_select_own" on public.accounts for select using (auth.uid() = user_id);
create policy "accounts_insert_own" on public.accounts for insert with check (auth.uid() = user_id);
create policy "accounts_update_own" on public.accounts for update using (auth.uid() = user_id);
create policy "accounts_delete_own" on public.accounts for delete using (auth.uid() = user_id);

drop policy if exists "categories_select_own" on public.categories;
drop policy if exists "categories_insert_own" on public.categories;
drop policy if exists "categories_update_own" on public.categories;
drop policy if exists "categories_delete_own" on public.categories;
create policy "categories_select_own" on public.categories for select using (auth.uid() = user_id);
create policy "categories_insert_own" on public.categories for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories for update using (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories for delete using (auth.uid() = user_id);

drop policy if exists "transactions_select_own" on public.transactions;
drop policy if exists "transactions_insert_own" on public.transactions;
drop policy if exists "transactions_update_own" on public.transactions;
drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_select_own" on public.transactions for select using (auth.uid() = user_id);
create policy "transactions_insert_own" on public.transactions for insert with check (auth.uid() = user_id);
create policy "transactions_update_own" on public.transactions for update using (auth.uid() = user_id);
create policy "transactions_delete_own" on public.transactions for delete using (auth.uid() = user_id);

drop policy if exists "bank_messages_select_own" on public.bank_messages;
drop policy if exists "bank_messages_insert_own" on public.bank_messages;
drop policy if exists "bank_messages_update_own" on public.bank_messages;
drop policy if exists "bank_messages_delete_own" on public.bank_messages;
create policy "bank_messages_select_own" on public.bank_messages for select using (auth.uid() = user_id);
create policy "bank_messages_insert_own" on public.bank_messages for insert with check (auth.uid() = user_id);
create policy "bank_messages_update_own" on public.bank_messages for update using (auth.uid() = user_id);
create policy "bank_messages_delete_own" on public.bank_messages for delete using (auth.uid() = user_id);
