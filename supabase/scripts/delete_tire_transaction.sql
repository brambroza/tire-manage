-- ============================================================
-- delete_tire_transaction.sql
-- ลบรายการถอด/ใส่ยางที่ช่างคีย์ผิด พร้อม rollback สถานะยางและรถกลับ
--
-- ไฟล์นี้เป็น "admin script" ไม่ใช่ migration ของ feature ปกติ
-- ให้รันใน Supabase SQL Editor ด้วย service role หรือ psql เท่านั้น
--
-- ขั้นตอนการใช้งาน
--   1) รัน section A เพื่อติดตั้ง function (ครั้งเดียว)
--   2) รัน section B เพื่อ "ดูก่อน" ว่าจะลบ event ไหนบ้าง
--   3) รัน section C เพื่อลบจริง (อยู่ใน transaction — ตรวจผลก่อน commit)
-- ============================================================


-- ============================================================
-- SECTION A — ติดตั้ง function
-- ============================================================

/**
 * ลบ tire_events ที่ระบุ แล้วย้อนสถานะยาง/รถกลับสู่ค่าก่อนหน้า
 *
 * การย้อนกลับทำจาก event ใหม่สุดไปเก่าสุด เพื่อให้ ledger สอดคล้องกัน:
 *   - undo 'mount'   : ยางกลับเป็น in_stock ปลดออกจากตำแหน่งล้อ
 *   - undo 'unmount' : ยางกลับไปติดตั้งที่ตำแหน่งเดิม และหักระยะวิ่งรอบนั้นออก
 *
 * @param p_event_ids     รายการ id ของ tire_events ที่ต้องการลบ
 * @param p_delete_orphan ลบยางที่ถูกสร้างจากรายการนี้และไม่มี event เหลืออยู่ด้วยหรือไม่
 * @returns               จำนวน event ที่ถูกลบ
 */
create or replace function public.delete_tire_events(
  p_event_ids     uuid[],
  p_delete_orphan boolean default false
) returns integer
language plpgsql
security invoker
set search_path = public as $$
declare
  e            public.tire_events%rowtype;
  v_deleted    integer := 0;
  v_tire_ids   uuid[]  := '{}';
  v_vehicle_ids uuid[] := '{}';
  v_tire       uuid;
  v_vehicle    uuid;
  v_prev_mount timestamptz;
