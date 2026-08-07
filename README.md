# Dream Tire — ระบบจัดการยางรถบรรทุก

ระบบบันทึกการถอด-ใส่ยางรายเส้น ติดตามระยะใช้งาน และแจ้งเตือนเมื่อถึงเกณฑ์
UI แบบ modern minimal โทนฟ้าอ่อน เน้นการใช้งานบน **iPad** สำหรับช่างหน้างาน
ส่วน **Super Admin (Dreammaker)** ออกแบบสำหรับเดสก์ท็อป

## Tech stack

| ส่วน | เทคโนโลยี |
| --- | --- |
| Frontend / Backend | Next.js 16 (App Router) + TypeScript |
| UI | Tailwind CSS v4, lucide-react, recharts |
| Database / Auth | Supabase (PostgreSQL + Row Level Security) |
| Validation | zod |

## โครงสร้าง role

| Role | ใช้ที่ | สิทธิ์ |
| --- | --- | --- |
| `super_admin` (Dreammaker) | Desktop | CRUD ลูกค้า, ข้อมูลยางกลาง, ประเภทเพลา, สาเหตุการถอด, กำหนดว่าลูกค้าแต่ละรายเห็นยางรุ่นใด, ดูการใช้งานยางของลูกค้าทุกราย |
| `admin` (แอดมินบริษัทลูกค้า) | iPad / Desktop | CRUD รถ, คลังยาง, จัดการช่างในบริษัท, แก้ข้อมูลบริษัทและเกณฑ์แจ้งเตือน, dashboard |
| `technician` (ช่าง) | iPad | บันทึกถอด / ใส่ / สลับตำแหน่งยาง, ค้นหารถและยาง |

## ติดตั้ง

```bash
npm install
cp .env.example .env.local   # ใส่ค่าจริงจาก Supabase Dashboard > Project Settings > API
npm run dev
```

ตัวแปรที่ต้องตั้ง:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=     # ใช้เฉพาะฝั่ง server ตอนสร้างบัญชีผู้ใช้ให้ลูกค้า/ช่าง
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` ห้าม commit และห้ามใช้ฝั่ง client เด็ดขาด

## ตั้งค่าฐานข้อมูล

1. เปิด Supabase Dashboard → SQL Editor
2. รัน [`supabase/schema.sql`](supabase/schema.sql) — สร้างตาราง, view, RPC, RLS policy และ storage bucket ทั้งหมด
3. รัน [`supabase/seed.sql`](supabase/seed.sql) — ใส่สาเหตุการถอดยางและข้อมูลยางตัวอย่าง

> **โปรเจกต์ที่ติดตั้งไปก่อนหน้านี้** ให้รันไฟล์ใน [`supabase/migrations/`](supabase/migrations) ตามลำดับแทน:
> `001_apply_tire_ops.sql` (บันทึกงานยางหลายรายการพร้อมกัน), `002_tire_images.sql` (รูปยางในแคตตาล็อก)
> `003_tire_model_new_tread.sql` (ดอกยางตอนใหม่ของแต่ละรุ่น) และ
> `004_axle_types.sql` (ประเภทเพลาแบบ CRUD), `005_company_code_auto_run.sql` (เลขรันรหัสบริษัท)
> — ถ้ายังไม่รัน ปุ่ม “บันทึกทั้งหมด” ในหน้าช่างและการอัปโหลดรูปจะยังใช้ไม่ได้
4. สร้าง user แรกที่ Authentication → Add user แล้วผูก profile:

```sql
insert into public.profiles (id, company_id, role, full_name)
values ('<UUID จาก auth.users>', null, 'super_admin', 'Dreammaker Admin');
```

จากนั้น login แล้วสร้างบริษัทลูกค้าและบัญชีแอดมิน/ช่างจากหน้า Super Admin ได้เลย

## โมเดลข้อมูลหลัก

```
companies ──┬── profiles            (ผู้ใช้ + role)
            ├── vehicles            (รถ: ทะเบียน จังหวัด ยี่ห้อ/รุ่น ประเภทเพลา เลขไมล์)
            ├── tires               (ยางรายเส้น: เลขยาง สถานะ ตำแหน่ง ระยะสะสม ดอกยาง)
            ├── tire_events         (ledger การถอด-ใส่ พร้อมระยะวิ่งต่อรอบ)
            └── company_tire_models (รุ่นยางที่ super admin อนุญาตให้เห็น)

