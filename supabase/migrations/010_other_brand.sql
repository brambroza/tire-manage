-- ============================================================
-- ยี่ห้อ "อื่นๆ" ในแคตตาล็อกกลาง
--
-- ลูกค้าไม่สามารถพิมพ์ยี่ห้อ/รุ่นเองได้อีกต่อไป (ปิดโหมดพิมพ์เองในฟอร์มเพิ่มยาง)
-- จึงต้องมีตัวเลือกกลางสำหรับยางที่ไม่ระบุยี่ห้อชัดเจน โดยไม่ต้องสร้างรายการใหม่ในฐานข้อมูล
-- สร้างรุ่น "อื่นๆ" หนึ่งรายการต่อขนาดยางที่มีอยู่แล้วในแคตตาล็อก
-- และเปิดสิทธิ์ให้ทุกบริษัทเห็นทันที (super admin เพิ่มขนาดอื่นได้ที่หน้าจัดการรุ่นยาง)
-- ============================================================

-- ยี่ห้อกลาง (created_by_company = null = ของ super admin)
insert into public.tire_brands (name)
values ('อื่นๆ')
on conflict (name) do nothing;

-- รุ่น "อื่นๆ" ต่อขนาดที่ใช้อยู่จริงในแคตตาล็อก (ไม่รวมรายการรอตรวจสอบของบริษัท)
insert into public.tire_models (brand_id, name, size, new_tread_mm)
select b.id, 'อื่นๆ', s.size, null
from public.tire_brands b
cross join (
  select distinct m.size
  from public.tire_models m
  where m.size is not null
    and m.created_by_company is null
) as s
where b.name = 'อื่นๆ'
on conflict (brand_id, name, size) do nothing;

-- ทุกบริษัทเห็นรุ่น "อื่นๆ" ทุกขนาด
insert into public.company_tire_models (company_id, tire_model_id)
select c.id, m.id
from public.companies c
cross join public.tire_models m
join public.tire_brands b on b.id = m.brand_id
where b.name = 'อื่นๆ'
on conflict do nothing;
