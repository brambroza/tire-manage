import Link from 'next/link'
import { Filter, X } from 'lucide-react'
import { Button, Card, Field, Select } from '@/components/ui'
import { NO_BRANCH, NO_BRANCH_LABEL, THAI_FULL_MONTHS, type FleetFilters } from './fleet-report'

/**
 * แถบกรองของรายงาน — ฟอร์ม GET ธรรมดา (ไม่ต้องใช้ JS) ส่ง ?year=&month=&branch=&axle_type= ให้ server
 * @param filters ค่าที่ใช้อยู่ (year เป็น ค.ศ. แต่แสดงเป็น พ.ศ.)
 * @param years ปี ค.ศ. ที่ให้เลือก
 * @param branches รายชื่อสาขา
 * @param axleTypes ประเภทรถ (รหัส → ชื่อ)
 * @param isDefault true เมื่อไม่ได้กรองอะไรนอกจากเดือนปัจจุบัน (ซ่อนปุ่มล้าง)
 */
export function FleetFilterBar({
  filters,
  years,
  branches,
  axleTypes,
  isDefault,
}: {
  filters: FleetFilters
  years: number[]
  branches: string[]
  axleTypes: Array<{ code: string; name: string }>
  isDefault: boolean
}) {
  return (
    <Card className="mb-4">
      <form method="get" action="/reports/fleet" className="flex flex-col gap-3 px-4 py-4 xl:flex-row xl:items-end">
        <Field label="เดือน" className="w-full xl:max-w-44">
          <Select name="month" defaultValue={String(filters.month)} aria-label="เดือน">
            {THAI_FULL_MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>{name}</option>
            ))}
          </Select>
        </Field>
        <Field label="ปี (พ.ศ.)" className="w-full xl:max-w-36">
          <Select name="year" defaultValue={String(filters.year)} aria-label="ปี">
            {years.map((y) => (
              <option key={y} value={y}>{y + 543}</option>
            ))}
          </Select>
        </Field>
        <Field label="สาขา / หน่วยงาน" className="w-full xl:max-w-56">
          <Select name="branch" defaultValue={filters.branch} aria-label="สาขา">
            <option value="">ทุกสาขา</option>
            {branches.map((b) => (
              <option key={b} value={b}>{b}</option>
            ))}
            <option value={NO_BRANCH}>{NO_BRANCH_LABEL}</option>
          </Select>
        </Field>
        <Field label="ประเภทรถ" className="w-full xl:max-w-56">
          <Select name="axle_type" defaultValue={filters.axleType} aria-label="ประเภทรถ">
            <option value="">ทุกประเภท</option>
            {axleTypes.map((a) => (
              <option key={a.code} value={a.code}>{a.name}</option>
            ))}
          </Select>
        </Field>

        <div className="flex gap-2 self-start xl:self-auto">
          <Button type="submit">
            <Filter className="size-4" />
            แสดง
          </Button>
          {!isDefault && (
            <Link
              href="/reports/fleet"
              className="inline-flex h-12 items-center gap-1.5 rounded-xl border border-line bg-white px-4 text-[15px] font-medium text-ink-700 hover:border-brand-200 hover:bg-brand-50"
            >
              <X className="size-4" />
              ล้างตัวกรอง
            </Link>
          )}
        </div>
      </form>
    </Card>
  )
}