tire_brands ── tire_models          (แคตตาล็อกกลาง: ยี่ห้อ รุ่น ขนาด รหัสดอกยาง ดอกยางตอนใหม่)
removal_reasons                     (สาเหตุการถอด — super admin config ได้)
axle_types ── vehicles              (ประเภทเพลา + รูปแบบล้อ — super admin config ได้)
```

### การคำนวณระยะใช้งานยาง

- ตอน **ใส่ยาง** ระบบเก็บ `mounted_odometer` = เลขไมล์รถ ณ ตอนนั้น
- ระหว่างใช้งาน: `ระยะรอบนี้ = เลขไมล์รถปัจจุบัน − mounted_odometer`
- ตอน **ถอดยาง** ระบบบวกระยะรอบนี้เข้า `total_distance_km` ของยางเส้นนั้น
- view `tire_overview` รวมสองส่วนเป็น `lifetime_km` ให้พร้อมใช้

ทั้งหมดทำผ่าน RPC `mount_tire()` / `unmount_tire()` ซึ่ง lock แถวยางระหว่างทำรายการ
กันกรณีช่างสองคนบันทึกพร้อมกัน และมี unique index กันไม่ให้ตำแหน่งล้อเดียวมียางซ้อนกัน

### เกณฑ์แจ้งเตือน

ตั้งค่าได้รายบริษัทที่หน้า "ข้อมูลบริษัท" (`companies.alert_km` ค่าเริ่มต้น 10,000 กม.
และ `companies.alert_tread_mm` ค่าเริ่มต้น 3.0 มม.) ยางที่ถึงเกณฑ์จะขึ้นสีเหลืองทั้งในตาราง
และบนแผนผังล้อ

## รูปยางในแคตตาล็อก

Super admin อัปโหลดรูปให้รุ่นยางได้ที่เมนู **ข้อมูลยาง** (JPG/PNG/WebP/AVIF ไม่เกิน 3 MB)
รูปเก็บใน Supabase Storage bucket `tire-images` (public read) และอัปโหลดผ่าน server action
ที่ใช้ service role จึงไม่ต้องเปิดสิทธิ์เขียน storage ให้ผู้ใช้ทั่วไป

รูปที่ใส่ไว้จะไปแสดงอัตโนมัติในทุกจุดที่อ้างถึงยางรุ่นนั้น: หน้าช่างตอนเลือกยางจากคลังและในตะกร้ารายการ,
ตารางคลังยาง, แดชบอร์ด (ตารางแจ้งเตือนและระยะสะสมสูงสุด) และหน้ารายละเอียดยาง

## ผังตำแหน่งล้อ

รหัสตำแหน่งอยู่ในรูป `A{เพลา}{ด้าน}{นอก/ใน}` เช่น `A1L` = เพลา 1 ซ้าย, `A3RO` = เพลา 3 ขวานอก
ประเภทเพลาและลำดับเพลาเดี่ยว/คู่เก็บในตาราง `axle_types` และจัดการได้จากเมนู
**ประเภทเพลา** ของ Super Admin ส่วน [`src/lib/axle-layouts.ts`](src/lib/axle-layouts.ts)
ทำหน้าที่แปลงข้อมูลนั้นเป็นตำแหน่งล้อสำหรับฟอร์มรถและแผนผังหน้างาน

## โครงสร้างโค้ด

```
src/
├── app/
│   ├── login/                 หน้าเข้าสู่ระบบ
│   ├── (app)/                 ฝั่งลูกค้า (admin + ช่าง)
│   │   ├── dashboard/         ภาพรวม + แจ้งเตือน + ยางที่ถอดออก
│   │   ├── vehicles/          CRUD รถ + หน้ารายละเอียดพร้อมผังล้อ
│   │   ├── tires/             คลังยาง + ประวัติรายเส้น
│   │   ├── service/           ขั้นตอนบันทึกถอด-ใส่ยาง (หน้าหลักของช่าง)
│   │   ├── technicians/       จัดการบัญชีช่างในบริษัท
│   │   └── company/           แก้ข้อมูลบริษัท + เกณฑ์แจ้งเตือน
│   └── (super)/superadmin/    ฝั่ง Dreammaker
├── components/                UI primitives, AppShell, ผังล้อ, กราฟ
└── lib/                       supabase clients, auth, types, utils
```

## คำสั่งที่ใช้บ่อย

> สคริปต์ใน `scripts/` ต้องใช้ Node 22 ขึ้นไป (supabase-js ต้องการ native WebSocket)

```bash
npm run dev      # dev server
npm run build    # production build
npm run lint     # eslint
npx tsc --noEmit # typecheck
```

## หมายเหตุด้านความปลอดภัย

- ทุกตารางเปิด RLS และแยกข้อมูลตาม `company_id` — ลูกค้าเห็นเฉพาะข้อมูลตัวเอง
- ทุก server action ตรวจ role ซ้ำด้วย `requireSession([...])` ไม่พึ่ง UI อย่างเดียว
- input ทุกช่องผ่าน zod ก่อนลง DB และใช้ query builder ของ Supabase (parameterized) ตลอด
