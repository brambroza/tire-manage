'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check } from 'lucide-react'
import { Button, Card, CardBody, CardHeader, Field, Input, Textarea } from '@/components/ui'
import { updateOwnCompany, type CompanyInput } from './actions'
import type { Company } from '@/lib/database.types'

/** ฟอร์มแก้ไขข้อมูลบริษัทของตัวเอง (เฉพาะแอดมิน) */
export function CompanyForm({ company }: { company: Company }) {
  const router = useRouter()
  const [form, setForm] = React.useState<CompanyInput>({
    name: company.name,
    tax_id: company.tax_id ?? '',
    phone: company.phone ?? '',
    email: company.email ?? '',
    address: company.address ?? '',
    contact_name: company.contact_name ?? '',
    alert_km: company.alert_km,
    alert_tread_mm: company.alert_tread_mm,
    alert_change_count: company.alert_change_count ?? 3,
    alert_change_days: company.alert_change_days ?? 90,
  })
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState(false)
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({})

  const set = <K extends keyof CompanyInput>(key: K, value: CompanyInput[K]) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setFieldErrors({})

    const result = await updateOwnCompany(form)
    setLoading(false)

    if (!result.ok) {
      setError(result.error)
      setFieldErrors(result.fieldErrors ?? {})
      return
    }

    setSaved(true)
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="ข้อมูลบริษัท" description={`รหัสบริษัท ${company.code}`} />
        <CardBody className="space-y-5">
          {error && (
            <div className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <Field label="ชื่อบริษัท" required error={fieldErrors.name}>
            <Input value={form.name} onChange={(e) => set('name', e.target.value)} />
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="เลขประจำตัวผู้เสียภาษี">
              <Input value={form.tax_id ?? ''} onChange={(e) => set('tax_id', e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="ผู้ติดต่อ">
              <Input value={form.contact_name ?? ''} onChange={(e) => set('contact_name', e.target.value)} />
            </Field>
            <Field label="เบอร์โทร">
              <Input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
            </Field>
            <Field label="อีเมล">
              <Input value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} inputMode="email" />
            </Field>
          </div>

          <Field label="ที่อยู่">
            <Textarea value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader
            title="เกณฑ์แจ้งเตือน"
            description="ใช้คำนวณการแจ้งเตือนในหน้าภาพรวมและแผนผังล้อ"
          />
          <CardBody className="space-y-5">
            <Field
              label="ระยะใช้งานยางที่จะแจ้งเตือน (กม.)"
              required
              hint="ค่าเริ่มต้นตามสเปคคือ 10,000 กม."
              error={fieldErrors.alert_km}
            >
              <Input
                type="number" inputMode="numeric" min={1}
                value={form.alert_km}
                onChange={(e) => set('alert_km', Number(e.target.value))}
              />
            </Field>
            <Field
              label="ดอกยางขั้นต่ำที่จะแจ้งเตือน (มม.)"
              required
              error={fieldErrors.alert_tread_mm}
            >
              <Input
                type="number" inputMode="decimal" step="0.1" min={0}
                value={form.alert_tread_mm}
                onChange={(e) => set('alert_tread_mm', Number(e.target.value))}
              />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="รถเปลี่ยนยางบ่อย"
            description="แจ้งเตือนทะเบียนรถที่ถอดยางถี่ผิดปกติ เพื่อตรวจสภาพรถหรือพฤติกรรมการใช้งาน"
          />
          <CardBody className="space-y-5">
            <Field
              label="จำนวนครั้งที่ถอดยาง (ครั้ง)"
              required
              hint="ค่าเริ่มต้น 3 ครั้ง"
              error={fieldErrors.alert_change_count}
            >
              <Input
                type="number" inputMode="numeric" min={1} max={999}
                value={form.alert_change_count}
                onChange={(e) => set('alert_change_count', Number(e.target.value))}
              />
            </Field>
            <Field
              label="ภายในช่วงกี่วันล่าสุด (วัน)"
              required
              hint="ค่าเริ่มต้น 90 วัน"
              error={fieldErrors.alert_change_days}
            >
              <Input
                type="number" inputMode="numeric" min={1} max={3650}
                value={form.alert_change_days}
                onChange={(e) => set('alert_change_days', Number(e.target.value))}
              />
            </Field>
          </CardBody>
        </Card>

        <div className="flex items-center gap-3">
          <Button type="submit" loading={loading} className="flex-1">บันทึกข้อมูล</Button>
          {saved && (
            <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
              <Check className="size-4" />
              บันทึกแล้ว
            </span>
          )}
        </div>
      </div>
    </form>
  )
}
