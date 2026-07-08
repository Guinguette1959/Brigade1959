
create extension if not exists "pgcrypto";

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  order_days text[] default '{}',
  delivery_days text[] default '{}',
  sensitive boolean default false,
  created_at timestamptz default now()
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references suppliers(id) on delete cascade,
  name text not null,
  sort_order int default 0,
  active boolean default true,
  sensitive boolean default false,
  created_at timestamptz default now(),
  unique (supplier_id, name)
);

create table if not exists supply_periods (
  id uuid primary key default gen_random_uuid(),
  period_start date not null unique,
  activity_coef numeric default 1,
  note text,
  created_at timestamptz default now()
);

create table if not exists supply_items (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references supply_periods(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  stock_current numeric,
  quantity_ordered numeric,
  note text,
  inventory_checked boolean default false,
  updated_at timestamptz default now(),
  unique (period_id, product_id)
);

create table if not exists supplier_order_statuses (
  id uuid primary key default gen_random_uuid(),
  period_id uuid references supply_periods(id) on delete cascade,
  supplier_id uuid references suppliers(id) on delete cascade,
  prepared boolean default false,
  passed boolean default false,
  prepared_at timestamptz,
  passed_at timestamptz,
  passed_mode text,
  note text,
  updated_at timestamptz default now(),
  unique (period_id, supplier_id)
);

alter table suppliers enable row level security;
alter table products enable row level security;
alter table supply_periods enable row level security;
alter table supply_items enable row level security;
alter table supplier_order_statuses enable row level security;

drop policy if exists "read suppliers" on suppliers;
drop policy if exists "insert suppliers" on suppliers;
drop policy if exists "update suppliers" on suppliers;
drop policy if exists "read products" on products;
drop policy if exists "insert products" on products;
drop policy if exists "update products" on products;
drop policy if exists "read periods" on supply_periods;
drop policy if exists "insert periods" on supply_periods;
drop policy if exists "update periods" on supply_periods;
drop policy if exists "read items" on supply_items;
drop policy if exists "insert items" on supply_items;
drop policy if exists "update items" on supply_items;
drop policy if exists "read statuses" on supplier_order_statuses;
drop policy if exists "insert statuses" on supplier_order_statuses;
drop policy if exists "update statuses" on supplier_order_statuses;

create policy "read suppliers" on suppliers for select using (true);
create policy "insert suppliers" on suppliers for insert with check (true);
create policy "update suppliers" on suppliers for update using (true);

create policy "read products" on products for select using (true);
create policy "insert products" on products for insert with check (true);
create policy "update products" on products for update using (true);

create policy "read periods" on supply_periods for select using (true);
create policy "insert periods" on supply_periods for insert with check (true);
create policy "update periods" on supply_periods for update using (true);

create policy "read items" on supply_items for select using (true);
create policy "insert items" on supply_items for insert with check (true);
create policy "update items" on supply_items for update using (true);

create policy "read statuses" on supplier_order_statuses for select using (true);
create policy "insert statuses" on supplier_order_statuses for insert with check (true);
create policy "update statuses" on supplier_order_statuses for update using (true);
