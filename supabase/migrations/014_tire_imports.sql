-- ============================================================
-- ประวัติการนำเข้าซีรีย์ยางใหม่จากไฟล์ (เมนู "ข้อมูลยางใหม่" ของลูกค้า Premium)
--
-- ** ต้อง apply 012 ก่อนไฟล์นี้ ** (หน้านำเข้าเปิดใช้ตั้งแต่ 012)
--
-- ที่มา (ต.ค. 2569): ลูกค้าขอดูยางที่เคยนำเข้าทั้งหมด แยกเป็นรอบตามไฟล์
--   เดิมระบบเก็บที่มาไว้แค่ในหมายเหตุของยาง ("นำเข้าจากไฟล์ <ชื่อไฟล์> <วันที่>")
--   และถ้าแถวยี่ห้อปกติมีหมายเหตุของผู้ใช้ ที่มาจะไม่ถูกบันทึก
--   จึงเพิ่มตาราง tire_imports (1 แถว = 1 รอบนำเข้า) และ tires.import_id ผูกยางกับรอบ
--
-- backfill: สร้างรอบย้อนหลังจากหมายเหตุเดิม จัดกลุ่มตาม บริษัท + ชื่อไฟล์ + วันที่สร้างยาง
--   ยางที่หมายเหตุไม่มีข้อความที่มา (ยี่ห้อปกติที่กรอกหมายเหตุเอง) ระบุย้อนหลังไม่ได้
-- ============================================================

create table if not exists public.tire_imports (
  id               uuid primary key default gen_random_uuid(),
  company_id       uuid not null references public.companies(id) on delete cascade,
  file_name        text not null,
  -- ผู้นำเข้า (super admin ทำแทนได้) — เก็บชื่อ snapshot ไว้เผื่อบัญชีถูกลบ
  imported_by      uuid references public.profiles(id) on delete set null,
  imported_by_name text,
  -- จำนวนแถวในไฟล์ / นำเข้าสำเร็จ / ข้ามเพราะติดปัญหา
  row_count        integer not null default 0 check (row_count >= 0),
  inserted_count   integer not null default 0 check (inserted_count >= 0),
  skipped_count    integer not null default 0 check (skipped_count >= 0),
  created_at       timestamptz not null default now()
);
create index if not exists tire_imports_company_idx on public.tire_imports(company_id, created_at desc);

alter table public.tires
  add column if not exists import_id uuid references public.tire_imports(id) on delete set null;
create index if not exists tires_import_idx on public.tires(import_id) where import_id is not null;

-- RLS: เหมือน tires — บริษัทเห็น/เขียนเฉพาะของตัวเอง super admin เห็นทุกบริษัท
alter table public.tire_imports enable row level security;

drop policy if exists tire_imports_tenant_select on public.tire_imports;
create policy tire_imports_tenant_select on public.tire_imports for select to authenticated
  using (is_super_admin() or company_id = current_company_id());

drop policy if exists tire_imports_tenant_write on public.tire_imports;
create policy tire_imports_tenant_write on public.tire_imports for all to authenticated
  using (is_super_admin() or company_id = current_company_id())
  with check (is_super_admin() or company_id = current_company_id());

-- ------------------------------------------------------------ backfill
do $$
declare
  grp record;
  new_id uuid;
begin
  for grp in
    select
      t.company_id,
      substring(t.note from 'นำเข้าจากไฟล์ (.+) [0-9]{1,2} \S+ [0-9]{4}$') as file_name,
      (t.created_at at time zone 'Asia/Bangkok')::date as import_day,
      min(t.created_at) as first_at,
      array_agg(t.id) as tire_ids
    from public.tires t
    where t.import_id is null
      and t.note ~ 'นำเข้าจากไฟล์ .+ [0-9]{1,2} \S+ [0-9]{4}$'
    group by 1, 2, 3
  loop
    insert into public.tire_imports
      (company_id, file_name, imported_by_name, row_count, inserted_count, skipped_count, created_at)
    values
      (grp.company_id, grp.file_name, 'ข้อมูลย้อนหลัง', cardinality(grp.tire_ids), cardinality(grp.tire_ids), 0, grp.first_at)
    returning id into new_id;

    update public.tires set import_id = new_id where id = any(grp.tire_ids);
  end loop;
end $$;
