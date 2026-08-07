-- ============================================================
-- MIGRATION 003 — ดอกยางตอนใหม่ของรุ่นยาง
-- ============================================================
-- ให้ super admin กำหนดความลึกดอกยางตอนใหม่ในแคตตาล็อก
-- และใช้ค่านั้นเป็นค่าเริ่มต้นเมื่อเพิ่มยางรุ่นดังกล่าวเข้าคลัง
--
-- รันไฟล์นี้ใน Supabase SQL Editor (หลัง 002)
-- ============================================================

alter table public.tire_models
  add column if not exists new_tread_mm numeric(3,1);

alter table public.tire_models
  drop constraint if exists tire_models_new_tread_mm_check;

alter table public.tire_models
  add constraint tire_models_new_tread_mm_check
  check (new_tread_mm >= 0);
