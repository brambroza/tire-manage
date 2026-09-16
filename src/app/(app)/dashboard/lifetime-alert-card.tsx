import Link from 'next/link'
import { AlertTriangle, Check, Clock, Gauge } from 'lucide-react'
import { Card, CardHeader, EmptyState, Table, TableWrap, Td, Th } from '@/components/ui'
import { TireThumb } from '@/components/tire-thumb'
import { TireSpec } from '@/components/tire-spec'
import { positionLabel } from '@/lib/axle-layouts'
import { cn, formatKm, formatKmApprox, formatNumber } from '@/lib/utils'
import { StatusChip, TD_LG, TH_LG } from './dashboard-ui'
import type { LifetimeAlert } from '@/lib/notifications'

/**
 * ป้ายบอกที่มาของตัวเลข — ลูกค้าถามมาเองว่าการแจ้งเตือนคำนวณจากอะไร
 * ถ้าแสดงค่าที่เดาปนกับค่าที่วัดจริงโดยไม่บอก จะเสียความเชื่อถือมากกว่าไม่มีฟีเจอร์
 */
function SourceBadge({ alert }: { alert: LifetimeAlert }) {
  if (alert.isMileageStale) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-300">
        <Clock className="size-3" />
        ต้องยืนยันเลขไมล์
      </span>
    )
  }
  if (alert.isEstimated) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600 ring-1 ring-inset ring-ink-200">
        ประมาณการ
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
      วัดจริง
    </span>
  )
}

/** บรรทัดอธิบายที่มาของตัวเลข แสดงเฉพาะแถวที่มีค่าประมาณปนอยู่ */
function EstimateNote({ alert }: { alert: LifetimeAlert }) {
  if (!alert.isEstimated || alert.currentMileage === null) return null
  return (
    <p className="mt-0.5 text-xs text-ink-400">
      ไมล์จริง {formatKm(alert.currentMileage)}
      {alert.daysSinceMileage !== null && ` เมื่อ ${formatNumber(alert.daysSinceMileage)} วันก่อน`}
      {alert.avgKmPerMonth !== null && ` · เฉลี่ย ${formatNumber(alert.avgKmPerMonth)} กม./เดือน`}
    </p>
  )
}

function AlertRows({ items, threshold, tone }: {
  items: LifetimeAlert[]
  threshold: number
  tone: 'danger' | 'warn'
}) {
  return (
    <>
      {items.map((a) => (
        <tr
          key={a.tireId}
          className={cn(
            'border-l-4 transition-colors',
            tone === 'danger'
              ? 'border-rose-500 bg-rose-50/60 hover:bg-rose-100/60'
              : 'border-amber-500 bg-amber-50/50 hover:bg-amber-100/60',
          )}
        >
          <Td className={TD_LG}>
            <div className="flex items-start gap-3">
              <TireThumb
                src={a.imageUrl}
                alt={[a.brandName, a.modelName].filter(Boolean).join(' ')}
              />
              <div className="min-w-0">
                <Link
                  href={`/tires/${a.tireId}`}
                  className="font-medium text-ink-900 underline decoration-dotted underline-offset-4 hover:text-brand-700"
                >
                  {a.serialNo}
                </Link>
                <TireSpec
                  size={a.size}
                  brandName={a.brandName}
                  modelName={a.modelName}
                  className="mt-1"
                />
              </div>
            </div>
          </Td>
          <Td className={TD_LG}>
            {a.plateNo ? (
              <>
                <span className="font-medium text-ink-900">{a.plateNo}</span>
                <span className="block text-sm text-ink-500">
                  {positionLabel(a.positionCode, a.vehicleAxleType)}
                </span>
              </>
            ) : (
              <span className="text-ink-400">อยู่ในคลัง</span>
            )}
          </Td>
          <Td className={cn(TD_LG, 'whitespace-nowrap')}>
            <span
              className={cn(
                'font-semibold',
                tone === 'danger' ? 'text-rose-700' : 'text-amber-700',
              )}
            >
              {formatKmApprox(a.lifetimeKm, a.isEstimated)}
            </span>
            <span className="text-ink-400"> / {formatNumber(threshold)}</span>
            <EstimateNote alert={a} />
          </Td>
          <Td className={TD_LG}>
            <SourceBadge alert={a} />
          </Td>
          <Td className={cn(TD_LG, 'whitespace-nowrap')}>
            {a.daysToAlert === null ? (
              <span className="text-ink-400">-</span>
            ) : a.daysToAlert === 0 ? (
              <span className="font-semibold text-rose-700">ครบแล้ว</span>
            ) : (
              <span className="text-amber-700">อีก ~{formatNumber(a.daysToAlert)} วัน</span>
            )}
          </Td>
        </tr>
      ))}
    </>
  )
}

