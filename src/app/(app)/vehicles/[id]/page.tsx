import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Wrench } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import { WheelDiagram, type WheelSlot } from '@/components/wheel-diagram'
import {
  Badge, Card, CardBody, CardHeader, EmptyState, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { getLayout, positionLabel } from '@/lib/axle-layouts'
import { formatKm, formatThaiDate } from '@/lib/utils'
import type { TireOverview, Vehicle } from '@/lib/database.types'

interface HistoryRow {
  id: string
  event_type: string
  event_date: string
  position_code: string | null
  odometer: number
  tread_mm: number | null
  distance_km: number | null
  note: string | null
  tires: { serial_no: string } | null
  removal_reasons: { name: string } | null
  profiles: { full_name: string } | null
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { company } = await requireSession(['admin', 'technician'])
  const { id } = await params
  const supabase = await createClient()

  const { data: vehicle } = await supabase.from('vehicles').select('*').eq('id', id).single()
  if (!vehicle) notFound()

  const v = vehicle as Vehicle
  const layout = getLayout(v.axle_type)
  const alertKm = company?.alert_km ?? 10000

  const [{ data: tireData }, { data: historyData }] = await Promise.all([
    supabase.from('tire_overview').select('*').eq('vehicle_id', id).eq('status', 'mounted'),
    supabase
      .from('tire_events')
      .select('id, event_type, event_date, position_code, odometer, tread_mm, distance_km, note, ' +
        'tires(serial_no), removal_reasons(name), profiles(full_name)')
      .eq('vehicle_id', id)
      .order('event_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  const tires = (tireData ?? []) as TireOverview[]
  const history = (historyData ?? []) as unknown as HistoryRow[]

  const slots: Record<string, WheelSlot> = {}
  for (const t of tires) {
    if (!t.position_code) continue
    slots[t.position_code] = {
      tireId: t.id,
      serialNo: t.serial_no,
      treadMm: t.tread_mm,
      lifetimeKm: t.lifetime_km,
      alert: t.current_run_km >= alertKm,
    }
  }

  return (
    <>
      <Link
        href="/vehicles"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-brand-600"
      >
        <ArrowLeft className="size-4" />
        กลับไปรายการรถ
      </Link>

      <PageHeader
        title={`${v.plate_no} ${v.province}`}
        subtitle={[v.brand, v.model].filter(Boolean).join(' ') || 'ไม่ระบุยี่ห้อ/รุ่น'}
        action={
          <Link
            href={`/service?vehicle=${v.id}`}
            className="tap-target inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 text-[15px] font-medium text-white hover:bg-brand-700"
          >
            <Wrench className="size-4.5" />
            บันทึกถอด-ใส่ยาง
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ผังล้อ */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="ผังตำแหน่งยาง"
            description={`${layout.name} · ติดตั้งแล้ว ${tires.length}/${layout.wheelCount} เส้น`}
          />
          <CardBody>
            <WheelDiagram axleType={v.axle_type} slots={slots} mode="view" />
          </CardBody>
        </Card>

        {/* ข้อมูลรถ + ยางที่ติดตั้ง */}
        <div className="space-y-4 lg:col-span-3">
          <Card>
            <CardHeader title="ข้อมูลรถ" />
            <CardBody className="grid grid-cols-2 gap-y-4 sm:grid-cols-3">
              <Info label="ทะเบียน" value={v.plate_no} />
              <Info label="จังหวัด" value={v.province} />
              <Info label="ประเภทเพลา" value={layout.name} />
              <Info label="ยี่ห้อ" value={v.brand ?? '-'} />
              <Info label="รุ่น" value={v.model ?? '-'} />
              <Info label="เลขไมล์ล่าสุด" value={formatKm(v.current_mileage)} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="ยางที่ติดตั้งอยู่" />
            {tires.length === 0 ? (
              <EmptyState title="ยังไม่มียางติดตั้งบนรถคันนี้" />
            ) : (
              <TableWrap>
                <Table className="min-w-[560px]">
                  <thead>
                    <tr>
                      <Th>ตำแหน่ง</Th>
                      <Th>เลขยาง</Th>
                      <Th>ดอกยาง</Th>
                      <Th className="text-right">ระยะรอบนี้</Th>
                      <Th className="text-right">ระยะสะสม</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {tires
                      .slice()
                      .sort((a, b) => (a.position_code ?? '').localeCompare(b.position_code ?? ''))
                      .map((t) => (
                        <tr key={t.id} className="transition-colors hover:bg-brand-50/40">
                          <Td className="whitespace-nowrap">{positionLabel(t.position_code, v.axle_type)}</Td>
                          <Td>
                            <Link href={`/tires/${t.id}`} className="font-medium text-ink-900 hover:text-brand-600">
                              {t.serial_no}
                            </Link>
                            <p className="text-xs text-ink-400">
                              {[t.brand_name, t.model_name].filter(Boolean).join(' ')}
                            </p>
                          </Td>
                          <Td>{t.tread_mm !== null ? `${t.tread_mm} มม.` : '-'}</Td>
                          <Td className="text-right">
                            <span className={t.current_run_km >= alertKm ? 'font-medium text-amber-600' : ''}>
                              {formatKm(t.current_run_km)}
                            </span>
                          </Td>
                          <Td className="text-right">{formatKm(t.lifetime_km)}</Td>
                        </tr>
                      ))}
                  </tbody>
                </Table>
              </TableWrap>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader title="ประวัติการถอด-ใส่ยางของรถคันนี้" />
        {history.length === 0 ? (
          <EmptyState title="ยังไม่มีประวัติ" />
        ) : (
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>วันที่</Th>
                  <Th>รายการ</Th>
                  <Th>เลขยาง</Th>
                  <Th>ตำแหน่ง</Th>
                  <Th className="text-right">เลขไมล์</Th>
                  <Th className="text-right">ระยะรอบนี้</Th>
                  <Th>สาเหตุ</Th>
                  <Th>ผู้บันทึก</Th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="transition-colors hover:bg-brand-50/40">
                    <Td className="whitespace-nowrap">{formatThaiDate(h.event_date)}</Td>
                    <Td>
                      <Badge tone={h.event_type === 'mount' ? 'brand' : 'amber'}>
                        {h.event_type === 'mount' ? 'ใส่ยาง' : 'ถอดยาง'}
                      </Badge>
                    </Td>
                    <Td className="font-medium text-ink-900">{h.tires?.serial_no ?? '-'}</Td>
                    <Td>{positionLabel(h.position_code, v.axle_type)}</Td>
                    <Td className="text-right">{formatKm(h.odometer)}</Td>
                    <Td className="text-right">{h.distance_km !== null ? formatKm(h.distance_km) : '-'}</Td>
                    <Td>{h.removal_reasons?.name ?? '-'}</Td>
                    <Td className="text-ink-500">{h.profiles?.full_name ?? '-'}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
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

