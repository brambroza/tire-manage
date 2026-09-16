-- ============================================================
-- แจ้งเตือนยางครบระยะสะสม + ประมาณการระยะจากค่าเฉลี่ยวิ่งต่อเดือน
--
-- ** ต้อง apply 008, 009, 010 ให้ครบก่อนไฟล์นี้ **
--
-- ที่มา: ลูกค้าถามว่า "การแจ้งเตือนถึงรอบคำนวณจากอะไร ถ้าไม่มีการถอดยาง
--        ก็ดูระยะระหว่างทางไม่ได้" — รอบนี้ให้กรอกค่าเฉลี่ยที่รถวิ่งต่อเดือน
--        แล้วระบบประมาณระยะที่วิ่งไปหลังเลขไมล์จริงครั้งล่าสุด ตัวนับจึงเดินเอง
--
-- กฎเหล็ก: ค่าประมาณอยู่ใน view เท่านั้น ห้ามเขียนลงตารางเด็ดขาด
--          ถ้าค่าประมาณไหลเข้า vehicles.current_mileage แล้ว unmount_tire
--          เอาไปคำนวณ tire_events.distance_km ledger จะปนค่าเดาอย่างถาวร
-- ============================================================

-- ------------------------------------------------------------
-- companies : เกณฑ์ระยะสะสม + ค่าเฉลี่ยกลางของฟลีต
--
-- alert_lifetime_km เป็นคนละตัวกับ alert_km:
--   alert_km          = ระยะของ "รอบการติดตั้งปัจจุบัน" (รอบสลับ/ตรวจ, default 10,000)
--   alert_lifetime_km = ระยะสะสมตลอดอายุยาง (หมดอายุ, เช่น 100,000)
-- ทั้งสองทำงานคู่กัน
-- ------------------------------------------------------------
alter table public.companies
  add column if not exists alert_lifetime_km integer
    check (alert_lifetime_km > 0),
  add column if not exists avg_km_per_month integer
    check (avg_km_per_month > 0),
  add column if not exists estimate_max_days integer not null default 90
    check (estimate_max_days > 0);

comment on column public.companies.alert_lifetime_km is
  'ระยะสะสมตลอดอายุยางที่จะแจ้งเตือน (กม.) — null = ปิดการเตือนข้อนี้ '
  'ตั้งเป็น null เป็นค่าเริ่มต้นโดยเจตนา กันยางเก่าเด้งพร้อมกันทั้งระบบวันที่รัน migration';
comment on column public.companies.avg_km_per_month is
  'ค่าเฉลี่ยที่รถวิ่งต่อเดือน (กม.) ใช้เป็นค่ากลางเมื่อรถคันนั้นไม่ได้กรอกไว้ — null = ไม่ประมาณการ';
comment on column public.companies.estimate_max_days is
  'หยุดประมาณการหลังไม่มีเลขไมล์จริงกี่วัน กันค่าประมาณบวกไปเรื่อยจนกลายเป็นตัวเลขที่เชื่อไม่ได้';

-- ------------------------------------------------------------
-- vehicles : ค่าเฉลี่ยต่อคัน + เวลาที่เลขไมล์จริงถูกอัปเดตล่าสุด
--
-- ใช้ updated_at ที่มีอยู่ไม่ได้ เพราะ trigger trg_touch_vehicles แตะทุกครั้งที่
-- UPDATE แถวนั้น แค่แก้ทะเบียนหรือปิดใช้งานรถก็จะรีเซ็ตนาฬิกาประมาณการ
-- ------------------------------------------------------------
alter table public.vehicles
  add column if not exists avg_km_per_month integer
    check (avg_km_per_month > 0),
  add column if not exists mileage_updated_at timestamptz;

comment on column public.vehicles.avg_km_per_month is
  'ค่าเฉลี่ยที่รถคันนี้วิ่งต่อเดือน (กม.) — null = ใช้ค่ากลางของบริษัท';
comment on column public.vehicles.mileage_updated_at is
  'เวลาที่ current_mileage ถูกอัปเดตจากเลขไมล์จริงครั้งล่าสุด ใช้เป็นจุดตั้งต้นของการประมาณการ';

-- ค่าตั้งต้นที่ดีที่สุดเท่าที่มี: เวลาที่แถวถูกแก้ล่าสุด
update public.vehicles
   set mileage_updated_at = coalesce(updated_at, created_at)
 where mileage_updated_at is null;

alter table public.vehicles alter column mileage_updated_at set default now();
alter table public.vehicles alter column mileage_updated_at set not null;

