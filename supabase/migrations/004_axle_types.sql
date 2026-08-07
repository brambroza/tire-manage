-- ============================================================
-- ประเภทเพลาแบบจัดการได้จากหน้า Super Admin
-- ============================================================

create table if not exists public.axle_types (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  axle_kinds  text[] not null,
  sort_order  integer not null default 0 check (sort_order >= 0),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint axle_types_code_format check (
    code = upper(code) and code ~ '^[A-Z0-9_]{1,30}$'
  ),
  constraint axle_types_name_required check (length(trim(name)) > 0),
  constraint axle_types_kinds_valid check (
    cardinality(axle_kinds) between 1 and 8
    and axle_kinds <@ array['single', 'dual']::text[]
  )
);

insert into public.axle_types (code, name, axle_kinds, sort_order) values
  ('4W',        'รถ 4 ล้อ (เพลาเดี่ยว 2 เพลา)',                 array['single', 'single'],                 1),
  ('6W',        'รถ 6 ล้อ (หน้าเดี่ยว หลังคู่)',                array['single', 'dual'],                   2),
  ('10W',       'รถ 10 ล้อ (หน้าเดี่ยว หลังคู่ 2 เพลา)',        array['single', 'dual', 'dual'],           3),
  ('12W',       'รถ 12 ล้อ (หน้าเดี่ยว 2 เพลา หลังคู่ 2 เพลา)', array['single', 'single', 'dual', 'dual'], 4),
  ('TRAILER_2', 'หางพ่วง 2 เพลา (8 ล้อ)',                       array['dual', 'dual'],                     5),
  ('TRAILER_3', 'หางพ่วง 3 เพลา (12 ล้อ)',                      array['dual', 'dual', 'dual'],             6)
on conflict (code) do nothing;

alter table public.vehicles alter column axle_type drop default;
create index if not exists vehicles_axle_type_idx on public.vehicles(axle_type);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'vehicles_axle_type_fkey'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_axle_type_fkey
      foreign key (axle_type) references public.axle_types(code)
      on update cascade on delete restrict;
  end if;
end $$;

drop trigger if exists trg_touch_axle_types on public.axle_types;
create trigger trg_touch_axle_types
before update on public.axle_types
for each row execute function public.touch_updated_at();

alter table public.axle_types enable row level security;

drop policy if exists axle_types_select on public.axle_types;
create policy axle_types_select on public.axle_types
  for select to authenticated using (true);

drop policy if exists axle_types_write on public.axle_types;
create policy axle_types_write on public.axle_types
  for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

comment on table public.axle_types is
  'ประเภทเพลาและรูปแบบล้อ เรียง axle_kinds จากเพลาหน้าไปหลัง';
