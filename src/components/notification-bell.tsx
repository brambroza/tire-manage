'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, Bell, CheckCircle2, Gauge, Repeat, Ruler, Truck } from 'lucide-react'
// Gauge ใช้ทั้งหัวข้อ "ยางครบระยะสะสม" และไอคอนระยะของแต่ละแถว
import { TireThumb } from '@/components/tire-thumb'
import { TireSpec } from '@/components/tire-spec'
import { positionLabel } from '@/lib/axle-layouts'
import { cn, formatKm, formatKmApprox, formatNumber, formatThaiDate } from '@/lib/utils'
import type { NotificationFeed } from '@/lib/notifications'

/**
 * กระดิ่งแจ้งเตือนบน top bar
 * แสดงยางที่ถึงเกณฑ์ (วิ่งเกินระยะ หรือดอกยางต่ำ) พร้อมลิงก์ไปยังรายการเต็ม
 */
export function NotificationBell({ feed }: { feed: NotificationFeed }) {
  const [open, setOpen] = React.useState(false)
  const panelRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return

    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('touchstart', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('touchstart', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const {
    alerts, total, alertKm, alertTreadMm, vehicleAlerts, vehicleTotal, changeCount, changeDays,
    lifetimeAlerts, lifetimeTotal, alertLifetimeKm,
  } = feed
  /** ตัวเลขบนกระดิ่ง = ยางถึงเกณฑ์ + รถเปลี่ยนยางบ่อย + ยางครบระยะสะสม */
  const badgeTotal = total + vehicleTotal + lifetimeTotal
  const hasAlerts = badgeTotal > 0

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={hasAlerts ? `การแจ้งเตือน ${badgeTotal} รายการ` : 'การแจ้งเตือน'}
        aria-expanded={open}
        className={cn(
          'relative flex size-11 items-center justify-center rounded-xl transition-colors',
          open ? 'bg-brand-100 text-brand-700' : 'text-ink-500 hover:bg-brand-50 hover:text-brand-600',
        )}
      >
        <Bell className="size-5.5" />
        {hasAlerts && (
          <span
            className={cn(
              'absolute -right-0.5 -top-0.5 flex min-w-5 items-center justify-center rounded-full',
              'bg-rose-600 px-1.5 text-[11px] font-bold text-white ring-2 ring-white',
            )}
          >
            {badgeTotal > 99 ? '99+' : badgeTotal}
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'animate-fade-up absolute right-0 top-full z-40 mt-2 w-[min(24rem,calc(100vw-2rem))]',
            'overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-lift)]',
          )}
          role="dialog"
          aria-label="การแจ้งเตือน"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div>
              <p className="text-[15px] font-semibold text-ink-900">การแจ้งเตือน</p>
              <p className="text-xs text-ink-400">
                เกินระยะ {formatNumber(alertKm)} กม. หรือดอกยาง ≤ {alertTreadMm} มม.
              </p>
            </div>
            {hasAlerts && (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-800 ring-1 ring-inset ring-rose-300">
                {formatNumber(badgeTotal)} รายการ
              </span>
            )}
          </div>

          {/* ยางครบระยะสะสม — ขึ้นบนสุดเพราะหมายถึงต้องสั่งยางมาเปลี่ยน */}
          {alertLifetimeKm !== null && lifetimeAlerts.length > 0 && (
            <div className="border-b border-line">
              <p className="flex items-center gap-1.5 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800">
                <Gauge className="size-3.5" />
                ยางครบระยะสะสม · วิ่งครบ {formatNumber(alertLifetimeKm)} กม.
              </p>
              <ul className="divide-y divide-line">
                {lifetimeAlerts.map((a) => (
                  <li key={a.tireId}>
                    <Link
                      href={`/tires/${a.tireId}`}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 border-l-4 border-rose-600 bg-rose-50/40 px-4 py-3 transition-colors hover:bg-rose-100/60"
                    >
                      <TireThumb
                        src={a.imageUrl}
                        alt={[a.brandName, a.modelName].filter(Boolean).join(' ')}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-ink-900">{a.serialNo}</p>
                        <TireSpec
                          size={a.size}
                          brandName={a.brandName}
                          modelName={a.modelName}
                          className="mt-1"
                          sizeClassName="text-sm"
                        />
                        <p className="truncate text-sm text-ink-700">
                          <span className="font-semibold text-ink-900">{a.plateNo ?? 'อยู่ในคลัง'}</span>
                          {a.plateNo && ` · ${positionLabel(a.positionCode, a.vehicleAxleType)}`}
                        </p>
                        <p className="text-sm font-semibold text-rose-700">
                          {formatKmApprox(a.lifetimeKm, a.isEstimated)}
                          {/* ลูกค้าถามเองว่าตัวเลขมาจากไหน — ต้องบอกทุกครั้งที่เป็นค่าประมาณ */}
                          {a.isMileageStale ? (
                            <span className="ml-1.5 font-normal text-amber-700">· ต้องยืนยันเลขไมล์</span>
                          ) : a.isEstimated ? (
                            <span className="ml-1.5 font-normal text-ink-400">· ประมาณการ</span>
                          ) : null}
                        </p>
                      </div>
                      <AlertTriangle className="size-4 shrink-0 text-rose-600" />
                    </Link>
                  </li>
                ))}
              </ul>
              {lifetimeTotal > lifetimeAlerts.length && (
                <Link
                  href="/dashboard#lifetime-alerts"
                  onClick={() => setOpen(false)}
                  className="block bg-surface-alt px-4 py-2 text-center text-xs font-medium text-brand-700 hover:bg-brand-50"
                >
                  ดูทั้งหมด {formatNumber(lifetimeTotal)} เส้น
                </Link>
              )}
            </div>
          )}

          {/* รถเปลี่ยนยางบ่อย — ขึ้นก่อนเพราะชี้ปัญหาที่ตัวรถ ไม่ใช่ยางเส้นเดียว */}
          {vehicleAlerts.length > 0 && (
            <div className="border-b border-line">
              <p className="flex items-center gap-1.5 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-800">
                <Repeat className="size-3.5" />
                รถเปลี่ยนยางบ่อย · ถอดยาง ≥ {changeCount} ครั้งใน {changeDays} วัน
              </p>
              <ul className="divide-y divide-line">
                {vehicleAlerts.map((v) => (
                  <li key={v.vehicleId}>
                    <Link
                      href={`/vehicles/${v.vehicleId}`}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 border-l-4 border-rose-600 bg-rose-50/40 px-4 py-3 transition-colors hover:bg-rose-100/60"
                    >
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
                        <Truck className="size-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-ink-900">
                          {v.plateNo} <span className="font-normal text-ink-400">{v.province}</span>
                        </p>
                        <p className="text-xs font-semibold text-rose-700">
                          ถอดยาง {formatNumber(v.changeCount)} ครั้ง · ล่าสุด {formatThaiDate(v.lastEventDate)}
                        </p>
                      </div>
                      <AlertTriangle className="size-4 shrink-0 text-rose-600" />
                    </Link>
                  </li>
                ))}
              </ul>
              {vehicleTotal > vehicleAlerts.length && (
                <Link
                  href="/vehicles"
                  onClick={() => setOpen(false)}
                  className="block bg-surface-alt px-4 py-2 text-center text-xs font-medium text-brand-700 hover:bg-brand-50"
                >
                  ดูรถทั้งหมด {formatNumber(vehicleTotal)} คัน
                </Link>
              )}
            </div>
          )}

          {alerts.length === 0 ? (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <CheckCircle2 className="size-10 text-emerald-500" />
              <p className="mt-3 text-[15px] font-medium text-ink-700">
                {vehicleAlerts.length > 0 ? 'ไม่มียางที่ถึงเกณฑ์' : 'ไม่มีการแจ้งเตือน'}
              </p>
              <p className="mt-1 text-sm text-ink-500">ยางทุกเส้นยังอยู่ในเกณฑ์ที่กำหนด</p>
            </div>
          ) : (
            <>
              <ul className="max-h-[60dvh] divide-y divide-line overflow-y-auto">
                {alerts.map((a) => (
                  <li key={a.tireId}>
                    <Link
                      href={`/tires/${a.tireId}`}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex items-start gap-3 border-l-4 px-4 py-3 transition-colors',
                        a.kind === 'tread'
                          ? 'border-rose-500 bg-rose-50/60 hover:bg-rose-100/60'
                          : 'border-amber-500 bg-amber-50/60 hover:bg-amber-100/60',
                      )}
                    >
                      <TireThumb
                        src={a.imageUrl}
                        alt={[a.brandName, a.modelName].filter(Boolean).join(' ')}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-medium text-ink-900">{a.serialNo}</p>
                        <TireSpec
                          size={a.size}
                          brandName={a.brandName}
                          modelName={a.modelName}
                          className="mt-1"
                          sizeClassName="text-sm"
                        />
                        <p className="truncate text-sm text-ink-700">
                          <span className="font-semibold text-ink-900">{a.plateNo ?? '-'}</span>
                          {' · '}{positionLabel(a.positionCode, a.vehicleAxleType)}
                        </p>
                        <p
                          className={cn(
                            'mt-1 inline-flex items-center gap-1.5 text-xs font-semibold',
                            a.kind === 'tread' ? 'text-rose-700' : 'text-amber-700',
                          )}
                        >
                          {a.kind === 'tread' ? (
                            <>
                              <Ruler className="size-3.5" />
                              ดอกยางเหลือ {a.treadMm} มม.
                            </>
                          ) : (
                            <>
                              <Gauge className="size-3.5" />
                              วิ่งแล้ว {formatKm(a.currentRunKm)} ในรอบนี้
                            </>
                          )}
                        </p>
                      </div>
                      <AlertTriangle
                        className={cn(
                          'mt-0.5 size-4 shrink-0',
                          a.kind === 'tread' ? 'text-rose-500' : 'text-amber-500',
                        )}
                      />
                    </Link>
                  </li>
                ))}
              </ul>

              <Link
                href="/tires?status=alert"
                onClick={() => setOpen(false)}
                className="block border-t border-line bg-surface-alt px-4 py-3 text-center text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                ดูทั้งหมด {formatNumber(total)} เส้น
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  )
}
