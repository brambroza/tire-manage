import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PLAN_LABEL, effectivePlan } from '@/lib/plan'
import { Badge, Card, CardHeader } from '@/components/ui'
import { TireImportClient } from '@/app/(app)/tires/import/import-client'
import type { Company } from '@/lib/database.types'

export const metadata = { title: 'นำเข้าซีรีย์ยางแทนลูกค้า · Dream Tire Admin' }

/**
 * super admin นำเข้าซีรีย์ยางแทนลูกค้า — ไม่ติดแพ็กเกจ แต่โชว์แพ็กเกจปัจจุบันให้ Dreammaker เห็น
 * (ลูกค้า Standard ที่ส่งไฟล์มาให้ทำแทนก็ได้ ส่วนลูกค้า Premium ทำเองได้ที่ /tires/import)
 */
export default async function CompanyTireImportPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSession(['super_admin'])
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('companies')
    .select('name, plan, plan_expires_at')
    .eq('id', id)
    .maybeSingle()
  const company = data as Pick<Company, 'name' | 'plan' | 'plan_expires_at'> | null
  const plan = effectivePlan(company)
  const basePath = `/superadmin/companies/${id}/tires`

  return (
    <>
      <Card className="mb-4">
        <CardHeader
          title="นำเข้าซีรีย์ยางแทนลูกค้า"
          description="ยางที่นำเข้าจะเข้าคลังของบริษัทนี้ในสถานะ “อยู่ในคลัง” ช่างเลือกซีรีย์จากคลังได้ทันที"
          action={
            <div className="flex items-center gap-2">
              <Badge tone={plan === 'premium' ? 'brand' : 'slate'}>แพ็กเกจ {PLAN_LABEL[plan]}</Badge>
              <Link
                href={basePath}
                className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-4 text-[15px] font-medium text-ink-700 hover:bg-brand-50"
              >
                <ArrowLeft className="size-5" />
                กลับไปคลังยาง
              </Link>
            </div>
          }
        />
      </Card>
      <TireImportClient
        companyName={company?.name ?? 'Dream Tire'}
        companyId={id}
        basePath={basePath}
      />
    </>
  )
}
