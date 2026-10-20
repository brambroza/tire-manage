import Link from 'next/link'
import { ArrowLeft, Lock, ScanBarcode, Upload } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PLAN_LABEL, effectivePlan, featureLockedMessage, hasFeature } from '@/lib/plan'
import { loadImportHistory } from '@/lib/tire-import-history'
import { PageHeader } from '@/components/app-shell'
import { Badge, Card, EmptyState } from '@/components/ui'
import { ImportHistoryClient } from './import-history-client'

export const metadata = { title: 'ข้อมูลยางใหม่ · Dream Tire' }

const SECONDARY_LINK =
  'inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-medium text-ink-700 hover:bg-brand-50'

const PRIMARY_LINK =
  'inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 text-[15px] font-medium text-white hover:bg-brand-700'

/**
 * เมนู "ข้อมูลยางใหม่" (แอดมินบริษัท · Premium) — ประวัติการนำเข้าทุกรอบ (ไฟล์ / คีย์-สแกน)
 * พร้อมรายการยางทุกเส้นที่นำเข้าและสถานะปัจจุบัน
 * เพิ่มยางได้ 2 ทาง: /tires/import/scan (เลือกรุ่นแล้วสแกน/คีย์ซีรีย์) และ /tires/import/new (ไฟล์)
 */
export default async function NewTireDataPage({
  searchParams,
}: {
  searchParams: Promise<{ batch?: string }>
}) {
  const { company } = await requireSession(['admin'])
  const { batch } = await searchParams
  const unlocked = hasFeature(company, 'tire_import')

  const header = (
    <PageHeader
      title="ข้อมูลยางใหม่"
      subtitle={`คลังยางใหม่ — ยางที่นำเข้าจากไฟล์หรือคีย์/สแกนซีรีย์ · ${company?.name ?? ''}`}
      breadcrumb={['คลังยาง', 'ข้อมูลยางใหม่']}
      action={
        <>
          <Badge tone={unlocked ? 'brand' : 'slate'}>แพ็กเกจ {PLAN_LABEL[effectivePlan(company)]}</Badge>
          {unlocked && (
            <>
              <Link href="/tires/import/new" className={SECONDARY_LINK}>
                <Upload className="size-5" />
                นำเข้าจากไฟล์
              </Link>
              <Link href="/tires/import/scan" className={PRIMARY_LINK}>
                <ScanBarcode className="size-5" />
                คีย์/สแกนซีรีย์
              </Link>
            </>
          )}
        </>
      }
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
            action={
              <Link href="/tires" className={PRIMARY_LINK}>
                <ArrowLeft className="size-5" />
                กลับไปคลังยาง
              </Link>
            }
          />
        </Card>
      </>
    )
  }

  const supabase = await createClient()
  const history = await loadImportHistory(supabase, company.id)

  return (
    <>
      {header}
      <ImportHistoryClient history={history} initialBatchId={batch ?? ''} />
    </>
  )
}