-- ============================================================
-- RPC : ประทับ mileage_updated_at ทุกครั้งที่เลขไมล์เดินหน้าจริง
-- ============================================================

-- ใส่ยาง: ผูกยางเข้าตำแหน่งล้อ + บันทึก event + อัปเดตเลขไมล์รถ
create or replace function public.mount_tire(
  p_tire_id       uuid,
  p_vehicle_id    uuid,
  p_position_code text,
  p_odometer      integer,
  p_tread_mm      numeric default null,
  p_note          text default null,
  p_event_date    date default current_date
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_company uuid;
  v_event   uuid;
begin
  select company_id into v_company from public.tires where id = p_tire_id for update;
  if v_company is null then
    raise exception 'ไม่พบยางที่ระบุ' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.tires
             where id = p_tire_id and status = 'mounted') then
    raise exception 'ยางเส้นนี้ติดตั้งอยู่กับรถคันอื่นแล้ว' using errcode = 'P0001';
  end if;

  if exists (select 1 from public.tires
             where vehicle_id = p_vehicle_id
               and position_code = p_position_code
               and status = 'mounted') then
    raise exception 'ตำแหน่งล้อนี้มียางติดตั้งอยู่แล้ว กรุณาถอดออกก่อน' using errcode = 'P0001';
  end if;

  update public.tires set
    status           = 'mounted',
    vehicle_id       = p_vehicle_id,
    position_code    = p_position_code,
    mounted_odometer = p_odometer,
    mounted_at       = now(),
    tread_mm         = coalesce(p_tread_mm, tread_mm)
  where id = p_tire_id;

  insert into public.tire_events
    (company_id, tire_id, vehicle_id, event_type, position_code,
     odometer, tread_mm, note, event_date, created_by)
  values
    (v_company, p_tire_id, p_vehicle_id, 'mount', p_position_code,
     p_odometer, p_tread_mm, p_note, p_event_date, auth.uid())
  returning id into v_event;

  -- ประทับเวลาเฉพาะเมื่อเลขไมล์เดินหน้าจริง — รายการย้อนหลังที่เลขต่ำกว่า
  -- ต้องไม่รีเซ็ตนาฬิกาประมาณการ (Postgres ประเมิน SET ทุกช่องจากค่าเดิมของแถว)
  update public.vehicles
     set current_mileage    = greatest(current_mileage, p_odometer),
         mileage_updated_at = case when p_odometer > current_mileage then now()
                                   else mileage_updated_at end
   where id = p_vehicle_id;

  return v_event;
end $$;

