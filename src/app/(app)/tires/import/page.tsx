import Link from 'next/link'
import { ArrowLeft, Lock } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { PLAN_LABEL, effectivePlan, featureLockedMessage, hasFeature } from '@/lib/plan'
import { PageHeader } from '@/components/app-shell'
import { Badge, Card, EmptyState } from '@/components/ui'
import { TireImportClient } from './import-client'

export const metadata = { title: 'นำเข้าซีรีย์ยาง · Dream Tire' }

/**
 * หน้านำเข้าซีรีย์ยางจากไฟล์ (แอดมินบริษัท) — เปิดเฉพาะแพ็กเกจ Premium
 * แพ็กเกจอื่นเห็นหน้านี้ได้แต่จะเจอกล่องล็อกพร้อมวิธีติดต่อเปิดใช้งาน แทนที่จะหายไปเฉย ๆ
 */
export default async function TireImportPage() {
  const { company } = await requireSession(['admin'])
  const unlocked = hasFeature(company, 'tire_import')

  return (
    <>
      <PageHeader
        title="นำเข้าซีรีย์ยาง"
        subtitle={company?.name}
        breadcrumb={['คลังยาง', 'นำเข้าซีรีย์ยาง']}
        action={
          <>
            <Badge tone={unlocked ? 'brand' : 'slate'}>แพ็กเกจ {PLAN_LABEL[effectivePlan(company)]}</Badge>
            <Link
              href="/tires"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-medium text-ink-700 hover:bg-brand-50"
            >
              <ArrowLeft className="size-5" />
              กลับไปคลังยาง
            </Link>
          </>
        }
      />

      {unlocked ? (
        <TireImportClient companyName={company?.name ?? 'Dream Tire'} basePath="/tires" />
      ) : (
        <Card>
          <EmptyState
            icon={<Lock className="size-7" />}
            title="ฟีเจอร์นี้ยังไม่เปิดสำหรับแพ็กเกจของคุณ"
            description={featureLockedMessage('tire_import')}
            action={
              <Link
                href="/tires"
                className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 text-[15px] font-medium text-white hover:bg-brand-700"
              >
                <ArrowLeft className="size-5" />
                กลับไปคลังยาง
              </Link>
            }
          />
        </Card>
      )}
    </>
  )
}
