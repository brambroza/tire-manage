-- ============================================================
-- ประเภทเพลารถบัส 3 แบบ (รันซ้ำได้ — ข้ามถ้ามี code อยู่แล้ว)
-- axle_kinds เรียงจากเพลาหน้าไปหลัง: single = ล้อเดี่ยว (2 ล้อ), dual = ล้อคู่ (4 ล้อ)
--   BUS_6W  : รถบัส 6 ล้อ ชั้นเดียว        2 เพลา หน้าเดี่ยว หลังคู่
--   BUS_8W  : รถบัส 8 ล้อ 2 ชั้น            3 เพลา หน้าเดี่ยว กลางคู่ หลังเดี่ยว
--   BUS_10W : รถบัส 10 ล้อ 2 ชั้น ใหญ่พิเศษ 3 เพลา หน้าเดี่ยว กลางคู่ หลังคู่
-- เพิ่มหมวด 'bus' ให้ช่างเห็นปุ่ม "บัส" แยกจาก หัว / หาง
-- หลังรัน super admin ต้องเปิดสิทธิ์ให้บริษัทที่ต้องใช้ในหน้า "สิทธิ์ประเภทเพลา"
-- ============================================================
begin;

alter table public.axle_types drop constraint if exists axle_types_category_valid;
alter table public.axle_types
  add constraint axle_types_category_valid check (category in ('head', 'trailer', 'bus'));
comment on column public.axle_types.category is
  'หมวดของประเภทเพลา: head = รถหัวลาก/รถบรรทุก, trailer = หางพ่วง, bus = รถบัส';

insert into public.axle_types (code, name, axle_kinds, category, image_url, sort_order) values
  ('BUS_6W',  'รถบัส 6 ล้อ ชั้นเดียว (หน้าเดี่ยว หลังคู่)',                 array['single', 'dual'],           'bus',  null, 7),
  ('BUS_8W',  'รถบัส 8 ล้อ 2 ชั้น (หน้าเดี่ยว กลางคู่ หลังเดี่ยว)',          array['single', 'dual', 'single'], 'bus',  null, 8),
  ('BUS_10W', 'รถบัส 10 ล้อ 2 ชั้น ใหญ่พิเศษ (หน้าเดี่ยว กลางคู่ หลังคู่)', array['single', 'dual', 'dual'],   'bus',  null, 9)
on conflict (code) do nothing;

-- กรณีเคยรัน 018 รุ่นแรกที่ใส่หมวด head ไว้
update public.axle_types set category = 'bus'
where code in ('BUS_6W', 'BUS_8W', 'BUS_10W') and category <> 'bus';

commit;