-- ถอดยาง: คำนวณระยะวิ่งรอบนี้ + สะสมเข้า total_distance_km
create or replace function public.unmount_tire(
  p_tire_id    uuid,
  p_odometer   integer,
  p_tread_mm   numeric default null,
  p_reason_id  uuid default null,
  p_note       text default null,
  p_event_date date default current_date
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  t         public.tires%rowtype;
  v_dist    integer;
  v_scrap   boolean := false;
  v_event   uuid;
begin
  select * into t from public.tires where id = p_tire_id for update;
  if not found then
    raise exception 'ไม่พบยางที่ระบุ' using errcode = 'P0002';
  end if;
  if t.status <> 'mounted' then
    raise exception 'ยางเส้นนี้ไม่ได้ติดตั้งอยู่กับรถ' using errcode = 'P0001';
  end if;
  if p_odometer < coalesce(t.mounted_odometer, 0) then
    raise exception 'เลขไมล์ต้องไม่น้อยกว่าเลขไมล์ตอนใส่ยาง (%)', t.mounted_odometer
      using errcode = 'P0001';
  end if;

  -- ระยะรอบนี้คำนวณจากเลขไมล์ที่ช่างคีย์เท่านั้น ห้ามมีค่าประมาณปนเข้ามา
  v_dist := p_odometer - coalesce(t.mounted_odometer, p_odometer);

  if p_reason_id is not null then
    select is_scrap into v_scrap from public.removal_reasons where id = p_reason_id;
  end if;

  insert into public.tire_events
    (company_id, tire_id, vehicle_id, event_type, position_code,
     odometer, tread_mm, distance_km, reason_id, note, event_date, created_by)
  values
    (t.company_id, p_tire_id, t.vehicle_id, 'unmount', t.position_code,
     p_odometer, p_tread_mm, v_dist, p_reason_id, p_note, p_event_date, auth.uid())
  returning id into v_event;

  update public.tires set
    status            = case when coalesce(v_scrap, false) then 'scrapped'::tire_status
                             else 'in_stock'::tire_status end,
    vehicle_id        = null,
    position_code     = null,
    mounted_odometer  = null,
    mounted_at        = null,
    total_distance_km = total_distance_km + v_dist,
    tread_mm          = coalesce(p_tread_mm, tread_mm)
  where id = p_tire_id;

  update public.vehicles
     set current_mileage    = greatest(current_mileage, p_odometer),
         mileage_updated_at = case when p_odometer > current_mileage then now()
                                   else mileage_updated_at end
   where id = t.vehicle_id;

  return v_event;
end $$;

-- ============================================================
-- VIEW : ยางพร้อมระยะวิ่ง + ค่าประมาณ + สถานะแจ้งเตือน
--
-- !! ห้ามสลับลำดับหรือเปลี่ยนชนิดของคอลัมน์เดิม !!
-- create or replace view อนุญาตให้ "ต่อท้าย" คอลัมน์ใหม่เท่านั้น
-- ถ้าจัดเรียงคอลัมน์เดิมใหม่จะ fail ด้วย cannot change name of view column
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
  -- ระยะสะสมตลอดอายุยางแบบรวมค่าประมาณ — ตัวเลขที่ใช้ตัดสินเกณฑ์ alert_lifetime_km
  r.total_distance_km + r.estimated_run_km as estimated_lifetime_km,
  -- ตัวเลขนี้มีค่าประมาณปนอยู่หรือไม่ — UI ต้องติดป้าย "ประมาณการ" เมื่อเป็น true
  r.estimated_extra_km > 0 as is_estimated,
  -- ชนเพดานแล้ว = เลขไมล์เก่าเกินกว่าจะประมาณต่อ ต้องให้คนไปยืนยัน
  coalesce(r.days_since_mileage >= r.estimate_max_days, false) as is_mileage_stale,
  r.alert_lifetime_km,
  -- อีกกี่วันถึงเกณฑ์ระยะสะสม (0 = ถึงแล้ว, null = ไม่มีเกณฑ์/ไม่มีค่าเฉลี่ย/ยางถูกตัดจำหน่าย)
  case
    when r.alert_lifetime_km is null then null
    when r.status = 'scrapped' then null
    when r.total_distance_km + r.estimated_run_km >= r.alert_lifetime_km then 0
    when r.status <> 'mounted' then null
    when coalesce(r.avg_km_per_month, 0) <= 0 then null
    else ceil((r.alert_lifetime_km - (r.total_distance_km + r.estimated_run_km))::numeric
              / (r.avg_km_per_month::numeric / 30.44))::integer
  end as days_to_lifetime_alert
from run r;

comment on view public.tire_overview is
  'ยางพร้อมระยะวิ่งที่วัดจริงและค่าประมาณ — คอลัมน์ estimated_* เป็นค่าคำนวณสด '
  'ไม่เคยถูกเขียนลงตาราง เพื่อไม่ให้ค่าเดาปนเข้า tire_events.distance_km';

-- ------------------------------------------------------------
-- VIEW : ค่าเฉลี่ยที่สังเกตได้จริงจากประวัติถอด-ใส่ยาง 180 วันล่าสุด
-- ใช้เป็น hint ใต้ช่องกรอกในฟอร์มรถ ไม่ได้นำไปใช้อัตโนมัติ
-- ------------------------------------------------------------
create or replace view public.vehicle_observed_monthly_km
with (security_invoker = true) as
select
  v.id         as vehicle_id,
  v.company_id,
  round((max(e.odometer) - min(e.odometer))::numeric
        / nullif(max(e.event_date) - min(e.event_date), 0) * 30.44)::integer as observed_km_per_month,
  count(*)::integer as sample_events,
  min(e.event_date) as first_date,
  max(e.event_date) as last_date
from public.vehicles v
join public.tire_events e
  on e.vehicle_id = v.id
 and e.event_date >= current_date - 180
group by v.id, v.company_id
-- ต้องมีอย่างน้อย 2 รายการและห่างกัน 30 วัน ไม่งั้นตัวเลขเป็นสัญญาณรบกวน
having count(*) >= 2
   and (max(e.event_date) - min(e.event_date)) >= 30;

comment on view public.vehicle_observed_monthly_km is
  'ค่าเฉลี่ย กม./เดือน ที่คำนวณจากเลขไมล์ในประวัติถอด-ใส่ยาง — ใช้แนะนำค่าตอนกรอกฟอร์มรถ';

-- ประมาณการอ่าน tire_events ตาม vehicle + ช่วงวันที่
create index if not exists tire_events_vehicle_date_idx
  on public.tire_events (vehicle_id, event_date);
