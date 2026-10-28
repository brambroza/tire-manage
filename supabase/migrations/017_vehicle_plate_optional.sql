-- Apply after 016. A vehicle must carry a nickname or a plate (or both).
-- Province belongs to the plate: both present or both NULL.
-- Existing rows all have a plate, so no backfill is needed.
begin;

alter table public.vehicles alter column plate_no drop not null;
alter table public.vehicles alter column province drop not null;

alter table public.vehicles drop constraint if exists vehicles_identity_check;
alter table public.vehicles add constraint vehicles_identity_check check (
  (plate_no is null or btrim(plate_no) <> '')
  and (nickname is null or btrim(nickname) <> '')
  and (plate_no is not null or nickname is not null)
  and ((plate_no is null) = (province is null))
);
comment on constraint vehicles_identity_check on public.vehicles is
  'ต้องมีทะเบียนหรือชื่อเรียกอย่างน้อยหนึ่งอย่าง และจังหวัดมาคู่กับทะเบียนเท่านั้น';

-- Vehicles without a plate have nothing else to tell them apart, so their names must be unique per company.
create unique index if not exists vehicles_nickname_only_unique
  on public.vehicles (company_id, lower(btrim(nickname)))
  where plate_no is null;

commit;
