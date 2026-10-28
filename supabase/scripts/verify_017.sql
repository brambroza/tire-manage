-- Read-only checks after applying 017_vehicle_plate_optional.sql.
-- Expect plate_no and province to be nullable on the table.
select column_name, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'vehicles'
  and column_name in ('plate_no', 'province', 'nickname')
order by column_name;

-- Expect the identity constraint.
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.vehicles'::regclass and conname = 'vehicles_identity_check';

-- Expect the partial unique index for plate-less vehicles.
select indexname, indexdef from pg_indexes
where schemaname = 'public' and indexname = 'vehicles_nickname_only_unique';

-- Both views must retain security_invoker=true (tenant RLS).
select relname, reloptions from pg_class
where oid in ('public.tire_overview'::regclass, 'public.vehicle_change_alerts'::regclass);

-- Right after migration every vehicle still has a plate; plate-less vehicles appear once users add them.
select count(*) as total_vehicles,
       count(plate_no) as with_plate,
       count(*) filter (where plate_no is null) as nickname_only
from public.vehicles;
