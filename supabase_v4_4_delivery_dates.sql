
-- Brigade 1959 V4.4 — commandes par date de livraison

alter table supply_items
add column if not exists delivery_date date;

update supply_items
set delivery_date = sp.period_start
from supply_periods sp
where supply_items.period_id = sp.id
and supply_items.delivery_date is null;

alter table supply_items
alter column delivery_date set not null;

alter table supplier_order_statuses
add column if not exists delivery_date date;

update supplier_order_statuses
set delivery_date = sp.period_start
from supply_periods sp
where supplier_order_statuses.period_id = sp.id
and supplier_order_statuses.delivery_date is null;

alter table supplier_order_statuses
alter column delivery_date set not null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'supply_items_period_id_product_id_key'
  ) then
    alter table supply_items drop constraint supply_items_period_id_product_id_key;
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conname = 'supplier_order_statuses_period_id_supplier_id_key'
  ) then
    alter table supplier_order_statuses drop constraint supplier_order_statuses_period_id_supplier_id_key;
  end if;
end $$;

create unique index if not exists supply_items_period_product_delivery_unique
on supply_items(period_id, product_id, delivery_date);

create unique index if not exists supplier_status_period_supplier_delivery_unique
on supplier_order_statuses(period_id, supplier_id, delivery_date);
