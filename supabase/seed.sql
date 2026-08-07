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

-- ประเภทเพลา (super admin แก้ไข/เพิ่มได้ภายหลัง) ---------------
insert into public.axle_types (code, name, axle_kinds, category, image_url, sort_order) values
  ('4W',        'รถ 4 ล้อ (เพลาเดี่ยว 2 เพลา)',                 array['single', 'single'],                 'head',    null,                      1),
  ('6W',        'รถ 6 ล้อ (หน้าเดี่ยว หลังคู่)',                array['single', 'dual'],                   'head',    '/assets/images/6w.jpg',   2),
  ('10W',       'รถ 10 ล้อ (หน้าเดี่ยว หลังคู่ 2 เพลา)',        array['single', 'dual', 'dual'],           'head',    '/assets/images/10w.jpg',  3),
  ('12W',       'รถ 12 ล้อ (หน้าเดี่ยว 2 เพลา หลังคู่ 2 เพลา)', array['single', 'single', 'dual', 'dual'], 'head',    null,                      4),
  ('TRAILER_2', 'หางพ่วง 2 เพลา (8 ล้อ)',                       array['dual', 'dual'],                     'trailer', null,                      5),
  ('TRAILER_3', 'หางพ่วง 3 เพลา (12 ล้อ)',                      array['dual', 'dual', 'dual'],             'trailer', null,                      6)
on conflict (code) do nothing;

-- ยี่ห้อยางกลาง ------------------------------------------------
insert into public.tire_brands (name) values
  ('MICHELIN'), ('BRIDGESTONE'), ('OTANI'), ('DEESTONE'), ('YOKOHAMA')
on conflict (name) do nothing;

-- รุ่นยางกลาง --------------------------------------------------
insert into public.tire_models (brand_id, name, size, pattern_code, new_tread_mm)
select b.id, m.name, m.size, m.pattern, m.new_tread_mm
from public.tire_brands b
join (values 
  ('AUSTONE',       'OH-110',         '11R22.5',     'OH110',   16.0), 
) as m(brand, name, size, pattern, new_tread_mm) on m.brand = b.name
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
--
-- 3) เปิดสิทธิ์ให้บริษัทเห็นประเภทเพลาทุกแบบ (หรือเลือกเฉพาะแบบในหน้า Super Admin)
-- insert into public.company_axle_types (company_id, axle_type_id)
-- select (select id from public.companies where code = 'DEMO'), id
-- from public.axle_types where is_active
-- on conflict do nothing;
