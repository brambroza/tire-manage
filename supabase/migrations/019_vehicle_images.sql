-- ============================================================
-- รูปรถ 1 รูปต่อคัน (รันซ้ำได้)
-- เก็บเฉพาะ object path ใน vehicles.image_path ไฟล์อยู่ใน bucket "vehicle-images" แบบ private
-- เพราะรูปรถมักเห็นป้ายทะเบียน แอปเปิดดูผ่าน signed URL อายุสั้นหลังตรวจสิทธิ์รถด้วย RLS
-- อัปโหลด/ลบผ่าน server action ที่ใช้ service role เท่านั้น จึงไม่เปิด policy ของ storage ให้ผู้ใช้
-- path: <company_id>/<vehicle_id>/<uuid>.<ext>
-- ============================================================
begin;

alter table public.vehicles add column if not exists image_path text;
comment on column public.vehicles.image_path is
  'object path ของรูปรถใน bucket vehicle-images (private) — null = ยังไม่มีรูป';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vehicle-images', 'vehicle-images', false, 3145728,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  public = false,
  file_size_limit = 3145728,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

commit;
