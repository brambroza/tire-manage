-- ============================================================
-- แพ็กเกจการใช้งาน (Standard / Premium) + สาขาของรถ
--
-- ** ต้อง apply 008–011 ให้ครบก่อนไฟล์นี้ **
--
-- ที่มา (รอบ 3, ต.ค. 2569):
--   - ลูกค้าขอ "นำเข้าซีรีย์ยางจากไฟล์" — ฟีเจอร์นี้อยู่ในแพ็กเกจ Premium
--     super admin เป็นผู้กำหนดแพ็กเกจให้แต่ละบริษัท
--   - ลูกค้าขอรายงานจำนวนรถแยกตาม "สาขา/หน่วยงาน" (เทียบ Location ใน dashboard เดิม)
--     จึงเพิ่มรายชื่อสาขาที่บริษัทตั้งเอง และช่องสาขาในข้อมูลรถ
-- ============================================================

-- ------------------------------------------------------------
-- companies : แพ็กเกจ + วันหมดอายุ + รายชื่อสาขา
-- ------------------------------------------------------------
alter table public.companies
  add column if not exists plan text not null default 'standard'
    check (plan in ('standard', 'premium')),
  add column if not exists plan_expires_at date,
  add column if not exists branches text[] not null default '{}';

comment on column public.companies.plan is
  'แพ็กเกจการใช้งาน: standard = ฟีเจอร์พื้นฐาน, premium = เปิดฟีเจอร์เสริม เช่น นำเข้าซีรีย์ยาง '
  'กำหนดโดย super admin เท่านั้น (trigger กันแอดมินบริษัทแก้เอง)';
comment on column public.companies.plan_expires_at is
  'วันสุดท้ายที่แพ็กเกจ premium มีผล — null = ไม่มีกำหนด เมื่อเลยวันนี้ระบบถือว่าเป็น standard';
comment on column public.companies.branches is
  'รายชื่อสาขา/หน่วยงานของบริษัท (แอดมินบริษัทตั้งเอง) ใช้เป็นตัวเลือกช่อง vehicles.branch';

-- ------------------------------------------------------------
-- แอดมินบริษัทแก้ข้อมูลบริษัทตัวเองได้ (policy companies_admin_update)
-- แต่ห้ามเปลี่ยนแพ็กเกจเอง → กันที่ trigger เพราะ RLS คุมเป็นแถว ไม่คุมเป็นคอลัมน์
-- ------------------------------------------------------------
create or replace function public.guard_company_plan()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.plan is distinct from old.plan or new.plan_expires_at is distinct from old.plan_expires_at)
     and not public.is_super_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบ (Dreammaker) เท่านั้นที่เปลี่ยนแพ็กเกจได้'
      using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_company_plan on public.companies;
create trigger trg_guard_company_plan
  before update on public.companies
  for each row execute function public.guard_company_plan();

-- ------------------------------------------------------------
-- vehicles : สาขา/หน่วยงานที่รถสังกัด
-- เก็บเป็นข้อความ (snapshot) ให้รายงานอ่านง่าย; แอปตรวจกับ companies.branches ตอนบันทึก
-- null = ยังไม่ระบุสาขา (รายงานแสดงเป็น "ไม่ระบุสาขา")
-- ------------------------------------------------------------
alter table public.vehicles
  add column if not exists branch text;

comment on column public.vehicles.branch is
  'สาขา/หน่วยงานที่รถสังกัด — null = ไม่ระบุสาขา ใช้แยกกลุ่มในรายงานรถและการตรวจยาง';

create index if not exists vehicles_company_branch_idx
  on public.vehicles(company_id, branch);

-- ------------------------------------------------------------
-- ดัชนีช่วยรายงาน "ตรวจยางล่าสุดเมื่อไร" (หา event ล่าสุดต่อคัน)
-- ------------------------------------------------------------
create index if not exists tire_events_vehicle_date_idx
  on public.tire_events(vehicle_id, event_date desc);
