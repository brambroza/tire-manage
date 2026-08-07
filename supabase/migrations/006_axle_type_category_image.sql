-- ============================================================
-- ประเภทเพลา: แยกหมวด "หัว / หาง" และเก็บรูปผังล้อไว้ให้ช่างดูหน้างาน
-- ============================================================

alter table public.axle_types
  add column if not exists category text not null default 'head',
  add column if not exists image_url text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'axle_types_category_valid'
      and conrelid = 'public.axle_types'::regclass
  ) then
    alter table public.axle_types
      add constraint axle_types_category_valid check (category in ('head', 'trailer'));
  end if;
end $$;

-- หมวดของชุดข้อมูลตั้งต้น
update public.axle_types set category = 'trailer' where code like 'TRAILER%';
update public.axle_types set category = 'head'    where code not like 'TRAILER%';

-- รูปผังล้อตั้งต้น (ไฟล์อยู่ใน public/assets/images)
update public.axle_types set image_url = '/assets/images/6w.jpg'  where code = '6W'  and image_url is null;
update public.axle_types set image_url = '/assets/images/10w.jpg' where code = '10W' and image_url is null;

comment on column public.axle_types.category is 'หมวดของประเภทเพลา: head = รถหัวลาก/รถบรรทุก, trailer = หางพ่วง';
comment on column public.axle_types.image_url is 'รูปผังล้อที่ช่างใช้อ้างอิงตอนเลือกตำแหน่งล้อ';
