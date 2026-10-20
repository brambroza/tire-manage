-- ล้างยางที่นำเข้าจากไฟล์ทดสอบ docs/test-data/tire-import/
-- แก้ :prefix ให้ตรงกับ prefix ที่ใช้สร้างไฟล์ (เช่น SEED1020) แล้วรันใน Supabase SQL editor
-- ลบเฉพาะยางที่ยังอยู่ในคลัง (ไม่เคยติดรถ) ของบริษัท GO1 — ยางที่ถูกใช้ทดสอบติดรถแล้วจะไม่ถูกลบ
-- ไม่ได้ลบยางชุดตัวเลขล้วน (05-numeric-serials) เพราะไม่มี prefix — ดูจากหมายเหตุ "ซีรีย์ตัวเลขล้วน" แทน

begin;

-- 1) ตรวจก่อนว่าจะลบกี่เส้น
select count(*) as will_delete
from public.tires t
join public.companies c on c.id = t.company_id
where c.code = 'GO1'
  and t.status = 'in_stock'
  and (upper(t.serial_no) like 'SEED1020-%' or t.note = 'ซีรีย์ตัวเลขล้วน')
  and not exists (select 1 from public.tire_events e where e.tire_id = t.id);

-- 2) ลบ (ถ้าจำนวนถูกต้องให้ commit ถ้าไม่ใช่ให้ rollback)
delete from public.tires t
using public.companies c
where c.id = t.company_id
  and c.code = 'GO1'
  and t.status = 'in_stock'
  and (upper(t.serial_no) like 'SEED1020-%' or t.note = 'ซีรีย์ตัวเลขล้วน')
  and not exists (select 1 from public.tire_events e where e.tire_id = t.id);

-- 3) (หลัง apply migration 014) ลบรอบนำเข้าที่ไม่เหลือยางแล้ว จะได้ไม่ค้างในเมนู "ข้อมูลยางใหม่"
--    ถ้ายังไม่ได้ apply 014 ให้ comment ส่วนนี้ออก
delete from public.tire_imports i
using public.companies c
where c.id = i.company_id
  and c.code = 'GO1'
  and not exists (select 1 from public.tires t where t.import_id = i.id);

-- 4) รุ่น/ยี่ห้อที่ไฟล์ 02 สร้างให้ GO1 (BRIDGESTONE R150, SAILUN SAC1) ปิดใช้งานได้ที่เมนู "ข้อมูลยาง"
--    ไม่ลบที่นี่เพราะอาจมียางอ้างอิงอยู่

rollback; -- เปลี่ยนเป็น commit; เมื่อตรวจจำนวนแล้ว
