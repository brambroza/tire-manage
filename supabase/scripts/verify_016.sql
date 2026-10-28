-- Read-only checks after applying 016_vehicle_nickname.sql.
-- Expect three nullable text columns (table and two views).
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and column_name = 'nickname'
  and table_name in ('vehicles', 'tire_overview', 'vehicle_change_alerts')
order by table_name;

-- Expect one trigram index and the maximum-length constraint.
select indexname, indexdef from pg_indexes
where schemaname = 'public' and indexname = 'vehicles_nickname_trgm';

select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.vehicles'::regclass
  and pg_get_constraintdef(oid) like '%nickname%';

-- Both views must retain security_invoker=true (tenant RLS).
select relname, reloptions from pg_class
where oid in ('public.tire_overview'::regclass, 'public.vehicle_change_alerts'::regclass);

-- Existing vehicles may remain unnamed until their real names are supplied.
select count(*) as total_vehicles,
       count(nickname) as named_vehicles,
       count(*) filter (where nickname is null) as unnamed_vehicles
from public.vehicles;
