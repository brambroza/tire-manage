-- ============================================================
-- รหัสบริษัทรันอัตโนมัติ: C0001, C0002, ...
-- ============================================================

create sequence if not exists public.company_code_seq
  start with 1 increment by 1;

-- ตั้ง sequence ต่อจากรหัส Cxxxx ที่มีอยู่ โดยไม่ลดค่าถ้า sequence เคยถูกใช้แล้ว
do $$
declare
  v_code_max bigint;
  v_last     bigint;
  v_called   boolean;
begin
  select max(substring(code from 2)::bigint)
    into v_code_max
    from public.companies
   where code ~ '^C[0-9]+$';

  select last_value, is_called
    into v_last, v_called
    from public.company_code_seq;

  if v_code_max is null and not v_called then
    perform setval('public.company_code_seq', v_last, false);
  else
    perform setval(
      'public.company_code_seq',
      greatest(coalesce(v_code_max, 0), v_last),
      true
    );
  end if;
end $$;

alter table public.companies
  alter column code set default (
    'C' || lpad(nextval('public.company_code_seq')::text, 4, '0')
  );

grant usage, select on sequence public.company_code_seq to authenticated;

comment on sequence public.company_code_seq is
  'เลขรันสำหรับรหัสบริษัทในรูป C0001, C0002, ...';
