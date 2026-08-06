-- ============================================================
-- DREAM TIRE MANAGEMENT — Database Schema
-- PostgreSQL / Supabase
-- ============================================================
-- Run order: schema.sql -> seed.sql
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ------------------------------------------------------------
-- ENUMS
-- ------------------------------------------------------------
do $$ begin
  create type user_role as enum ('super_admin', 'admin', 'technician');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tire_status as enum ('in_stock', 'mounted', 'scrapped', 'retreading');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tire_event_type as enum ('mount', 'unmount');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------
-- companies : ลูกค้า (บริษัทขนส่ง) 1 แถว = 1 tenant
-- ------------------------------------------------------------
create table if not exists public.companies (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  name          text not null,
  tax_id        text,
  phone         text,
  email         text,
  address       text,
  contact_name  text,
  logo_url      text,
  -- เกณฑ์แจ้งเตือนระยะใช้งานยาง (กม.) ค่า default ตามสเปค = 10,000
  alert_km      integer not null default 10000 check (alert_km > 0),
  -- ดอกยางขั้นต่ำก่อนแจ้งเตือน (มม.)
  alert_tread_mm numeric(3,1) not null default 3.0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ------------------------------------------------------------
-- profiles : ผูกกับ auth.users, กำหนด role + สังกัดบริษัท
-- super_admin (Dreammaker) จะมี company_id = null
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  company_id  uuid references public.companies(id) on delete cascade,
  role        user_role not null default 'technician',
  full_name   text not null,
  phone       text,
  employee_no text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint profiles_company_required
    check ((role = 'super_admin' and company_id is null)
        or (role <> 'super_admin' and company_id is not null))
);
create index if not exists profiles_company_idx on public.profiles(company_id);

