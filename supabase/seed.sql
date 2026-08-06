-- ============================================================
-- DREAM TIRE MANAGEMENT — Seed data
-- รันหลัง schema.sql
-- ============================================================

-- สาเหตุการถอดยาง (super admin แก้ไข/เพิ่มได้ภายหลัง) ----------
insert into public.removal_reasons (code, name, is_scrap, sort_order) values
  ('WORN_OUT',   'หมดดอกยาง',        true,  1),
  ('UNEVEN',     'กินไม่เรียบ',       false, 2),
  ('BLOWOUT',    'ระเบิด / บวม',      true,  3),
  ('ROTATE',     'สลับตำแหน่ง',       false, 4),
  ('STORE',      'ถอดเก็บ',           false, 5),
  ('RETREAD',    'ส่งหล่อดอก',        false, 6)
on conflict (code) do nothing;

-- ยี่ห้อยางกลาง ------------------------------------------------
insert into public.tire_brands (name) values
  ('MICHELIN'), ('BRIDGESTONE'), ('OTANI'), ('DEESTONE'), ('YOKOHAMA')
on conflict (name) do nothing;

-- รุ่นยางกลาง --------------------------------------------------
insert into public.tire_models (brand_id, name, size, pattern_code)
select b.id, m.name, m.size, m.pattern
from public.tire_brands b
join (values
  ('MICHELIN',    'X MULTI Z',      '295/80R22.5', 'MZ-295'),
  ('MICHELIN',    'X MULTI D',      '11R22.5',     'MD-11R'),
  ('BRIDGESTONE', 'R150',           '11R22.5',     'R150-11'),
  ('BRIDGESTONE', 'M840',           '295/80R22.5', 'M840-295'),
  ('OTANI',       'OH-110',         '11R22.5',     'OH110'),
  ('DEESTONE',    'SS431',          '215/70R16',   'SS431'),
  ('YOKOHAMA',    'RY023',          '225/70R15',   'RY023')
) as m(brand, name, size, pattern) on m.brand = b.name
on conflict (brand_id, name, size) do nothing;

-- ------------------------------------------------------------
-- ตัวอย่าง tenant + ผู้ใช้
-- ------------------------------------------------------------
-- 1) สร้าง user ใน Supabase Auth ก่อน (Dashboard > Authentication > Add user)
--    แล้วนำ UUID มาใส่แทน <UUID> ด้านล่าง
--
-- insert into public.companies (code, name, phone, alert_km)
-- values ('DEMO', 'บริษัท เดโม ขนส่ง จำกัด', '02-000-0000', 10000);
--
-- insert into public.profiles (id, company_id, role, full_name) values
--   ('<UUID-SUPER>', null, 'super_admin', 'Dreammaker Admin');
--
-- insert into public.profiles (id, company_id, role, full_name) values
--   ('<UUID-ADMIN>', (select id from public.companies where code = 'DEMO'),
--    'admin', 'แอดมินบริษัทเดโม'),
--   ('<UUID-TECH>',  (select id from public.companies where code = 'DEMO'),
--    'technician', 'ช่างสมชาย');
--
-- 2) เปิดสิทธิ์ให้บริษัทเห็นยางทุกรุ่น (หรือเลือกเฉพาะรุ่นในหน้า Super Admin)
-- insert into public.company_tire_models (company_id, tire_model_id)
-- select (select id from public.companies where code = 'DEMO'), id
-- from public.tire_models
-- on conflict do nothing;
