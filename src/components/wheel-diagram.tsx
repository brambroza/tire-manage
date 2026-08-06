'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { getLayout, type WheelPosition } from '@/lib/axle-layouts'

export interface WheelSlot {
  /** ยางที่อยู่ในตำแหน่งนี้ (ถ้ามี) */
  tireId: string
  serialNo: string
  treadMm: number | null
  /** ระยะวิ่งสะสมของยางเส้นนี้ (กม.) */
  lifetimeKm: number
  /** true = เกินเกณฑ์แจ้งเตือนของบริษัท */
  alert: boolean
}

export interface WheelDiagramProps {
  axleType: string | null | undefined
  /** map position_code -> ยางที่ติดตั้งอยู่ */
  slots: Record<string, WheelSlot>
  selected?: string | null
  onSelect?: (position: WheelPosition, slot?: WheelSlot) => void
  /**
   * unmount = เลือกได้เฉพาะตำแหน่งที่มียาง
   * mount   = เลือกได้เฉพาะตำแหน่งว่าง
   * view    = ดูอย่างเดียว
   */
  mode?: 'unmount' | 'mount' | 'view'
  /**
   * โหมด unmount: ให้แตะตำแหน่งว่างได้ด้วย
   * ใช้กรณีหน้างานมียางอยู่จริงแต่ยังไม่มีข้อมูลในระบบ แล้วช่างจะคีย์ข้อมูลเอง
   */
  allowEmpty?: boolean
  className?: string
}

/** สถานะสีของปุ่มล้อ 1 ตำแหน่ง */
type WheelTone = 'selected' | 'alert' | 'mounted' | 'empty'

/**
 * แผนผังตำแหน่งล้อ (มุมมองจากด้านบน) ให้ช่างกดเลือกตำแหน่งได้โดยตรง
 * จัดวางเป็นแถวตามเพลา ซ้าย–ตัวรถ–ขวา เพื่อให้อ่านง่ายและกดด้วยนิ้วบน iPad ได้สบาย
 */
