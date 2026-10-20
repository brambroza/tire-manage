-- ============================================================
-- แอดมินบริษัทจัดการยี่ห้อ/รุ่นยางที่บริษัทตัวเองสร้าง (หน้า "ข้อมูลยาง" ของแอดมินบริษัท)
--
-- ** ต้อง apply 012 ก่อนไฟล์นี้ **
--
-- ที่มา (ต.ค. 2569): ลูกค้าขอเมนูข้อมูลยางแยก เหมือนของ super admin
--   เดิม RLS ให้บริษัท insert ได้อย่างเดียว (brands_tenant_insert / models_tenant_insert)
--   จึงเพิ่มสิทธิ์ update เฉพาะแถวที่ created_by_company = บริษัทตัวเอง
--   รายการจากแคตตาล็อกกลาง (created_by_company = null) ยังแก้ไม่ได้เหมือนเดิม
-- ============================================================

drop policy if exists brands_tenant_update on public.tire_brands;
create policy brands_tenant_update on public.tire_brands for update to authenticated
  using (created_by_company = current_company_id())
  with check (created_by_company = current_company_id());

drop policy if exists models_tenant_update on public.tire_models;
create policy models_tenant_update on public.tire_models for update to authenticated
  using (created_by_company = current_company_id())
  with check (created_by_company = current_company_id());
