-- ============================================================
-- MIGRATION 001 — บันทึกงานยางหลายรายการในครั้งเดียว (atomic)
-- ============================================================
-- ให้ช่างถอด/ใส่/สลับยางหลายเส้นในรอบเดียวแล้วกดบันทึกทีเดียว
-- ทุก op ทำงานในทรานแซกชันเดียวกัน — ถ้ามีรายการใดพลาด ระบบจะ rollback ทั้งชุด
-- ทำให้ไม่มีสภาพ "ถอดไปครึ่งหนึ่งแล้วค้าง"
--
-- รันไฟล์นี้ใน Supabase SQL Editor (หลัง schema.sql)
-- ============================================================

/**
 * ประมวลผลรายการถอด/ใส่ยางตามลำดับที่ส่งมา
 *
 * @param p_vehicle_id รถที่ทำรายการ
 * @param p_event_date วันที่ทำรายการ
 * @param p_ops        อาร์เรย์ของ op ตามลำดับที่ต้องการให้ทำงาน
 *                     [{ "op": "unmount", "tire_id": "...", "odometer": 120000,
 *                        "tread_mm": 6.5, "reason_id": "...", "note": "" },
 *                      { "op": "mount", "tire_id": "...", "position_code": "A2LO",
 *                        "odometer": 120000, "tread_mm": 16, "note": "" }]
 * @returns จำนวน op ที่บันทึกสำเร็จ
 */
create or replace function public.apply_tire_ops(
  p_vehicle_id uuid,
  p_event_date date,
  p_ops        jsonb
) returns integer
language plpgsql security invoker set search_path = public as $$
declare
  op    jsonb;
  n     integer := 0;
  kind  text;
begin
  if jsonb_typeof(p_ops) is distinct from 'array' or jsonb_array_length(p_ops) = 0 then
    raise exception 'ไม่มีรายการที่จะบันทึก' using errcode = 'P0001';
  end if;

  if jsonb_array_length(p_ops) > 60 then
    raise exception 'บันทึกได้สูงสุด 60 รายการต่อครั้ง' using errcode = 'P0001';
  end if;

  for op in select * from jsonb_array_elements(p_ops) loop
    kind := op->>'op';

    if kind = 'unmount' then
      perform public.unmount_tire(
        (op->>'tire_id')::uuid,
        (op->>'odometer')::integer,
        nullif(op->>'tread_mm', '')::numeric,
        nullif(op->>'reason_id', '')::uuid,
        nullif(op->>'note', ''),
        p_event_date
      );

    elsif kind = 'mount' then
      perform public.mount_tire(
        (op->>'tire_id')::uuid,
        p_vehicle_id,
        op->>'position_code',
        (op->>'odometer')::integer,
        nullif(op->>'tread_mm', '')::numeric,
        nullif(op->>'note', ''),
        p_event_date
      );

    else
      raise exception 'ประเภทรายการไม่ถูกต้อง: %', coalesce(kind, 'null') using errcode = 'P0001';
    end if;

    n := n + 1;
  end loop;

  return n;
end $$;

comment on function public.apply_tire_ops(uuid, date, jsonb) is
  'บันทึกงานถอด/ใส่ยางหลายรายการของรถคันเดียวในทรานแซกชันเดียว (all-or-nothing)';
