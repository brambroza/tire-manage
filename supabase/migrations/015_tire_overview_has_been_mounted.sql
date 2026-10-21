-- ============================================================
-- ยางที่ถอดเก็บต้องไม่แสดงเป็น "ยางใหม่"
--
-- ** ต้อง apply 011 ก่อนไฟล์นี้ ** (view tire_overview รูปปัจจุบันมาจาก 011)
--
-- ที่มา (ต.ค. 2569): ลูกค้าพบยางที่ถอดออกจากรถแล้ว (มีสาเหตุการถอด) แต่หน้าคลังยาง
--   ขึ้นสถานะ "ยางใหม่" — เดิมระบบตัดสินยางใหม่จาก in_stock + lifetime_km = 0
--   แต่ยางที่ถอดเก็บมีระยะสะสม 0 ได้ เช่น
--     - ถอดยางที่ไม่มีข้อมูลในระบบ (manual unmount) ระบบใส่ย้อนหลังที่เลขไมล์เดียวกับตอนถอด
--     - ใส่แล้วถอดออกที่เลขไมล์เดียวกัน (ใส่ผิดเส้น / เลขไมล์รถไม่ถูกอัปเดต)
--   จึงเพิ่มคอลัมน์ has_been_mounted ใน view: true = มี event ใส่/ถอดอย่างน้อย 1 ครั้ง
--   แอปใช้ร่วมกับ lifetime_km: ยางใหม่ = in_stock และ lifetime_km = 0 และ has_been_mounted = false
--
-- ต่อท้ายคอลัมน์เท่านั้น (create or replace view ห้ามสลับ/เปลี่ยนชนิดคอลัมน์เดิม)
-- ============================================================

