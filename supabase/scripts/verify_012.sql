-- ============================================================
-- ตรวจสอบ migration 012 (แพ็กเกจ Standard/Premium + สาขาของรถ)
--
-- ไฟล์นี้อ่านอย่างเดียว รันซ้ำได้ ไม่แก้ข้อมูล
-- paste ทีละบล็อกใน Supabase SQL editor หลังรัน 012_plans_import_branch.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1) คอลัมน์ใหม่ครบ — ต้องได้ 4 แถว (plan, plan_expires_at, branches, branch)
-- ------------------------------------------------------------
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'companies' and column_name in ('plan', 'plan_expires_at', 'branches'))
    or (table_name = 'vehicles'  and column_name = 'branch'))
order by table_name, column_name;

-- ------------------------------------------------------------
-- 2) ทุกบริษัทเริ่มที่ standard ไม่มีวันหมดอายุ และ branches เป็น array ว่าง
--    ต้องได้ premium_rows = 0 (ยกเว้นเปิด premium ไปแล้ว) และ null_branches = 0
-- ------------------------------------------------------------
select
  count(*) filter (where plan = 'premium')  as premium_rows,
  count(*) filter (where branches is null)  as null_branches,
  count(*)                                  as companies
from public.companies;

-- ------------------------------------------------------------
-- 3) trigger กันแอดมินบริษัทเปลี่ยนแพ็กเกจเองติดตั้งแล้ว — ต้องได้ 1 แถว
-- ------------------------------------------------------------
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.companies'::regclass
  and tgname = 'trg_guard_company_plan';

-- ------------------------------------------------------------
-- 4) ดัชนีช่วยรายงานมีครบ — ต้องได้ 2 แถว
-- ------------------------------------------------------------
select indexname
from pg_indexes
where schemaname = 'public'
  and indexname in ('vehicles_company_branch_idx', 'tire_events_vehicle_date_idx');
