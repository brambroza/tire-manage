import Link from 'next/link'
import { Building2, CircleDot, Gauge, Truck } from 'lucide-react'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { PageHeader } from '@/components/app-shell'
import {
  Badge, Card, CardHeader, EmptyState, StatTile, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { formatKm, formatNumber } from '@/lib/utils'
import type { Company, TireOverview, Vehicle } from '@/lib/database.types'

export const metadata = { title: 'ภาพรวมระบบ · Dream Tire Admin' }

export default async function SuperDashboardPage() {
  await requireSession(['super_admin'])
  const supabase = await createClient()

  const [{ data: companyData }, { data: tireData }, { data: vehicleData }] = await Promise.all([
    supabase.from('companies').select('*').order('name'),
    supabase.from('tire_overview').select('company_id, status, lifetime_km, current_run_km, alert_km'),
    supabase.from('vehicles').select('company_id, is_active'),
  ])

  const companies = (companyData ?? []) as Company[]
  const tires = (tireData ?? []) as Pick<
    TireOverview, 'company_id' | 'status' | 'lifetime_km' | 'current_run_km' | 'alert_km'
  >[]
  const vehicles = (vehicleData ?? []) as Pick<Vehicle, 'company_id' | 'is_active'>[]

  // สรุปรายบริษัท
  const summary = companies.map((c) => {
    const own = tires.filter((t) => t.company_id === c.id)
    return {
      company: c,
      tireCount: own.length,
      mounted: own.filter((t) => t.status === 'mounted').length,
      vehicleCount: vehicles.filter((v) => v.company_id === c.id && v.is_active).length,
      totalKm: own.reduce((s, t) => s + t.lifetime_km, 0),
      alerts: own.filter((t) => t.status === 'mounted' && t.current_run_km >= t.alert_km).length,
    }
  })

  const totalKm = tires.reduce((s, t) => s + t.lifetime_km, 0)

  return (
    <>
      <PageHeader
        title="ภาพรวมระบบทั้งหมด"
        subtitle="สรุปการใช้งานของลูกค้าทุกรายในระบบ Dream Tire"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="บริษัทลูกค้า" value={formatNumber(companies.length)} unit="ราย"
          icon={<Building2 className="size-4.5" />}
        />
        <StatTile
          label="รถทั้งหมด" value={formatNumber(vehicles.filter((v) => v.is_active).length)} unit="คัน"
          tone="sky" icon={<Truck className="size-4.5" />}
        />
        <StatTile
          label="ยางในระบบ" value={formatNumber(tires.length)} unit="เส้น"
          tone="emerald" icon={<CircleDot className="size-4.5" />}
        />
        <StatTile
          label="ระยะสะสมรวม" value={formatNumber(totalKm)} unit="กม."
          tone="brand" icon={<Gauge className="size-4.5" />}
        />
      </div>

      <Card className="mt-4">
        <CardHeader title="การใช้งานรายบริษัท" description="คลิกชื่อบริษัทเพื่อดูรายละเอียดและกำหนดสิทธิ์ยาง" />
        {summary.length === 0 ? (
          <EmptyState
            icon={<Building2 className="size-6" />}
            title="ยังไม่มีบริษัทลูกค้าในระบบ"
            description="เพิ่มลูกค้ารายแรกได้ที่เมนู “ข้อมูลลูกค้า”"
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[860px]">
              <thead>
                <tr>
                  <Th>บริษัท</Th>
                  <Th>รหัส</Th>
                  <Th className="text-right">รถ</Th>
                  <Th className="text-right">ยางทั้งหมด</Th>
                  <Th className="text-right">ใช้งานอยู่</Th>
                  <Th className="text-right">ระยะสะสม</Th>
                  <Th className="text-center">แจ้งเตือน</Th>
                  <Th>สถานะ</Th>
                </tr>
              </thead>
              <tbody>
                {summary.map((s) => (
                  <tr key={s.company.id} className="transition-colors hover:bg-brand-50/40">
                    <Td>
                      <Link
                        href={`/superadmin/companies/${s.company.id}`}
                        className="font-medium text-ink-900 hover:text-brand-600"
                      >
                        {s.company.name}
                      </Link>
                    </Td>
                    <Td><Badge tone="brand">{s.company.code}</Badge></Td>
                    <Td className="text-right">{formatNumber(s.vehicleCount)}</Td>
                    <Td className="text-right">{formatNumber(s.tireCount)}</Td>
                    <Td className="text-right">{formatNumber(s.mounted)}</Td>
                    <Td className="text-right">{formatKm(s.totalKm)}</Td>
                    <Td className="text-center">
                      {s.alerts > 0
                        ? <Badge tone="amber">{formatNumber(s.alerts)}</Badge>
                        : <span className="text-ink-400">-</span>}
                    </Td>
                    <Td>
                      <Badge tone={s.company.is_active ? 'emerald' : 'slate'}>
                        {s.company.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                      </Badge>
                    </Td>
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
