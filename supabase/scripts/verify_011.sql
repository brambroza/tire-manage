-- ============================================================
-- ตรวจสอบ migration 011 (แจ้งเตือนระยะสะสม + ประมาณการ)
--
-- ไฟล์นี้อ่านอย่างเดียว รันซ้ำได้ ไม่แก้ข้อมูล
-- paste ทีละบล็อกใน Supabase SQL editor หลังรัน 011_lifetime_alert_estimate.sql
-- ============================================================

-- ------------------------------------------------------------
-- 1) view ยังคืนจำนวนแถวเท่าเดิม — จับ regression ของ join ที่เพิ่มเข้ามา
--    ต้องได้ผลลัพธ์เดียวกันทั้งสองคอลัมน์
-- ------------------------------------------------------------
select
  (select count(*) from public.tire_overview) as overview_rows,
  (select count(*) from public.tires)         as tire_rows;

-- ------------------------------------------------------------
-- 2) ยังไม่ได้ตั้งค่าเฉลี่ยที่ไหนเลย → ต้องไม่มีการประมาณการ
--    ทั้งสองแถวต้องได้ 0 ถ้าไม่ใช่แปลว่าสูตรผิด
--    (ข้ามข้อนี้ถ้าตั้ง avg_km_per_month ไปแล้ว)
-- ------------------------------------------------------------
select
  count(*) filter (where estimated_extra_km <> 0)                    as rows_with_estimate,
  count(*) filter (where estimated_lifetime_km <> lifetime_km)       as rows_where_lifetime_differs
from public.tire_overview
where avg_km_per_month is null;

-- ------------------------------------------------------------
-- 3) ตรวจสูตรด้วยมือ — เลือกรถทดสอบ 1 คันแล้วรัน (ไม่แก้ข้อมูลจริง)
--    9,132 กม./เดือน ≈ 300 กม./วัน → 10 วันต้องได้ ~3,000
--    90 วัน (ชนเพดาน default) ต้องได้ ~27,000 ไม่ใช่ค่าที่โตต่อไปเรื่อย ๆ
-- ------------------------------------------------------------
select
  d                                                as days_since,
  floor(least(d, 90)::numeric * 9132 / 30.44)::int as expected_extra_km
from (values (0), (10), (30), (90), (200)) as t(d);

-- ------------------------------------------------------------
-- 4) เพดานทำงานจริง — ไม่มีแถวไหนประมาณเกินกว่าที่เพดานอนุญาต
--    ต้องได้ 0 แถว
-- ------------------------------------------------------------
select id, serial_no, days_since_mileage, estimate_max_days,
       avg_km_per_month, estimated_extra_km
from public.tire_overview
where estimated_extra_km
      > floor(least(days_since_mileage, estimate_max_days)::numeric * avg_km_per_month / 30.44) + 1;

-- ------------------------------------------------------------
-- 5) ไม่มีค่าติดลบ และวันที่อนาคตไม่ทำให้สูตรพัง — ต้องได้ 0 แถว
-- ------------------------------------------------------------
select id, serial_no, days_since_mileage, estimated_extra_km, estimated_run_km
from public.tire_overview
where estimated_extra_km < 0
   or estimated_run_km < 0
   or days_since_mileage < 0;

-- ------------------------------------------------------------
-- 6) ยางที่ไม่ได้ติดตั้ง ต้องไม่มีการประมาณ (ระยะสะสมเป็นค่าที่วัดจริงเป๊ะ)
--    ต้องได้ 0 แถว
-- ------------------------------------------------------------
select id, serial_no, status, estimated_extra_km, estimated_lifetime_km, total_distance_km
from public.tire_overview
where status <> 'mounted'
  and (estimated_extra_km <> 0 or estimated_lifetime_km <> total_distance_km);

-- ------------------------------------------------------------
-- 7) ledger ต้องสะอาด — ระยะที่ปิดรอบแล้วต้องเท่ากับส่วนต่างเลขไมล์ที่ช่างคีย์
--    ถ้ามีแถวออกมา แปลว่ามีค่าประมาณรั่วเข้า tire_events (ห้ามเกิดเด็ดขาด)
-- ------------------------------------------------------------
select e.id, e.tire_id, e.event_date, e.odometer, e.distance_km, prev.odometer as mount_odometer
from public.tire_events e
join lateral (
  select m.odometer from public.tire_events m
   where m.tire_id = e.tire_id and m.event_type = 'mount' and m.created_at < e.created_at
   order by m.created_at desc limit 1
) prev on true
where e.event_type = 'unmount'
  and e.distance_km is distinct from (e.odometer - prev.odometer);

-- ------------------------------------------------------------
-- 8) mileage_updated_at ถูก backfill ครบ และไม่มีค่าอนาคต — ต้องได้ 0 แถว
-- ------------------------------------------------------------
select id, plate_no, mileage_updated_at
from public.vehicles
where mileage_updated_at is null
   or mileage_updated_at > now() + interval '1 day';

-- ------------------------------------------------------------
-- 9) ค่าเฉลี่ยที่คำนวณจากประวัติ — สุ่มตรวจด้วยตา
--    รถที่มี event เดียวหรือช่วงสั้นกว่า 30 วัน ต้องไม่ติดอยู่ในผล
-- ------------------------------------------------------------
select v.plate_no, o.observed_km_per_month, o.sample_events, o.first_date, o.last_date,
       (o.last_date - o.first_date) as span_days
from public.vehicle_observed_monthly_km o
join public.vehicles v on v.id = o.vehicle_id
order by o.observed_km_per_month desc
limit 20;

-- ------------------------------------------------------------
-- 10) ยางที่เข้าเกณฑ์ระยะสะสม พร้อมที่มาของตัวเลข
--     ใช้ตรวจว่าตัวเลขบน dashboard ตรงกับใน DB
-- ------------------------------------------------------------
select serial_no, plate_no, position_code, status,
       total_distance_km, current_run_km, estimated_extra_km,
       estimated_lifetime_km, alert_lifetime_km,
       is_estimated, is_mileage_stale, days_to_lifetime_alert
from public.tire_overview
where alert_lifetime_km is not null
  and status <> 'scrapped'
  and estimated_lifetime_km >= alert_lifetime_km
order by estimated_lifetime_km desc;

-- ------------------------------------------------------------
-- 11) ยางที่ใกล้ครบภายใน 30 วัน — ใช้ตรวจกลุ่มสีส้มบน dashboard
-- ------------------------------------------------------------
select serial_no, plate_no, estimated_lifetime_km, alert_lifetime_km,
       avg_km_per_month, days_to_lifetime_alert, is_estimated
from public.tire_overview
where days_to_lifetime_alert between 1 and 30
order by days_to_lifetime_alert;
