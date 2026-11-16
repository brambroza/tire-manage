-- ============================================================
-- ช่างส่วนกลาง (ทีม Dreammaker) — ใช้เมนู "บันทึกถอด-ใส่ยาง" ได้ทุกลูกค้า (รันซ้ำได้)
--
-- แนวคิด: ยังเป็น role = 'technician' แต่มี profiles.all_companies = true
--   - profiles.company_id = "บริษัทที่กำลังเลือกทำงานอยู่" (null = ยังไม่ได้เลือก)
--   - ช่างสลับบริษัทผ่าน server action (service role) จึงไม่ต้องแก้ RLS ของตารางอื่นเลย
--     current_company_id() จะคืนบริษัทที่เลือก ทุก policy/ฟังก์ชันเดิมทำงานเหมือนช่างของบริษัทนั้น
--   - ตั้ง/ยกเลิก all_companies ได้เฉพาะ super admin (หรือ service role)
-- ============================================================
begin;

alter table public.profiles add column if not exists all_companies boolean not null default false;
comment on column public.profiles.all_companies is
  'true = ช่างส่วนกลางที่เข้าได้ทุกบริษัท; company_id คือบริษัทที่เลือกอยู่ตอนนี้ (null = ยังไม่เลือก)';

-- เดิมบังคับ non-super ต้องมี company_id — ช่างส่วนกลางยังไม่เลือกบริษัทได้ (company_id = null)
alter table public.profiles drop constraint if exists profiles_company_required;
alter table public.profiles add constraint profiles_company_required check (
  (not all_companies and (
       (role = 'super_admin' and company_id is null)
    or (role <> 'super_admin' and company_id is not null)))
  or (all_companies and role = 'technician')
);

-- กัน: แอดมินบริษัท / ช่างเอง เปลี่ยนสถานะ all_companies หรือย้ายบริษัท/เปลี่ยนสิทธิ์ของช่างส่วนกลาง
-- auth.uid() เป็น null = service role (server action ที่ตรวจสิทธิ์มาแล้ว) จึงผ่านได้
create or replace function public.guard_global_technician()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.all_companies then
      raise exception 'เฉพาะผู้ดูแลระบบ (Dreammaker) เท่านั้นที่สร้างช่างส่วนกลางได้' using errcode = '42501';
    end if;
  elsif new.all_companies is distinct from old.all_companies
     or (old.all_companies and (new.company_id is distinct from old.company_id
                                or new.role is distinct from old.role)) then
    raise exception 'เฉพาะผู้ดูแลระบบ (Dreammaker) เท่านั้นที่แก้สิทธิ์ช่างส่วนกลางได้' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists trg_guard_global_technician on public.profiles;
create trigger trg_guard_global_technician
  before insert or update on public.profiles
  for each row execute function public.guard_global_technician();

-- แอดมินบริษัทจัดการบัญชีช่างส่วนกลางไม่ได้ (ยังเห็นชื่อได้ตาม profiles_select)
drop policy if exists profiles_admin_write on public.profiles;
create policy profiles_admin_write on public.profiles for all to authenticated
  using (is_company_admin() and company_id = current_company_id()
         and role <> 'super_admin' and not all_companies)
  with check (is_company_admin() and company_id = current_company_id()
         and role <> 'super_admin' and not all_companies);

commit;
