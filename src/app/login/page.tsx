import { Suspense } from 'react'
import { LoginForm } from './login-form'
import { LoginScene, TireMark } from './login-motion'

export const metadata = { title: 'เข้าสู่ระบบ · Dream Tire' }

const HIGHLIGHTS = [
  'เลือกตำแหน่งล้อจากแผนผังรถได้ทันที',
  'รู้ทุกเส้นว่าอยู่รถคันไหน หรืออยู่ในคลัง',
  'สรุประยะวิ่งสะสมและต้นทุนต่อกิโลเมตร',
]

export default function LoginPage() {
  return (
    <LoginScene>
      <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
        {/* ฝั่งซ้าย: brand panel (ซ่อนบนจอแคบ) */}
        <aside className="relative hidden overflow-hidden bg-ink-900 lg:flex lg:flex-col lg:justify-between lg:p-14">
          <div
            data-float
            className="pointer-events-none absolute -left-24 -top-32 size-[34rem] rounded-full opacity-60 blur-3xl"
            style={{ background: 'radial-gradient(circle, var(--color-brand-700), transparent 65%)' }}
          />
          <div
            data-float
            className="pointer-events-none absolute -bottom-40 -right-20 size-[32rem] rounded-full opacity-50 blur-3xl"
            style={{ background: 'radial-gradient(circle, var(--color-brand-500), transparent 65%)' }}
          />
          <TireMark className="pointer-events-none absolute -right-32 top-1/2 size-[36rem] -translate-y-1/2 text-white/[0.06]" />

          <div className="relative">
            <div
              data-anim
              className="flex size-11 items-center justify-center rounded-2xl bg-white/10 text-lg font-semibold text-white ring-1 ring-inset ring-white/15 backdrop-blur"
            >
              D
            </div>
            <h2 data-anim className="mt-10 text-4xl font-semibold leading-[1.2] tracking-tight text-white">
              ระบบจัดการยาง
              <br />
              รถบรรทุก
            </h2>
            <p data-anim className="mt-5 max-w-sm text-[15px] leading-relaxed text-brand-200/80">
              บันทึกการถอด-ใส่ยางหน้างานด้วย iPad ติดตามระยะใช้งานยางรายเส้น
              และแจ้งเตือนอัตโนมัติเมื่อถึงเกณฑ์ที่กำหนด
            </p>
          </div>

          <ul className="relative space-y-4 text-[15px] text-white/70">
            {HIGHLIGHTS.map((t) => (
              <li key={t} data-anim className="flex items-center gap-3">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-brand-300 ring-1 ring-inset ring-white/15">
                  <svg viewBox="0 0 20 20" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                {t}
              </li>
            ))}
          </ul>

          <p data-anim className="relative text-sm text-white/35">
            © Dreammaker · Dream Tire Management
          </p>
        </aside>

        {/* ฝั่งขวา: ฟอร์ม */}
        <main className="flex items-center justify-center px-6 py-14 lg:bg-surface">
          <div className="w-full max-w-[22rem]">
            <div data-anim className="mb-9 flex size-11 items-center justify-center rounded-2xl bg-brand-600 text-lg font-semibold text-white shadow-[0_10px_24px_-12px_rgba(13,110,224,0.9)] lg:hidden">
              D
            </div>
            <h1 data-anim className="text-[26px] font-semibold tracking-tight text-ink-900">
              เข้าสู่ระบบ
            </h1>
            <p data-anim className="mt-2 text-sm leading-relaxed text-ink-500">
              กรอกอีเมลและรหัสผ่านที่ได้รับจากผู้ดูแลระบบ
            </p>
            <Suspense fallback={<div className="mt-9 h-64 animate-pulse rounded-2xl bg-brand-50" />}>
              <LoginForm />
            </Suspense>
          </div>
        </main>
      </div>
    </LoginScene>
  )
}