-- ============================================================
-- VIEW : ยางพร้อมระยะวิ่ง + ค่าประมาณ + สถานะแจ้งเตือน
--
-- !! ห้ามสลับลำดับหรือเปลี่ยนชนิดของคอลัมน์เดิม !!
-- create or replace view อนุญาตให้ "ต่อท้าย" คอลัมน์ใหม่เท่านั้น
-- ถ้าจัดเรียงคอลัมน์เดิมใหม่จะ fail ด้วย cannot change name of view column
--
-- คอลัมน์ estimated_* เป็นค่าคำนวณสด ไม่เคยถูกเขียนลงตาราง
-- เพื่อไม่ให้ค่าเดาปนเข้า tire_events.distance_km / tires.total_distance_km
-- ============================================================
create or replace view public.tire_overview
with (security_invoker = true) as
with base as (
  select
    t.id, t.company_id, t.serial_no, t.brand_name, t.model_name, t.size, t.dot, t.status,
    t.tread_mm, t.new_tread_mm, t.total_distance_km, t.mounted_odometer, t.mounted_at,
    t.position_code,
    v.id              as vehicle_id,
    v.plate_no,
    v.province,
    v.current_mileage,
    -- ระยะวิ่งของรอบติดตั้งปัจจุบัน (วัดจริง)
    case when t.status = 'mounted'
         then greatest(v.current_mileage - t.mounted_odometer, 0)
         else 0 end   as current_run_km,
    c.alert_km,
    c.alert_tread_mm,
    tm.image_url,
    c.alert_lifetime_km,
    c.estimate_max_days,
    v.mileage_updated_at,
    -- ค่าเฉลี่ยที่มีผลกับรถคันนี้: ของคันนี้ก่อน ถ้าไม่มีใช้ค่ากลางของบริษัท
    coalesce(v.avg_km_per_month, c.avg_km_per_month) as avg_km_per_month,
    -- greatest(..., 0) กันกรณีเวลาเครื่องเพี้ยนจนวันที่อยู่ในอนาคต
    case when v.mileage_updated_at is null then null
         else greatest(current_date - v.mileage_updated_at::date, 0) end as days_since_mileage
  from public.tires t
  left join public.vehicles v     on v.id = t.vehicle_id
  left join public.tire_models tm on tm.id = t.tire_model_id
  join public.companies c         on c.id = t.company_id
), est as (
  select b.*,
    -- กม. ที่ประมาณว่าวิ่งเพิ่มหลังเลขไมล์จริงครั้งล่าสุด
    -- least(..., estimate_max_days) = เพดาน ไม่มีเลขไมล์นานเกินไปก็หยุดเดา
    -- 30.44 = 365.25 / 12 (ไม่ใช่ 30 — ต่างกัน ~1.5%)
    case
      when b.status <> 'mounted' then 0
      when b.avg_km_per_month is null or b.days_since_mileage is null then 0
      else floor(least(b.days_since_mileage, b.estimate_max_days)::numeric
                 * b.avg_km_per_month / 30.44)::integer
    end as estimated_extra_km
  from base b
), run as (
  select e.*,
    case when e.status = 'mounted'
         then greatest(e.current_mileage + e.estimated_extra_km - e.mounted_odometer, 0)
         else 0 end as estimated_run_km
  from est e
)
select
  -- ---------- คอลัมน์เดิม ห้ามสลับลำดับ ----------
  r.id,
  r.company_id,
  r.serial_no,
  r.brand_name,
  r.model_name,
  r.size,
  r.dot,
  r.status,
  r.tread_mm,
  r.new_tread_mm,
  r.total_distance_km,
  r.mounted_odometer,
  r.mounted_at,
  r.position_code,
  r.vehicle_id,
  r.plate_no,
  r.province,
  r.current_mileage,
  r.current_run_km,
  -- ระยะสะสมทั้งหมด (รวมรอบปัจจุบัน) จากเลขไมล์ที่วัดจริง
  r.total_distance_km + r.current_run_km as lifetime_km,
  r.alert_km,
  r.alert_tread_mm,
  r.image_url,
  -- ---------- คอลัมน์ใหม่ ต่อท้ายเท่านั้น ----------
  r.avg_km_per_month,
  r.mileage_updated_at,
  r.days_since_mileage,
  r.estimate_max_days,
  r.estimated_extra_km,
  r.estimated_run_km,
  -- ระยะสะสมแบบรวมค่าประมาณ — ตัวเลขที่ใช้ตัดสินเกณฑ์ alert_lifetime_km
  r.total_distance_km + r.estimated_run_km as estimated_lifetime_km,
  -- ตัวเลขนี้มีค่าประมาณปนอยู่หรือไม่ — UI ต้องติดป้าย "ประมาณการ" เมื่อเป็น true
  r.estimated_extra_km > 0 as is_estimated,
  -- ชนเพดานแล้ว = เลขไมล์เก่าเกินกว่าจะประมาณต่อ ต้องให้คนไปยืนยัน
  coalesce(r.days_since_mileage >= r.estimate_max_days, false) as is_mileage_stale,
  r.alert_lifetime_km,
  -- อีกกี่วันถึงเกณฑ์ระยะสะสม (0 = ถึงแล้ว, null = ไม่มีเกณฑ์/ไม่มีค่าเฉลี่ย/ถูกตัดจำหน่าย)
  case
    when r.alert_lifetime_km is null then null
    when r.status = 'scrapped' then null
    when r.total_distance_km + r.estimated_run_km >= r.alert_lifetime_km then 0
    when r.status <> 'mounted' then null
    when coalesce(r.avg_km_per_month, 0) <= 0 then null
    else ceil((r.alert_lifetime_km - (r.total_distance_km + r.estimated_run_km))::numeric
              / (r.avg_km_per_month::numeric / 30.44))::integer
  end as days_to_lifetime_alert,
  -- เคยติดรถแล้วหรือยัง (มี event ใส่/ถอดอย่างน้อย 1 ครั้ง)
  -- ใช้ตัดสิน "ยางใหม่" แทนระยะสะสม = 0 เพราะยางที่ถอดเก็บอาจมีระยะสะสม 0 ได้
  -- (ถอดยางที่ไม่มีข้อมูลในระบบโดยไม่รู้เลขไมล์ตอนใส่, ใส่แล้วถอดที่เลขไมล์เดียวกัน)
  exists (
    select 1 from public.tire_events e
    where e.tire_id = r.id and e.event_type in ('mount', 'unmount')
  ) as has_been_mounted
from run r;

comment on view public.tire_overview is
  'ยางพร้อมระยะวิ่งที่วัดจริงและค่าประมาณ — คอลัมน์ estimated_* เป็นค่าคำนวณสด '
  'ไม่เคยถูกเขียนลงตาราง เพื่อไม่ให้ค่าเดาปนเข้า tire_events.distance_km; '
  'has_been_mounted = เคยมี event ใส่/ถอด ใช้แยกยางใหม่ออกจากยางที่ถอดเก็บ';
