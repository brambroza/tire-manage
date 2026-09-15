-- ============================================================
-- แจ้งเตือนรถที่เปลี่ยนยางบ่อย
--
-- นิยาม "บ่อย" = ถอดยาง (unmount) ตั้งแต่ N ครั้งขึ้นไป ภายใน D วันล่าสุด
-- ค่า N/D ตั้งได้ต่อบริษัท (default 3 ครั้ง / 90 วัน) เหมือน alert_km
-- แสดงทะเบียนรถในกระดิ่งแจ้งเตือน หน้าภาพรวม และรายการรถ
-- ============================================================

alter table public.companies
  add column if not exists alert_change_count integer not null default 3
    check (alert_change_count > 0),
  add column if not exists alert_change_days integer not null default 90
    check (alert_change_days > 0);

comment on column public.companies.alert_change_count is
  'จำนวนครั้งที่ถอดยางต่อคัน ตั้งแต่เท่านี้ขึ้นไปในช่วง alert_change_days ถือว่า "เปลี่ยนบ่อย"';
comment on column public.companies.alert_change_days is
  'ช่วงวันที่ย้อนหลังสำหรับนับจำนวนครั้งที่ถอดยาง';

-- ------------------------------------------------------------
-- view: รถที่ถอดยางถึงเกณฑ์ "บ่อย" ของบริษัทตัวเอง
-- security_invoker = true ให้ RLS ของ tire_events/vehicles/companies กรองตามผู้เรียก
-- ------------------------------------------------------------
create or replace view public.vehicle_change_alerts
with (security_invoker = true) as
select
  v.id                         as vehicle_id,
  v.company_id,
  v.plate_no,
  v.province,
  v.axle_type,
  v.is_active,
  c.alert_change_count         as threshold,
  c.alert_change_days          as window_days,
  count(e.id)::integer         as change_count,
  max(e.event_date)::date      as last_event_date
from public.vehicles v
join public.companies c on c.id = v.company_id
join public.tire_events e
  on e.vehicle_id = v.id
 and e.event_type = 'unmount'
 and e.event_date >= (current_date - c.alert_change_days)
group by v.id, v.company_id, v.plate_no, v.province, v.axle_type, v.is_active,
         c.alert_change_count, c.alert_change_days
having count(e.id) >= c.alert_change_count;

comment on view public.vehicle_change_alerts is
  'รถที่ถอดยางตั้งแต่ alert_change_count ครั้งขึ้นไปภายใน alert_change_days วันล่าสุด';

-- ประวัติถอดยางถูก query ตาม vehicle + วันที่บ่อยขึ้น
create index if not exists tire_events_vehicle_unmount_date_idx
  on public.tire_events (vehicle_id, event_date desc)
  where event_type = 'unmount';
