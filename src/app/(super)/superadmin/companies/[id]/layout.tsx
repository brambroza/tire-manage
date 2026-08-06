import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { Badge } from '@/components/ui'
import { CompanyTabs } from './company-tabs'
import type { Company } from '@/lib/database.types'

/**
 * โครงหน้าจัดการลูกค้า 1 ราย — หัวข้อบริษัท + แท็บย่อย
 * ใช้ร่วมกันทุกแท็บ (ภาพรวม / รถ / คลังยาง / ผู้ใช้งาน / สิทธิ์ยาง)
 */
export default async function CompanyLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ id: string }>
}) {
  await requireSession(['super_admin'])
  const { id } = await params
  const supabase = await createClient()

  const { data } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (!data) notFound()
  const company = data as Company

  return (
    <>
      <Link
        href="/superadmin/companies"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-600"
      >
        <ArrowLeft className="size-4" />
        กลับไปรายชื่อลูกค้า
      </Link>

      <PageHeader
        title={company.name}
        subtitle={[company.code, company.contact_name, company.phone].filter(Boolean).join(' · ')}
        action={
          <Badge tone={company.is_active ? 'emerald' : 'slate'}>
            {company.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
          </Badge>
        }
      />

      <CompanyTabs companyId={id} />

      {children}
    </>
  )
}
