import Link from 'next/link'
import { ArrowLeft, Lock, Upload } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PLAN_LABEL, effectivePlan, featureLockedMessage, hasFeature } from '@/lib/plan'
import { loadImportHistory } from '@/lib/tire-import-history'
import { PageHeader } from '@/components/app-shell'
import { Badge, Card, EmptyState } from '@/components/ui'
import { ImportHistoryClient } from './import-history-client'

export const metadata = { title: 'ข้อมูลยางใหม่ · Dream Tire' }

const PRIMARY_LINK =
  'inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 text-[15px] font-medium text-white hover:bg-brand-700'

/**
 * เมนู "ข้อมูลยางใหม่" (แอดมินบริษัท · Premium) — ประวัติการนำเข้าซีรีย์ยางจากไฟล์ทุกรอบ
 * พร้อมรายการยางทุกเส้นที่นำเข้าและสถานะปัจจุบัน ปุ่มนำเข้าไฟล์ใหม่ไปที่ /tires/import/new
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
      subtitle={`ยางใหม่ที่นำเข้าคลังจากไฟล์ทั้งหมด · ${company?.name ?? ''}`}
      breadcrumb={['คลังยาง', 'ข้อมูลยางใหม่']}
      action={
        <>
          <Badge tone={unlocked ? 'brand' : 'slate'}>แพ็กเกจ {PLAN_LABEL[effectivePlan(company)]}</Badge>
          {unlocked && (
            <Link href="/tires/import/new" className={PRIMARY_LINK}>
              <Upload className="size-5" />
              นำเข้าไฟล์ใหม่
            </Link>
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