export function WheelDiagram({
  axleType,
  slots,
  selected,
  onSelect,
  mode = 'view',
  allowEmpty = false,
  className,
}: WheelDiagramProps) {
  const layout = getLayout(axleType)
  const axles = [...new Set(layout.positions.map((p) => p.axle))]

  const isSelectable = (code: string) => {
    if (mode === 'view' || !onSelect) return false
    if (mode === 'mount') return !slots[code]
    return allowEmpty || Boolean(slots[code])
  }

  return (
    <div className={cn('w-full', className)}>
      <div className="relative overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-brand-50/50 via-white to-white p-3 sm:p-4">
        {/* โครงรถเป็นพื้นหลัง วางไว้กึ่งกลางระหว่างล้อซ้าย–ขวา */}
        <TruckBackdrop />

        <p className="relative mb-2 text-center text-[11px] font-medium uppercase tracking-wide text-brand-500">
          ▲ หน้ารถ
        </p>

        <div className="relative space-y-2.5">
          {axles.map((axleNo) => {
            const row = layout.positions.filter((p) => p.axle === axleNo)
            return (
              <div key={axleNo} className="relative">
                {/* คานเพลา */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-6 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-slate-200"
                />
                <div className="relative flex items-center justify-center gap-1.5 sm:gap-2">
                  <div className="flex flex-1 justify-end gap-1.5 sm:gap-2">
                    {row
                      .filter((p) => p.side === 'L')
                      .map((pos) => (
                        <WheelButton
                          key={pos.code}
                          pos={pos}
                          slot={slots[pos.code]}
                          active={selected === pos.code}
                          selectable={isSelectable(pos.code)}
                          viewOnly={mode === 'view'}
                          onSelect={onSelect}
                        />
                      ))}
                  </div>

                  {/* ป้ายเลขเพลาบนตัวถัง */}
                  <span className="flex w-16 shrink-0 justify-center sm:w-20">
                    <span className="flex size-7 items-center justify-center rounded-full bg-white text-[11px] font-semibold text-ink-400 ring-1 ring-line">
                      {axleNo}
                    </span>
                  </span>

                  <div className="flex flex-1 justify-start gap-1.5 sm:gap-2">
                    {row
                      .filter((p) => p.side === 'R')
                      .map((pos) => (
                        <WheelButton
                          key={pos.code}
                          pos={pos}
                          slot={slots[pos.code]}
                          active={selected === pos.code}
                          selectable={isSelectable(pos.code)}
                          viewOnly={mode === 'view'}
                          onSelect={onSelect}
                        />
                      ))}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <Legend mode={mode} allowEmpty={allowEmpty} />
    </div>
  )
}

/** ปุ่มเลือกล้อ 1 ตำแหน่ง — พื้นที่กดกว้างพอสำหรับนิ้ว (>= 44px) */
function WheelButton({
  pos,
  slot,
  active,
  selectable,
  viewOnly,
  onSelect,
}: {
  pos: WheelPosition
  slot?: WheelSlot
  active: boolean
  selectable: boolean
  viewOnly: boolean
  onSelect?: WheelDiagramProps['onSelect']
}) {
  const tone: WheelTone = active ? 'selected' : slot ? (slot.alert ? 'alert' : 'mounted') : 'empty'

  return (
    <button
      type="button"
      disabled={!selectable && !viewOnly}
      onClick={() => selectable && onSelect?.(pos, slot)}
      title={`${pos.label}${slot ? ` · ${slot.serialNo}` : ' · ว่าง'}`}
      aria-pressed={active}
      className={cn(
        'group relative flex w-[3.75rem] flex-col items-center gap-1 rounded-xl border px-1 py-2 sm:w-[4.5rem] sm:px-2 sm:py-2.5',
        'transition-all duration-150',
        tone === 'selected' &&
          'border-brand-600 bg-brand-600 text-white shadow-[0_12px_26px_-14px_rgba(13,110,224,1)]',
        tone === 'alert' && 'border-amber-300 bg-amber-50 text-amber-700',
        tone === 'mounted' && 'border-emerald-300 bg-emerald-50 text-emerald-700',
        tone === 'empty' && 'border-dashed border-slate-300 bg-white text-ink-400',
        selectable && !active && 'hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 active:scale-95',
        !selectable && !viewOnly && 'opacity-40',
      )}
    >
      {/* จุดเตือนเมื่อยางถึงเกณฑ์ */}
      {slot?.alert && !active && (
        <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-amber-500" />
      )}

      <TireGlyph filled={Boolean(slot)} />

      <span className="w-full truncate text-center text-[11px] font-semibold leading-tight sm:text-xs">
        {pos.shortLabel}
      </span>
      <span
        className={cn(
          'text-[10px] leading-none',
          active ? 'text-white/75' : 'opacity-70',
        )}
      >
        {slot ? (slot.treadMm !== null ? `${slot.treadMm} มม.` : '—') : 'ว่าง'}
      </span>
    </button>
  )
}

/** ไอคอนยางมองจากด้านข้าง — ใช้สีตามปุ่มที่ครอบอยู่ */
function TireGlyph({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 32" aria-hidden className="h-7 w-[1.3rem] sm:h-8 sm:w-6">
      <rect
        x="1.5" y="1.5" width="21" height="29" rx="7"
        fill="currentColor" fillOpacity={filled ? 0.16 : 0.06}
        stroke="currentColor" strokeWidth="2"
      />
      {filled && (
        <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55">
          <line x1="8" y1="7" x2="8" y2="25" />
          <line x1="16" y1="7" x2="16" y2="25" />
        </g>
      )}
    </svg>
  )
}

/** ภาพตัวรถมองจากด้านบน วางเป็นพื้นหลังตรงกลางผัง */
function TruckBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-y-6 left-1/2 w-16 -translate-x-1/2 sm:w-20"
    >
      {/* ห้องคนขับ */}
      <div className="h-10 rounded-t-2xl border border-b-0 border-brand-100 bg-brand-50/60">
        <div className="mx-auto mt-2.5 h-1 w-8 rounded-full bg-brand-100" />
      </div>
      {/* ตัวถัง */}
      <div className="h-[calc(100%-2.5rem)] rounded-b-2xl border border-brand-100/80 bg-gradient-to-b from-brand-50/40 to-white" />
    </div>
  )
}

function Legend({ mode, allowEmpty }: { mode: WheelDiagramProps['mode']; allowEmpty?: boolean }) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs text-ink-500">
        <LegendDot className="border-emerald-300 bg-emerald-50" label="มียางติดตั้ง" />
        <LegendDot className="border-amber-300 bg-amber-50" label="ถึงเกณฑ์เตือน" />
        <LegendDot className="border-dashed border-slate-300 bg-white" label="ตำแหน่งว่าง" />
      </div>
      {mode !== 'view' && (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-center text-xs font-medium text-brand-700">
          {mode === 'mount'
            ? 'แตะตำแหน่งว่างเพื่อใส่ยาง'
            : allowEmpty
              ? 'แตะล้อที่ต้องการถอด — ตำแหน่งว่างก็แตะได้ แล้วคีย์ข้อมูลยางเอง'
              : 'แตะล้อที่ต้องการถอด'}
        </p>
      )}
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn('size-3 rounded border-2', className)} />
      {label}
    </span>
  )
}
