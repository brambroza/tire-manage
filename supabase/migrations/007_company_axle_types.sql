-- ============================================================
-- สิทธิ์การมองเห็นประเภทเพลา: super admin กำหนดว่าบริษัทไหนเห็นเพลาแบบใดบ้าง
-- ============================================================

create table if not exists public.company_axle_types (
  company_id   uuid not null references public.companies(id) on delete cascade,
  axle_type_id uuid not null references public.axle_types(id) on delete cascade,
  created_at   timestamptz not null default now(),
  primary key (company_id, axle_type_id)
);

create index if not exists company_axle_types_axle_idx
  on public.company_axle_types(axle_type_id);

comment on table public.company_axle_types is
  'super admin กำหนดว่าบริษัทลูกค้ารายไหนเห็นประเภทเพลาใดบ้าง';

alter table public.company_axle_types enable row level security;

-- ------------------------------------------------------------
-- ข้อมูลตั้งต้น: บริษัทเดิมทุกรายเห็นประเภทเพลาที่เปิดใช้งานอยู่ทั้งหมด
-- (กันข้อมูลเดิมหายตอนเปิดใช้ระบบสิทธิ์ครั้งแรก)
-- ------------------------------------------------------------
insert into public.company_axle_types (company_id, axle_type_id)
select c.id, a.id
from public.companies c
cross join public.axle_types a
where a.is_active
on conflict do nothing;

-- เพลาที่รถของบริษัทใช้อยู่แล้ว ต้องมีสิทธิ์เสมอ
insert into public.company_axle_types (company_id, axle_type_id)
select distinct v.company_id, a.id
from public.vehicles v
join public.axle_types a on a.code = v.axle_type
on conflict do nothing;

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

-- axle_types : ลูกค้าเห็นเฉพาะประเภทที่ super admin กำหนดให้
drop policy if exists axle_types_select on public.axle_types;
create policy axle_types_select on public.axle_types for select to authenticated
  using (
    is_super_admin()
    or exists (
      select 1 from public.company_axle_types ca
      where ca.axle_type_id = axle_types.id
        and ca.company_id = current_company_id()
    )
    -- รถที่ใช้เพลานี้อยู่แล้วต้องอ่านผังล้อได้เสมอ ถึงแม้สิทธิ์จะถูกถอนภายหลัง
    or exists (
      select 1 from public.vehicles v
      where v.company_id = current_company_id()
        and v.axle_type = axle_types.code
    )
  );

-- company_axle_types : ลูกค้าอ่านของตัวเองได้, super admin เท่านั้นที่แก้
drop policy if exists cat_select on public.company_axle_types;
create policy cat_select on public.company_axle_types for select to authenticated
  using (is_super_admin() or company_id = current_company_id());
drop policy if exists cat_super_write on public.company_axle_types;
create policy cat_super_write on public.company_axle_types for all to authenticated
  using (is_super_admin()) with check (is_super_admin());
