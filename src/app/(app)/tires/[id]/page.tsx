import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Gauge, MapPin, Ruler, Wallet } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { Badge, Card, CardBody, CardHeader, StatTile } from '@/components/ui'
import { TireThumb } from '@/components/tire-thumb'
import { TireSpec } from '@/components/tire-spec'
import { TireEventTable } from '@/components/tire-event-table'
import { positionLabel } from '@/lib/axle-layouts'
import { TIRE_EVENT_SELECT, type TireEventRow } from '@/lib/tire-events'
import {
  TIRE_STATUS_LABEL, TIRE_STATUS_TONE, formatBaht, formatNumber, treadPercent,
} from '@/lib/utils'
import type { AxleType, Tire, TireOverview } from '@/lib/database.types'

export default async function TireDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireSession(['admin', 'technician'])
  const { id } = await params
  const supabase = await createClient()

  const [{ data: overview }, { data: raw }, { data: eventData }, { data: axleTypeData }] =
    await Promise.all([
      supabase.from('tire_overview').select('*').eq('id', id).maybeSingle(),
      supabase.from('tires').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('tire_events')
        .select(TIRE_EVENT_SELECT)
        .eq('tire_id', id)
        .order('event_date', { ascending: false })
        .order('created_at', { ascending: false }),
      supabase.from('axle_types').select('*').order('sort_order').order('name'),
    ])

  if (!overview || !raw) notFound()

  const t = overview as TireOverview
  const tire = raw as Tire
  const events = (eventData ?? []) as unknown as TireEventRow[]
  const axleTypes = (axleTypeData ?? []) as AxleType[]
  const pct = treadPercent(t.tread_mm, t.new_tread_mm)
  const costPerKm = tire.purchase_price && t.lifetime_km > 0
    ? tire.purchase_price / t.lifetime_km
    : null

  return (
    <>
      <Link href="/tires" className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-600">
        <ArrowLeft className="size-4" />
        กลับไปคลังยาง
      </Link>

      <PageHeader
        title={t.serial_no}
        subtitle={(
          <TireSpec
            size={t.size}
            brandName={t.brand_name}
            modelName={t.model_name}
            sizeClassName="text-base"
            detailClassName="text-sm text-ink-500"
          />
        )}
        action={<Badge tone={TIRE_STATUS_TONE[t.status]}>{TIRE_STATUS_LABEL[t.status]}</Badge>}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="ระยะสะสมตลอดอายุยาง" value={formatNumber(t.lifetime_km)} unit="กม."
          icon={<Gauge className="size-4.5" />}
        />
        <StatTile
          label="ระยะรอบติดตั้งปัจจุบัน"
          value={t.status === 'mounted' ? formatNumber(t.current_run_km) : '-'} unit="กม."
          tone={t.status === 'mounted' && t.current_run_km >= t.alert_km ? 'amber' : 'sky'}
          icon={<MapPin className="size-4.5" />}
        />
        <StatTile
          label="ดอกยางคงเหลือ"
          value={t.tread_mm !== null ? formatNumber(t.tread_mm, 1) : '-'}
          unit={pct !== null ? `มม. (${pct}%)` : 'มม.'}
          tone={t.tread_mm !== null && t.tread_mm <= t.alert_tread_mm ? 'rose' : 'brand'}
          icon={<Ruler className="size-4.5" />}
        />
        <StatTile
          label="ต้นทุนต่อกิโลเมตร"
          value={costPerKm !== null ? formatNumber(costPerKm, 2) : '-'} unit="บาท/กม."
          tone="slate"
          icon={<Wallet className="size-4.5" />}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="ข้อมูลยาง" />
          <CardBody className="grid grid-cols-2 gap-y-4">
            <div className="col-span-2 flex items-center gap-4">
              <TireThumb
                src={t.image_url}
                alt={[t.brand_name, t.model_name].filter(Boolean).join(' ')}
                size="xl"
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-ink-900">{t.serial_no}</p>
                <TireSpec
                  size={t.size}
                  brandName={t.brand_name}
                  modelName={t.model_name}
                  className="mt-1"
                  sizeClassName="text-base"
                  detailClassName="text-sm text-ink-500"
                />
              </div>
            </div>
            <Info label="เลขยาง" value={t.serial_no} />
            <Info label="DOT" value={t.dot ?? '-'} />
            <Info label="ยี่ห้อ" value={t.brand_name ?? '-'} />
            <Info label="รุ่น" value={t.model_name ?? '-'} />
            <Info label="ขนาด" value={t.size ?? '-'} />
            <Info label="ดอกยางตอนใหม่" value={t.new_tread_mm ? `${t.new_tread_mm} มม.` : '-'} />
            <Info label="ราคาซื้อ" value={formatBaht(tire.purchase_price)} />
            <Info
              label="ตำแหน่งปัจจุบัน"
              value={
                t.status === 'mounted' && t.vehicle_id ? (
                  <Link href={`/vehicles/${t.vehicle_id}`} className="text-brand-600 hover:underline">
                    {t.plate_no} · {positionLabel(t.position_code)}
                  </Link>
                ) : (
                  'อยู่ในคลัง'
                )
              }
            />
            {tire.note && (
              <div className="col-span-2">
                <p className="text-xs text-ink-400">หมายเหตุ</p>
                <p className="mt-0.5 text-[15px] text-ink-700">{tire.note}</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="ประวัติการใช้งาน"
            description={`ทั้งหมด ${events.length} รายการ`}
          />
          <TireEventTable events={events} axleTypes={axleTypes} />
        </Card>
      </div>
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
