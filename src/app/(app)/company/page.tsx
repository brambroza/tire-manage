import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/auth'
import { PageHeader } from '@/components/app-shell'
import { CompanyForm } from './company-form'

export const metadata = { title: 'ข้อมูลบริษัท · Dream Tire' }

export default async function CompanyPage() {
  const { company } = await requireSession(['admin'])
  if (!company) notFound()

  return (
    <>
      <PageHeader
        title="ข้อมูลบริษัท"
        subtitle="แก้ไขข้อมูลติดต่อและตั้งค่าเกณฑ์แจ้งเตือนการใช้งานยาง"
      />
      <CompanyForm company={company} />
    </>
  )
}
