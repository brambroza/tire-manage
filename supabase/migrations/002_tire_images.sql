-- ============================================================
-- MIGRATION 002 — รูปภาพยางในแคตตาล็อก
-- ============================================================
-- เพิ่มรูปให้รุ่นยาง เพื่อให้ช่างเลือกยางจากภาพได้ และแสดงในคลัง/แดชบอร์ด
-- รูปเก็บใน Supabase Storage bucket ชื่อ "tire-images" (public read)
--
-- รันไฟล์นี้ใน Supabase SQL Editor (หลัง 001)
-- ============================================================

alter table public.tire_models
  add column if not exists image_url text;

-- ------------------------------------------------------------
-- view: เพิ่ม image_url ต่อท้าย (ดึงจากรุ่นยางที่ยางเส้นนั้นผูกอยู่)
-- ------------------------------------------------------------
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
  case when t.status = 'mounted'
       then greatest(v.current_mileage - t.mounted_odometer, 0)
       else 0 end as current_run_km,
  t.total_distance_km + case when t.status = 'mounted'
       then greatest(v.current_mileage - t.mounted_odometer, 0) else 0 end as lifetime_km,
  c.alert_km,
  c.alert_tread_mm,
  tm.image_url
from public.tires t
left join public.vehicles v    on v.id = t.vehicle_id
left join public.tire_models tm on tm.id = t.tire_model_id
join public.companies c        on c.id = t.company_id;

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