/**
 * การ์ดแจ้งเตือนยางที่ครบ (หรือใกล้ครบ) ระยะสะสมตลอดอายุยาง
 *
 * ระยะสะสมนับรวมทุกรอบการติดตั้ง ไม่รีเซ็ตเมื่อสลับตำแหน่ง ต่างจากเกณฑ์
 * "ระยะรอบนี้" ที่เริ่มนับใหม่ทุกครั้งที่ถอดแล้วใส่
 *
 * @param reached ยางที่ครบเกณฑ์แล้ว
 * @param soon ยางที่ใกล้ครบภายใน soonDays วัน
 * @param threshold เกณฑ์ระยะสะสม (กม.)
 * @param soonDays กรอบวันที่ถือว่า "ใกล้ครบ"
 * @param reachedTotal จำนวนที่ครบเกณฑ์ทั้งหมด (อาจมากกว่าที่แสดง)
 */
export function LifetimeAlertCard({
  reached,
  soon,
  threshold,
  soonDays,
  reachedTotal,
}: {
  reached: LifetimeAlert[]
  soon: LifetimeAlert[]
  threshold: number
  soonDays: number
  reachedTotal: number
}) {
  const hasRows = reached.length > 0 || soon.length > 0

  return (
    <Card className="mt-4 scroll-mt-24" id="lifetime-alerts">
      <CardHeader
        title={<span className="text-lg">ยางครบระยะสะสม</span>}
        description={
          <span className="text-[15px] text-ink-700">
            วิ่งครบ {formatNumber(threshold)} กม. นับรวมทุกรอบการติดตั้ง ·
            ตัวเลขที่มี ~ คือค่าประมาณจากค่าเฉลี่ยวิ่งต่อเดือน
          </span>
        }
        action={
          <StatusChip
            tone={reachedTotal ? 'bad' : 'good'}
            icon={reachedTotal ? <AlertTriangle /> : <Check strokeWidth={3} />}
            className="rounded-full px-3.5 py-1.5 text-base"
          >
            {formatNumber(reachedTotal)} เส้น
          </StatusChip>
        }
      />
      {!hasRows ? (
        <EmptyState
          icon={<Gauge className="size-6" />}
          title="ยังไม่มียางที่ครบระยะสะสม"
          description={`ระบบจะแจ้งเตือนเมื่อยางเส้นใดวิ่งครบ ${formatNumber(threshold)} กม. และจะบอกล่วงหน้าเมื่อใกล้ครบภายใน ${soonDays} วัน`}
        />
      ) : (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th className={TH_LG}>เลขยาง</Th>
                <Th className={TH_LG}>ทะเบียน / ตำแหน่ง</Th>
                <Th className={TH_LG}>ระยะสะสม</Th>
                <Th className={TH_LG}>ที่มา</Th>
                <Th className={TH_LG}>ถึงเกณฑ์</Th>
              </tr>
            </thead>
            <tbody>
              {reached.length > 0 && (
                <>
                  <tr>
                    <td colSpan={5} className="bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800">
                      ครบเกณฑ์แล้ว — ควรวางแผนเปลี่ยน
                    </td>
                  </tr>
                  <AlertRows items={reached} threshold={threshold} tone="danger" />
                </>
              )}
              {soon.length > 0 && (
                <>
                  <tr>
                    <td colSpan={5} className="bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">
                      ใกล้ครบภายใน {soonDays} วัน — สั่งยางล่วงหน้าได้
                    </td>
                  </tr>
                  <AlertRows items={soon} threshold={threshold} tone="warn" />
                </>
              )}
            </tbody>
          </Table>
        </TableWrap>
      )}
      {reachedTotal > reached.length && (
        <Link
          href="/tires"
          className="block bg-surface-alt px-4 py-2.5 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
        >
          ดูยางทั้งหมดที่ครบเกณฑ์ {formatNumber(reachedTotal)} เส้น
        </Link>
      )}
    </Card>
  )
}
