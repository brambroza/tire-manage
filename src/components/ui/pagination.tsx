'use client'

import * as React from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'

/** ค่า page size ที่เลือกได้ — 'all' คือแสดงทั้งหมดในหน้าเดียว */
export type PageSize = 5 | 10 | 20 | 'all'

export const PAGE_SIZE_OPTIONS: PageSize[] = [10, 20, 'all']
/** ตัวเลือกสำหรับตารางสรุปบนหน้า dashboard ที่ต้องการค่าเริ่มต้นน้อย */
export const SMALL_PAGE_SIZE_OPTIONS: PageSize[] = [5, 10, 20, 'all']
export const DEFAULT_PAGE_SIZE: PageSize = 10

export interface PaginationState<T> {
  /** รายการเฉพาะหน้าปัจจุบัน — เอาไป map แสดงในตาราง */
  pageItems: T[]
  page: number
  pageCount: number
  pageSize: PageSize
  total: number
  setPage: (page: number) => void
  setPageSize: (size: PageSize) => void
}

/**
 * แบ่งหน้ารายการฝั่ง client — ค่าเริ่มต้น 10 รายการ/หน้า
 * รีเซ็ตกลับหน้าแรกอัตโนมัติเมื่อจำนวนรายการหรือ page size เปลี่ยน
 */
export function usePagination<T>(
  items: T[],
  initialPageSize: PageSize = DEFAULT_PAGE_SIZE,
): PaginationState<T> {
  const [page, setPageRaw] = React.useState(1)
  const [pageSize, setPageSizeRaw] = React.useState<PageSize>(initialPageSize)
  const [prevTotal, setPrevTotal] = React.useState(items.length)

  const total = items.length

  // จำนวนรายการเปลี่ยน (เช่น ค้นหาใหม่) กลับไปหน้าแรก — ปรับ state ระหว่าง render ตามแนวทาง React
  if (prevTotal !== total) {
    setPrevTotal(total)
    setPageRaw(1)
  }
  const pageCount = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(total / pageSize))

  // เมื่อ filter/search ทำให้รายการลดลงจนหน้าปัจจุบันเกินขอบ ให้ถอยกลับหน้าสุดท้าย
  const safePage = Math.min(page, pageCount)

  const pageItems = React.useMemo(() => {
    if (pageSize === 'all') return items
    const start = (safePage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [items, safePage, pageSize])

  const setPage = React.useCallback(
    (next: number) => setPageRaw(Math.min(Math.max(1, next), pageCount)),
    [pageCount],
  )

  const setPageSize = React.useCallback((size: PageSize) => {
    setPageSizeRaw(size)
    setPageRaw(1)
  }, [])

  return { pageItems, page: safePage, pageCount, pageSize, total, setPage, setPageSize }
}

/** คำนวณเลขหน้าที่จะแสดงเป็นปุ่ม — โชว์หน้าแรก/สุดท้าย + รอบหน้าปัจจุบัน คั่นด้วย '…' */
export function pageNumbers(page: number, pageCount: number): Array<number | '…'> {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)
  const around = [page - 1, page, page + 1].filter((p) => p > 1 && p < pageCount)
  const out: Array<number | '…'> = [1]
  if (around[0] > 2) out.push('…')
  out.push(...around)
  if (around[around.length - 1] < pageCount - 1) out.push('…')
  out.push(pageCount)
  return out
}

const PAGE_BTN =
  'flex h-10 min-w-10 items-center justify-center rounded-lg px-2 text-sm font-medium transition-colors ' +
  'disabled:cursor-not-allowed disabled:opacity-40'

/**
 * แถบแบ่งหน้าใต้ตาราง — เลือกจำนวนต่อหน้า + ปุ่มเปลี่ยนหน้า
 * ซ่อนตัวเองเมื่อไม่มีรายการ
 */
export function Pagination<T>({
  state,
  className,
  itemLabel = 'รายการ',
  sizeOptions = PAGE_SIZE_OPTIONS,
}: {
  state: PaginationState<T>
  className?: string
  /** หน่วยนับ เช่น "บริษัท", "บัญชี" */
  itemLabel?: string
  /** ตัวเลือกจำนวนต่อหน้า — ค่าเริ่มต้น 10 / 20 / ทั้งหมด */
  sizeOptions?: PageSize[]
}) {
  const { page, pageCount, pageSize, total, setPage, setPageSize } = state
  if (total === 0) return null

  const from = pageSize === 'all' ? 1 : (page - 1) * pageSize + 1
  const to = pageSize === 'all' ? total : Math.min(page * pageSize, total)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3',
        className,
      )}
    >
      <div className="flex items-center gap-3 text-sm text-ink-500">
        <label className="flex items-center gap-2">
          <span>แสดง</span>
          <select
            aria-label="จำนวนต่อหน้า"
            value={String(pageSize)}
            onChange={(e) => setPageSize(e.target.value === 'all' ? 'all' : (Number(e.target.value) as PageSize))}
            className="h-10 rounded-lg border border-line bg-white px-2.5 text-sm text-ink-900 hover:border-brand-200 focus:border-brand-400 focus:outline-none focus:ring-4 focus:ring-brand-100"
          >
            {sizeOptions.map((opt) => (
              <option key={String(opt)} value={String(opt)}>
                {opt === 'all' ? 'ทั้งหมด' : opt}
              </option>
            ))}
          </select>
        </label>
        <span className="whitespace-nowrap">
          {formatNumber(from)}–{formatNumber(to)} จาก {formatNumber(total)} {itemLabel}
        </span>
      </div>

      {pageCount > 1 && (
        <nav aria-label="แบ่งหน้า" className="flex items-center gap-1">
          <button
            type="button"
            aria-label="หน้าก่อนหน้า"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className={cn(PAGE_BTN, 'text-ink-500 hover:bg-brand-50 hover:text-brand-600')}
          >
            <ChevronLeft className="size-4.5" />
          </button>
          {pageNumbers(page, pageCount).map((p, i) =>
            p === '…' ? (
              <span key={`gap-${i}`} className="px-1 text-ink-400">…</span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => setPage(p)}
                className={cn(
                  PAGE_BTN,
                  p === page
                    ? 'bg-brand-600 text-white'
                    : 'text-ink-600 hover:bg-brand-50 hover:text-brand-600',
                )}
              >
                {p}
              </button>
            ),
          )}
          <button
            type="button"
            aria-label="หน้าถัดไป"
            disabled={page >= pageCount}
            onClick={() => setPage(page + 1)}
            className={cn(PAGE_BTN, 'text-ink-500 hover:bg-brand-50 hover:text-brand-600')}
          >
            <ChevronRight className="size-4.5" />
          </button>
        </nav>
      )}
    </div>
  )
}
