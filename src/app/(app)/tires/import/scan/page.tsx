import Link from 'next/link'
import { ArrowLeft, Lock } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { featureLockedMessage, hasFeature } from '@/lib/plan'
import { PageHeader } from '@/components/app-shell'
import { Card, EmptyState } from '@/components/ui'
import { ScanSerialClient, type ScanModelOption } from './scan-client'

export const metadata = { title: 'เพิ่มซีรีย์ยางใหม่ · Dream Tire' }

interface GrantRow {
  tire_models: {
    id: string
    name: string
    size: string | null
    is_active: boolean
    created_by_company: string | null
    tire_brands: { name: string; is_active: boolean } | null
  } | null
}

/**
 * เพิ่มซีรีย์ยางใหม่ทีละรุ่น (แอดมินบริษัท · Premium): เลือกยี่ห้อ/รุ่นจากข้อมูลยางที่ super admin เปิดสิทธิ์
 * แล้วสแกนบาร์โค้ดหรือคีย์ซีรีย์ทีละเส้น หรือวางหลายซีรีย์พร้อมกัน
 * บันทึกผ่านขั้นตอนเดียวกับการนำเข้าไฟล์ (ตรวจซ้ำฝั่ง server + เก็บเป็นรอบในประวัติ)
 */
export default async function ScanSerialPage() {
  const { company } = await requireSession(['admin'])
  const unlocked = hasFeature(company, 'tire_import')

  const back = (
    <Link
      href="/tires/import"
      className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-medium text-ink-700 hover:bg-brand-50"
    >
      <ArrowLeft className="size-5" />
      กลับไปข้อมูลยางใหม่
    </Link>
  )

  const header = (
    <PageHeader
      title="เพิ่มซีรีย์ยางใหม่"
      subtitle={`${company?.name ?? 'บริษัท'} · เลือกรุ่นยางก่อน แล้วค่อยสแกนหรือพิมพ์ซีรีย์ทีละเส้น`}
      breadcrumb={['ข้อมูลยางใหม่', 'คีย์/สแกนซีรีย์']}
      action={back}
    />
  )

  if (!unlocked || !company) {
    return (
      <>
        {header}
        <Card>
          <EmptyState
            icon={<Lock className="size-7" />}
            title="ฟีเจอร์นี้ยังไม่เปิดสำหรับแพ็กเกจของคุณ"
            description={featureLockedMessage('tire_import')}
          />
        </Card>
      </>
    )
  }

  const supabase = await createClient()
  const { data } = await supabase
    .from('company_tire_models')
    .select('tire_models(id, name, size, is_active, created_by_company, tire_brands(name, is_active))')
    .eq('company_id', company.id)

  // เฉพาะรุ่นกลางที่ได้รับสิทธิ์ ยังเปิดใช้งาน และยี่ห้อยังเปิดใช้งาน (กฎเดียวกับการนำเข้าไฟล์)
  const models: ScanModelOption[] = ((data ?? []) as unknown as GrantRow[])
    .map((g) => g.tire_models)
    .filter((m): m is NonNullable<GrantRow['tire_models']> =>
      Boolean(m && m.is_active && m.created_by_company === null && m.tire_brands?.is_active),
    )
    .map((m) => ({ id: m.id, brand: m.tire_brands!.name, model: m.name, size: m.size ?? '' }))
    .sort((a, b) => a.brand.localeCompare(b.brand, 'th') || a.model.localeCompare(b.model) || a.size.localeCompare(b.size))

  return (
    <>
      {header}
      <ScanSerialClient models={models} />
    </>
  )
}
