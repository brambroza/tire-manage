-- ============================================================
-- ซีรีย์ยางไม่สนตัวพิมพ์เล็ก/ใหญ่
--
-- ฝั่งแอปแปลงซีรีย์เป็นตัวพิมพ์ใหญ่ก่อนบันทึกแล้ว (ตั้งแต่ commit "validate plate, odometer and serial inputs")
-- migration นี้ทำให้ข้อมูลเดิมและ constraint ในฐานข้อมูลสอดคล้องกัน:
--   1) ตรวจว่ามีซีรีย์ที่ต่างกันแค่ตัวพิมพ์ในบริษัทเดียวกันหรือไม่ — ถ้ามี หยุดและรายงานให้แก้ก่อน
--   2) แปลงซีรีย์เดิมทั้งหมดเป็นตัวพิมพ์ใหญ่ + ตัดช่องว่างหัวท้าย
--   3) เปลี่ยน unique (company_id, serial_no) เป็น unique บน upper(serial_no)
--
-- ** ต้อง run บน staging ก่อน และสำรองข้อมูลตาราง tires ก่อนเสมอ **
-- ============================================================

-- 1) ตรวจซ้ำต่างเคส — ถ้ามีแถวใดชน จะ raise และไม่ทำขั้นถัดไป
do $$
declare
  v_dupes text;
begin
  select string_agg(format('%s: %s (%s เส้น)', company_id, serial_upper, cnt), E'\n')
    into v_dupes
  from (
    select company_id, upper(trim(serial_no)) as serial_upper, count(*) as cnt
    from public.tires
    group by company_id, upper(trim(serial_no))
    having count(*) > 1
  ) d;

  if v_dupes is not null then
    raise exception E'พบซีรีย์ยางที่ต่างกันเฉพาะตัวพิมพ์เล็ก/ใหญ่ในบริษัทเดียวกัน — รวม/แก้ก่อน run migration นี้:\n%', v_dupes;
  end if;
end $$;

-- 2) แปลงข้อมูลเดิมให้เป็นรูปแบบเดียวกับที่แอปบันทึกตอนนี้
update public.tires
set serial_no = upper(trim(serial_no))
where serial_no <> upper(trim(serial_no));

-- 3) unique แบบไม่สนตัวพิมพ์ (แทน unique เดิม)
alter table public.tires drop constraint if exists tires_company_id_serial_no_key;

create unique index if not exists tires_company_serial_upper_key
  on public.tires (company_id, upper(serial_no));

comment on index public.tires_company_serial_upper_key is
  'ซีรีย์ยางห้ามซ้ำในบริษัทเดียวกันโดยไม่สนตัวพิมพ์เล็ก/ใหญ่';