begin
  if not (public.is_super_admin() or public.is_company_admin()) then
    raise exception 'ต้องเป็น admin หรือ super_admin เท่านั้น' using errcode = '42501';
  end if;

  if p_event_ids is null or array_length(p_event_ids, 1) is null then
    return 0;
  end if;

  -- ล็อกยางทุกเส้นที่เกี่ยวข้องก่อน กัน race กับ mount_tire/unmount_tire
  perform 1
     from public.tires
    where id in (select distinct tire_id from public.tire_events where id = any(p_event_ids))
    order by id
      for update;

  for e in
    select *
      from public.tire_events
     where id = any(p_event_ids)
     order by created_at desc, id desc
  loop
    if not (e.tire_id = any(v_tire_ids)) then
      v_tire_ids := v_tire_ids || e.tire_id;
    end if;
    if e.vehicle_id is not null and not (e.vehicle_id = any(v_vehicle_ids)) then
      v_vehicle_ids := v_vehicle_ids || e.vehicle_id;
    end if;

    if e.event_type = 'mount' then
      -- ย้อน mount: ปลดยางออกจากตำแหน่ง
      update public.tires set
        status           = 'in_stock',
        vehicle_id       = null,
        position_code    = null,
        mounted_odometer = null,
        mounted_at       = null
      where id = e.tire_id;

    elsif e.event_type = 'unmount' then
      -- หา mount ครั้งล่าสุดก่อน event นี้ เพื่อคืนค่า mounted_at ให้ใกล้ของเดิม
      select created_at into v_prev_mount
        from public.tire_events
       where tire_id = e.tire_id
         and event_type = 'mount'
         and created_at < e.created_at
         and not (id = any(p_event_ids))
       order by created_at desc
       limit 1;

      -- ย้อน unmount: ยางกลับไปติดตั้งที่ตำแหน่งเดิม + หักระยะวิ่งรอบนั้นออก
      update public.tires set
        status            = 'mounted',
        vehicle_id        = e.vehicle_id,
        position_code     = e.position_code,
        mounted_odometer  = e.odometer - coalesce(e.distance_km, 0),
        mounted_at        = coalesce(v_prev_mount, now()),
        total_distance_km = greatest(0, total_distance_km - coalesce(e.distance_km, 0))
      where id = e.tire_id;
    end if;

    delete from public.tire_events where id = e.id;
    v_deleted := v_deleted + 1;
  end loop;

  -- คืนค่า tread_mm ตาม event ล่าสุดที่ยังเหลืออยู่ของยางแต่ละเส้น
  foreach v_tire in array v_tire_ids loop
    update public.tires t set
      tread_mm = (
        select ev.tread_mm
          from public.tire_events ev
         where ev.tire_id = t.id
           and ev.tread_mm is not null
         order by ev.created_at desc
         limit 1
      )
    where t.id = v_tire;
  end loop;

  -- คำนวณเลขไมล์รถใหม่จาก event ที่ยังเหลือ (ไม่ลดต่ำกว่าเลขไมล์ของ event อื่น)
  foreach v_vehicle in array v_vehicle_ids loop
    update public.vehicles v set
      current_mileage = coalesce((
        select max(ev.odometer)
          from public.tire_events ev
         where ev.vehicle_id = v.id
      ), 0)
    where v.id = v_vehicle;
  end loop;

  -- ยางที่ช่างคีย์เองแล้วไม่เหลือ event เลย = ข้อมูลขยะ ลบทิ้งได้ถ้าสั่ง
  if p_delete_orphan then
    delete from public.tires t
     where t.id = any(v_tire_ids)
       and not exists (select 1 from public.tire_events ev where ev.tire_id = t.id);
  end if;

  return v_deleted;
end $$;

comment on function public.delete_tire_events(uuid[], boolean) is
  'Admin only — ลบ tire_events และ rollback สถานะยาง/รถ ใช้แก้รายการที่ช่างคีย์ผิด';


-- ============================================================
-- SECTION B — ดูรายการก่อนลบ (ไม่แก้ข้อมูล)
-- แก้ค่าใน where ให้ตรงเคสก่อนรัน
-- ============================================================

select ev.id,
       ev.event_date,
       ev.created_at,
       ev.event_type,
       ev.position_code,
       ev.odometer,
       ev.distance_km,
       t.serial_no,
       v.plate_no,
       p.full_name as keyed_by
  from public.tire_events ev
  join public.tires t on t.id = ev.tire_id
  left join public.vehicles v on v.id = ev.vehicle_id
  left join public.profiles p on p.id = ev.created_by
 where ev.company_id = '00000000-0000-0000-0000-000000000000'  -- << company_id
   and ev.event_date = current_date                            -- << วันที่ทำรายการ
   -- and v.plate_no = 'กก-1234'                               -- << เจาะจงทะเบียนรถ
   -- and ev.created_by = '00000000-0000-0000-0000-000000000000' -- << เจาะจงช่าง
 order by ev.created_at desc;


-- ============================================================
-- SECTION C — ลบจริง
-- รันทีละ statement: ตรวจผลลัพธ์ก่อนแล้วค่อย commit
-- ============================================================

begin;

select public.delete_tire_events(
  array[
    '00000000-0000-0000-0000-000000000000'::uuid   -- << ใส่ event id จาก section B
  ],
  false   -- true = ลบยางที่ช่างคีย์เองซึ่งไม่เหลือ event ด้วย
);

-- ตรวจสถานะยางหลัง rollback ก่อนตัดสินใจ
-- select id, serial_no, status, vehicle_id, position_code, mounted_odometer, total_distance_km
--   from public.tires where serial_no in ('...');

-- commit;    -- ถูกต้องแล้วค่อยเปิดบรรทัดนี้
rollback;     -- default ปลอดภัยไว้ก่อน