-- ------------------------------------------------------------
-- removal_reasons : สาเหตุการถอดยาง (super admin config ได้)
-- ------------------------------------------------------------
create table if not exists public.removal_reasons (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  -- true = ถอดแล้วยางหมดสภาพ (ตัดออกจากระบบ) เช่น ระเบิด/บวม
  is_scrap    boolean not null default false,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ------------------------------------------------------------
-- tire_brands / tire_models : ข้อมูลกลางยาง (super admin CRUD)
-- created_by_company != null => ช่างพิมพ์เพิ่มเองระหว่างหน้างาน
-- ------------------------------------------------------------
create table if not exists public.tire_brands (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  created_by_company uuid references public.companies(id) on delete set null,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (name)
);

create table if not exists public.tire_models (
  id                 uuid primary key default gen_random_uuid(),
  brand_id           uuid not null references public.tire_brands(id) on delete cascade,
  name               text not null,             -- รุ่น เช่น X MULTI Z
  size               text,                      -- ขนาด เช่น 295/80R22.5
  pattern_code       text,                      -- รหัสดอกยาง
  image_url          text,                      -- รูปยาง (Supabase Storage: tire-images)
  created_by_company uuid references public.companies(id) on delete set null,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  unique (brand_id, name, size)
);
create index if not exists tire_models_brand_idx on public.tire_models(brand_id);

-- ------------------------------------------------------------
-- company_tire_models : super admin กำหนดว่าบริษัทไหนเห็นยางรุ่นใดบ้าง
-- ------------------------------------------------------------
create table if not exists public.company_tire_models (
  company_id   uuid not null references public.companies(id) on delete cascade,
  tire_model_id uuid not null references public.tire_models(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (company_id, tire_model_id)
);

-- ------------------------------------------------------------
-- vehicles : รถของลูกค้า
-- axle_type อ้างอิงค่าคงที่ใน src/lib/axle-layouts.ts
-- ------------------------------------------------------------
create table if not exists public.vehicles (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references public.companies(id) on delete cascade,
  plate_no        text not null,                    -- ทะเบียนรถ
  province        text not null,                    -- จังหวัด
  brand           text,                             -- ยี่ห้อรถ
  model           text,                             -- รุ่นรถ
  axle_type       text not null default '10W',      -- ประเภทเพลา
  current_mileage integer not null default 0 check (current_mileage >= 0),
  note            text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (company_id, plate_no, province)
);
create index if not exists vehicles_company_idx on public.vehicles(company_id);
create index if not exists vehicles_plate_trgm on public.vehicles using gin (plate_no gin_trgm_ops);

-- ------------------------------------------------------------
-- tires : ยางรายเส้น (ทรัพย์สินของบริษัทลูกค้า)
-- ------------------------------------------------------------
create table if not exists public.tires (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references public.companies(id) on delete cascade,
  serial_no          text not null,              -- เลขยาง / ซีเรียล
  tire_model_id      uuid references public.tire_models(id) on delete set null,
  brand_name         text,                       -- snapshot กันข้อมูลกลางถูกแก้
  model_name         text,
  size               text,
  dot                text,
  status             tire_status not null default 'in_stock',
  -- ตำแหน่งปัจจุบัน (มีค่าเมื่อ status = mounted)
  vehicle_id         uuid references public.vehicles(id) on delete set null,
  position_code      text,
  -- ระยะสะสมตลอดอายุยาง (กม.)
  total_distance_km  integer not null default 0 check (total_distance_km >= 0),
  -- เลขไมล์รถ ณ ตอนใส่ครั้งล่าสุด ใช้คำนวณระยะวิ่งปัจจุบัน
  mounted_odometer   integer,
  mounted_at         timestamptz,
  tread_mm           numeric(3,1),               -- ดอกยางคงเหลือล่าสุด
  new_tread_mm       numeric(3,1) default 16.0,  -- ดอกยางตอนใหม่ ใช้คำนวณ %
  purchase_price     numeric(12,2),
  note               text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (company_id, serial_no),
  constraint tires_mounted_consistency check (
    (status = 'mounted' and vehicle_id is not null and position_code is not null)
    or (status <> 'mounted')
  )
);
create index if not exists tires_company_idx  on public.tires(company_id);
create index if not exists tires_vehicle_idx  on public.tires(vehicle_id);
create index if not exists tires_status_idx   on public.tires(company_id, status);
create index if not exists tires_serial_trgm  on public.tires using gin (serial_no gin_trgm_ops);
-- ยาง 1 เส้นห้ามอยู่ 2 ตำแหน่งพร้อมกัน และ 1 ตำแหน่งมียางได้เส้นเดียว
create unique index if not exists tires_position_unique
  on public.tires(vehicle_id, position_code) where status = 'mounted';

-- ------------------------------------------------------------
-- tire_events : ประวัติถอด-ใส่ (ledger, append-only)
-- ------------------------------------------------------------
create table if not exists public.tire_events (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null references public.companies(id) on delete cascade,
  tire_id       uuid not null references public.tires(id) on delete cascade,
  vehicle_id    uuid references public.vehicles(id) on delete set null,
  event_type    tire_event_type not null,
  position_code text,
  odometer      integer not null check (odometer >= 0),
  tread_mm      numeric(3,1),
  -- ระยะที่วิ่งในรอบนี้ (เฉพาะ event unmount)
  distance_km   integer,
  reason_id     uuid references public.removal_reasons(id) on delete set null,
  note          text,
  event_date    date not null default current_date,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists tire_events_tire_idx    on public.tire_events(tire_id, created_at desc);
create index if not exists tire_events_company_idx on public.tire_events(company_id, event_date desc);
create index if not exists tire_events_vehicle_idx on public.tire_events(vehicle_id);

-- ------------------------------------------------------------
-- updated_at trigger
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['companies','profiles','vehicles','tires'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$I', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ============================================================
-- HELPER FUNCTIONS (ใช้ใน RLS policy — security definer กัน recursion)
-- ============================================================
create or replace function public.current_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.current_company_id()
returns uuid language sql stable security definer set search_path = public as $$
  select company_id from public.profiles where id = auth.uid();
$$;

create or replace function public.is_super_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.is_company_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false);
$$;

-- ============================================================
-- BUSINESS RPC — ถอด/ใส่ยาง (atomic, ป้องกัน race condition)
-- ============================================================

-- ใส่ยาง: ผูกยางเข้าตำแหน่งล้อ + บันทึก event + อัปเดตเลขไมล์รถ
create or replace function public.mount_tire(
  p_tire_id       uuid,
  p_vehicle_id    uuid,
  p_position_code text,
  p_odometer      integer,
  p_tread_mm      numeric default null,
  p_note          text default null,
  p_event_date    date default current_date
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_company uuid;
  v_event   uuid;
begin
  select company_id into v_company from public.tires where id = p_tire_id for update;
  if v_company is null then
    raise exception 'ไม่พบยางที่ระบุ' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.tires
             where id = p_tire_id and status = 'mounted') then
    raise exception 'ยางเส้นนี้ติดตั้งอยู่กับรถคันอื่นแล้ว' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.tires
             where vehicle_id = p_vehicle_id
               and position_code = p_position_code
               and status = 'mounted') then
    raise exception 'ตำแหน่งล้อนี้มียางติดตั้งอยู่แล้ว กรุณาถอดออกก่อน' using errcode = 'P0001';
  end if;

  update public.tires set
    status           = 'mounted',
    vehicle_id       = p_vehicle_id,
    position_code    = p_position_code,
    mounted_odometer = p_odometer,
    mounted_at       = now(),
    tread_mm         = coalesce(p_tread_mm, tread_mm)
  where id = p_tire_id;

  insert into public.tire_events
    (company_id, tire_id, vehicle_id, event_type, position_code,
     odometer, tread_mm, note, event_date, created_by)
  values
    (v_company, p_tire_id, p_vehicle_id, 'mount', p_position_code,
     p_odometer, p_tread_mm, p_note, p_event_date, auth.uid())
  returning id into v_event;

  update public.vehicles
     set current_mileage = greatest(current_mileage, p_odometer)
   where id = p_vehicle_id;

  return v_event;
end $$;

-- ถอดยาง: คำนวณระยะวิ่งรอบนี้ + สะสมเข้า total_distance_km
create or replace function public.unmount_tire(
  p_tire_id    uuid,
  p_odometer   integer,
  p_tread_mm   numeric default null,
  p_reason_id  uuid default null,
  p_note       text default null,
  p_event_date date default current_date
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  t         public.tires%rowtype;
  v_dist    integer;
  v_scrap   boolean := false;
  v_event   uuid;
begin
  select * into t from public.tires where id = p_tire_id for update;
  if not found then
    raise exception 'ไม่พบยางที่ระบุ' using errcode = 'P0002';
  end if;
  if t.status <> 'mounted' then
    raise exception 'ยางเส้นนี้ไม่ได้ติดตั้งอยู่กับรถ' using errcode = 'P0001';
  end if;
  if p_odometer < coalesce(t.mounted_odometer, 0) then
    raise exception 'เลขไมล์ต้องไม่น้อยกว่าเลขไมล์ตอนใส่ยาง (%)', t.mounted_odometer
      using errcode = 'P0001';
  end if;

  v_dist := p_odometer - coalesce(t.mounted_odometer, p_odometer);

  if p_reason_id is not null then
    select is_scrap into v_scrap from public.removal_reasons where id = p_reason_id;
  end if;

  insert into public.tire_events
    (company_id, tire_id, vehicle_id, event_type, position_code,
     odometer, tread_mm, distance_km, reason_id, note, event_date, created_by)
  values
    (t.company_id, p_tire_id, t.vehicle_id, 'unmount', t.position_code,
     p_odometer, p_tread_mm, v_dist, p_reason_id, p_note, p_event_date, auth.uid())
  returning id into v_event;

  update public.tires set
    status            = case when coalesce(v_scrap, false) then 'scrapped'::tire_status
                             else 'in_stock'::tire_status end,
    vehicle_id        = null,
    position_code     = null,
    mounted_odometer  = null,
    mounted_at        = null,
    total_distance_km = total_distance_km + v_dist,
    tread_mm          = coalesce(p_tread_mm, tread_mm)
  where id = p_tire_id;

  update public.vehicles
     set current_mileage = greatest(current_mileage, p_odometer)
   where id = t.vehicle_id;

  return v_event;
end $$;

/**
 * ประมวลผลรายการถอด/ใส่ยางตามลำดับที่ส่งมา
 *
 * @param p_vehicle_id รถที่ทำรายการ
 * @param p_event_date วันที่ทำรายการ
 * @param p_ops        อาร์เรย์ของ op ตามลำดับที่ต้องการให้ทำงาน
 *                     [{ "op": "unmount", "tire_id": "...", "odometer": 120000,
 *                        "tread_mm": 6.5, "reason_id": "...", "note": "" },
 *                      { "op": "mount", "tire_id": "...", "position_code": "A2LO",
 *                        "odometer": 120000, "tread_mm": 16, "note": "" }]
 * @returns จำนวน op ที่บันทึกสำเร็จ
 */
create or replace function public.apply_tire_ops(
  p_vehicle_id uuid,
  p_event_date date,
  p_ops        jsonb
) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  op    jsonb;
  n     integer := 0;
  kind  text;
begin
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) = 0 then
    raise exception 'ไม่มีรายการที่จะบันทึก' using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_ops) > 60 then
    raise exception 'บันทึกได้สูงสุด 60 รายการต่อครั้ง' using errcode = 'P0001';
  end if;

  for op in select * from jsonb_array_elements(p_ops) loop
    kind := op->>'op';

    if kind = 'unmount' then
      perform public.unmount_tire(
        (op->>'tire_id')::uuid,
        (op->>'odometer')::integer,
        nullif(op->>'tread_mm', '')::numeric,
        nullif(op->>'reason_id', '')::uuid,
        nullif(op->>'note', ''),
        p_event_date
      );

    elsif kind = 'mount' then
      perform public.mount_tire(
        (op->>'tire_id')::uuid,
        p_vehicle_id,
        op->>'position_code',
        (op->>'odometer')::integer,
        nullif(op->>'tread_mm', '')::numeric,
        nullif(op->>'note', ''),
        p_event_date
      );

    else
      raise exception 'ประเภทรายการไม่ถูกต้อง: %', coalesce(kind, 'null') using errcode = 'P0001';
    end if;

    n := n + 1;
  end loop;

  return n;
end $$;

comment on function public.apply_tire_ops(uuid, date, jsonb) is
  'บันทึกงานถอด/ใส่ยางหลายรายการของรถคันเดียวในทรานแซกชันเดียว (all-or-nothing)';

-- ============================================================
-- VIEW : ยางพร้อมระยะวิ่งปัจจุบัน + สถานะแจ้งเตือน
-- ============================================================
create or replace view public.tire_overview
with (security_invoker = true) as
select
  t.id,
  t.company_id,
  t.serial_no,
  t.brand_name,
  t.model_name,
  t.size,
  t.dot,
  t.status,
  t.tread_mm,
  t.new_tread_mm,
  t.total_distance_km,
  t.mounted_odometer,
  t.mounted_at,
  t.position_code,
  v.id            as vehicle_id,
  v.plate_no,
  v.province,
  v.current_mileage,
  -- ระยะวิ่งของรอบติดตั้งปัจจุบัน
  case when t.status = 'mounted'
       then greatest(v.current_mileage - t.mounted_odometer, 0)
       else 0 end as current_run_km,
  -- ระยะสะสมทั้งหมด (รวมรอบปัจจุบัน)
  t.total_distance_km + case when t.status = 'mounted'
       then greatest(v.current_mileage - t.mounted_odometer, 0) else 0 end as lifetime_km,
  c.alert_km,
  c.alert_tread_mm,
  tm.image_url
from public.tires t
left join public.vehicles v     on v.id = t.vehicle_id
left join public.tire_models tm on tm.id = t.tire_model_id
join public.companies c         on c.id = t.company_id;

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.companies          enable row level security;
alter table public.profiles           enable row level security;
alter table public.vehicles           enable row level security;
alter table public.tires              enable row level security;
alter table public.tire_events        enable row level security;
alter table public.tire_brands        enable row level security;
alter table public.tire_models        enable row level security;
alter table public.company_tire_models enable row level security;
alter table public.removal_reasons    enable row level security;

-- companies -------------------------------------------------
drop policy if exists companies_select on public.companies;
create policy companies_select on public.companies for select to authenticated
  using (is_super_admin() or id = current_company_id());

drop policy if exists companies_super_write on public.companies;
create policy companies_super_write on public.companies for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- admin แก้ข้อมูลบริษัทตัวเองได้ (ไม่ให้ลบ/สร้าง)
drop policy if exists companies_admin_update on public.companies;
create policy companies_admin_update on public.companies for update to authenticated
  using (is_company_admin() and id = current_company_id())
  with check (is_company_admin() and id = current_company_id());

-- profiles --------------------------------------------------
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (is_super_admin() or id = auth.uid() or company_id = current_company_id());

drop policy if exists profiles_super_write on public.profiles;
create policy profiles_super_write on public.profiles for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- admin จัดการช่างในบริษัทตัวเอง (ห้ามสร้าง super_admin)
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all to authenticated
  using (is_company_admin() and company_id = current_company_id() and role <> 'super_admin')
  with check (is_company_admin() and company_id = current_company_id() and role <> 'super_admin');

-- vehicles / tires / tire_events : tenant isolation ----------
do $$
declare tbl text;
begin
  foreach tbl in array array['vehicles','tires','tire_events'] loop
    execute format('drop policy if exists %1$s_tenant_select on public.%1$I', tbl);
    execute format($f$create policy %1$s_tenant_select on public.%1$I
      for select to authenticated
      using (is_super_admin() or company_id = current_company_id())$f$, tbl);

    execute format('drop policy if exists %1$s_tenant_write on public.%1$I', tbl);
    execute format($f$create policy %1$s_tenant_write on public.%1$I
      for all to authenticated
      using (is_super_admin() or company_id = current_company_id())
      with check (is_super_admin() or company_id = current_company_id())$f$, tbl);
  end loop;
end $$;

-- removal_reasons : ทุกคนอ่านได้, super admin เท่านั้นที่แก้ ---
drop policy if exists reasons_select on public.removal_reasons;
create policy reasons_select on public.removal_reasons for select to authenticated using (true);
drop policy if exists reasons_write on public.removal_reasons;
create policy reasons_write on public.removal_reasons for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- tire_brands ------------------------------------------------
drop policy if exists brands_select on public.tire_brands;
create policy brands_select on public.tire_brands for select to authenticated using (true);
drop policy if exists brands_super_write on public.tire_brands;
create policy brands_super_write on public.tire_brands for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
-- ช่าง/แอดมิน เพิ่มยี่ห้อใหม่ได้เมื่อยังไม่มีในระบบ (ตามสเปคหน้าช่าง)
drop policy if exists brands_tenant_insert on public.tire_brands;
create policy brands_tenant_insert on public.tire_brands for insert to authenticated
  with check (created_by_company = current_company_id());

-- tire_models : ลูกค้าเห็นเฉพาะรุ่นที่ super admin กำหนดให้ ----
drop policy if exists models_select on public.tire_models;
create policy models_select on public.tire_models for select to authenticated
  using (
    is_super_admin()
    or created_by_company = current_company_id()
    or exists (
      select 1 from public.company_tire_models m
      where m.tire_model_id = tire_models.id
        and m.company_id = current_company_id()
    )
  );
drop policy if exists models_super_write on public.tire_models;
create policy models_super_write on public.tire_models for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
drop policy if exists models_tenant_insert on public.tire_models;
create policy models_tenant_insert on public.tire_models for insert to authenticated
  with check (created_by_company = current_company_id());

-- company_tire_models ---------------------------------------
drop policy if exists ctm_select on public.company_tire_models;
create policy ctm_select on public.company_tire_models for select to authenticated
  using (is_super_admin() or company_id = current_company_id());
drop policy if exists ctm_super_write on public.company_tire_models;
create policy ctm_super_write on public.company_tire_models for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

-- ============================================================
-- STORAGE
-- ============================================================

-- ------------------------------------------------------------
-- Storage: bucket สำหรับรูปยาง
-- ------------------------------------------------------------
-- สร้าง bucket แบบ public (อ่านได้ทุกคนผ่าน CDN, เขียนผ่าน service role เท่านั้น)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tire-images', 'tire-images', true, 3145728,
  array['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/avif'];

-- อ่านรูปได้แบบสาธารณะ (bucket เป็น public อยู่แล้ว policy นี้ครอบคลุมกรณีเรียกผ่าน API)
drop policy if exists tire_images_public_read on storage.objects;
create policy tire_images_public_read on storage.objects
  for select to public
  using (bucket_id = 'tire-images');

-- การอัปโหลด/ลบทำผ่าน server action ที่ใช้ service role เท่านั้น
-- จึงไม่ต้องเปิด policy insert/update/delete ให้ผู้ใช้ทั่วไป
