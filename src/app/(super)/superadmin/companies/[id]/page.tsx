import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, CircleDot, Gauge, Truck, Users } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { Card, CardBody, CardHeader, EmptyState, StatTile } from '@/components/ui'
import { formatNumber } from '@/lib/utils'
import type { Company, TireOverview } from '@/lib/database.types'
import { RecentEventsTable, TopTiresTable, type EventRow } from './company-overview-tables'

/** จำนวนประวัติถอด-ใส่ยางสูงสุดที่ดึงมาแสดงในแท็บภาพรวม */
const EVENT_FETCH_LIMIT = 500

/** แท็บภาพรวมการใช้งานของลูกค้ารายนั้น */
export default async function CompanyOverviewPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSession(['super_admin'])
  const { id } = await params
  const supabase = await createClient()

  const { data: companyData } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (!companyData) notFound()
  const company = companyData as Company

  const [
    { data: tireData },
    { count: vehicleCount },
    { count: userCount },
    { data: eventData },
  ] = await Promise.all([
    supabase
      .from('tire_overview')
      .select('*')
      .eq('company_id', id)
      .order('lifetime_km', { ascending: false }),
    supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', id)
      .eq('is_active', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', id),
    supabase
      .from('tire_events')
      .select('id, event_type, event_date, position_code, distance_km, ' +
        'tires(serial_no), vehicles(plate_no, axle_type), removal_reasons(name), profiles(full_name)')
      .eq('company_id', id)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(EVENT_FETCH_LIMIT),
  ])

  const tires = (tireData ?? []) as TireOverview[]
  const events = (eventData ?? []) as unknown as EventRow[]

  const mounted = tires.filter((t) => t.status === 'mounted')
  const alerts = mounted.filter(
    (t) => t.current_run_km >= company.alert_km ||
      (t.tread_mm !== null && t.tread_mm <= company.alert_tread_mm),
  )
  const totalKm = tires.reduce((s, t) => s + t.lifetime_km, 0)

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="รถที่ใช้งาน" value={formatNumber(vehicleCount ?? 0)} unit="คัน"
          icon={<Truck className="size-4.5" />}
        />
        <StatTile
          label="ยางทั้งหมด" value={formatNumber(tires.length)} unit="เส้น" tone="sky"
          icon={<CircleDot className="size-4.5" />}
        />
        <StatTile
          label="ระยะสะสมรวม" value={formatNumber(totalKm)} unit="กม." tone="emerald"
          icon={<Gauge className="size-4.5" />}
        />
        <StatTile
          label={`ถึงเกณฑ์เตือน (${formatNumber(company.alert_km)} กม.)`}
          value={formatNumber(alerts.length)} unit="เส้น" tone="amber"
          icon={<AlertTriangle className="size-4.5" />}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="ข้อมูลบริษัท" />
          <CardBody className="grid grid-cols-2 gap-y-4">
            <Info label="รหัสบริษัท" value={company.code} />
            <Info label="ผู้ติดต่อ" value={company.contact_name ?? '-'} />
            <Info label="เบอร์โทร" value={company.phone ?? '-'} />
            <Info label="อีเมล" value={company.email ?? '-'} />
            <Info label="เลขผู้เสียภาษี" value={company.tax_id ?? '-'} />
            <Info label="ผู้ใช้งาน" value={`${formatNumber(userCount ?? 0)} บัญชี`} />
            <Info label="เกณฑ์เตือนระยะ" value={`${formatNumber(company.alert_km)} กม.`} />
            <Info label="เกณฑ์เตือนดอกยาง" value={`${company.alert_tread_mm} มม.`} />
            {company.address && (
              <div className="col-span-2">
                <p className="text-xs text-ink-400">ที่อยู่</p>
                <p className="mt-0.5 text-[15px] text-ink-700">{company.address}</p>
              </div>
            )}
            <div className="col-span-2 flex flex-wrap gap-2 pt-1">
              <TabLink href={`/superadmin/companies/${id}/vehicles`} label="จัดการรถ" />
              <TabLink href={`/superadmin/companies/${id}/tires`} label="จัดการคลังยาง" />
              <TabLink href={`/superadmin/companies/${id}/users`} label="จัดการผู้ใช้งาน" />
            </div>
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader
            title="ความเคลื่อนไหวล่าสุด"
            description={`ประวัติการถอด-ใส่ยางล่าสุดของลูกค้ารายนี้ (สูงสุด ${formatNumber(EVENT_FETCH_LIMIT)} รายการ)`}
          />
          {events.length === 0 ? (
            <EmptyState
              icon={<Users className="size-6" />}
              title="ยังไม่มีการบันทึกถอด-ใส่ยาง"
              description="ข้อมูลจะปรากฏเมื่อช่างของลูกค้าเริ่มบันทึกงาน"
            />
          ) : (
            <RecentEventsTable events={events} />
          )}
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="ยางเรียงตามระยะสะสม"
          description="ดูและแก้ไขได้ทั้งหมดที่แท็บ “คลังยาง”"
        />
        {tires.length === 0 ? (
          <EmptyState icon={<CircleDot className="size-6" />} title="ลูกค้ารายนี้ยังไม่มียางในระบบ" />
        ) : (
          <TopTiresTable tires={tires} />
        )}
      </Card>
    </>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-ink-400">{label}</p>
      <p className="mt-0.5 text-[15px] font-medium text-ink-900">{value}</p>
    </div>
  )
}

function TabLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="tap-target inline-flex items-center rounded-xl border border-line bg-white px-3.5 text-sm font-medium text-ink-700 hover:border-brand-200 hover:bg-brand-50"
    >
      {label}
    </Link>
  )
}
