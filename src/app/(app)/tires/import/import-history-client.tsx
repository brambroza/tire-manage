'use client'

import * as React from 'react'
import Link from 'next/link'
import { AlertTriangle, CircleDot, FileSpreadsheet, Layers, Search, Truck, Upload, X } from 'lucide-react'
import {
  Badge, Card, CardHeader, EmptyState, Input, Select, StatTile, Table, TableWrap, Td, Th,
} from '@/components/ui'
import { Pagination, usePagination } from '@/components/ui/pagination'
import { TIRE_STATUS_LABEL, TIRE_STATUS_TONE, cn, formatNumber, formatThaiDate } from '@/lib/utils'
import type { ImportBatchView, ImportHistory, ImportedTireView } from '@/lib/tire-import-history'
import type { TireStatus } from '@/lib/database.types'

const STATUS_OPTIONS: TireStatus[] = ['in_stock', 'mounted', 'retreading', 'scrapped']

/**
 * ข้อความค้นหาของยาง 1 เส้น (ตัวพิมพ์เล็ก) — ค้นได้ทั้งซีรีย์ ยี่ห้อ รุ่น ขนาด ทะเบียน และหมายเหตุ
 * @param t ยาง
 */
function searchText(t: ImportedTireView): string {
  return [t.serial, t.brand, t.model, t.size, t.plateNo, t.note].filter(Boolean).join(' ').toLowerCase()
}

/**
 * หน้าจอ "ข้อมูลยางใหม่" — สรุป, ประวัติรอบนำเข้า และรายการยางที่นำเข้าทั้งหมด (กรองตามรอบ/สถานะ/คำค้น)
 * @param history ข้อมูลจาก loadImportHistory
 * @param initialBatchId รอบที่เลือกไว้จาก ?batch= (เช่น กดมาจากขั้นนำเข้าเสร็จ)
 */
export function ImportHistoryClient({
  history,
  initialBatchId,
}: {
  history: ImportHistory
  initialBatchId: string
}) {
  const { batches, tires, hasImportLog, truncated } = history
  const [batchId, setBatchId] = React.useState(
    batches.some((b) => b.id === initialBatchId) ? initialBatchId : '',
  )
  const [status, setStatus] = React.useState<TireStatus | ''>('')
  const [query, setQuery] = React.useState('')
  const tableRef = React.useRef<HTMLDivElement>(null)

  const batchById = React.useMemo(() => new Map(batches.map((b) => [b.id, b])), [batches])
  const indexed = React.useMemo(() => tires.map((t) => ({ tire: t, text: searchText(t) })), [tires])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return indexed
      .filter(({ tire, text }) =>
        (!batchId || tire.batchId === batchId) &&
        (!status || tire.status === status) &&
        (!q || text.includes(q)),
      )
      .map(({ tire }) => tire)
  }, [indexed, batchId, status, query])

  const pagination = usePagination(filtered, 20)

  const counts = React.useMemo(() => {
    const c = { in_stock: 0, mounted: 0, other: 0 }
    for (const t of tires) {
      if (t.status === 'in_stock') c.in_stock += 1
      else if (t.status === 'mounted') c.mounted += 1
      else c.other += 1
    }
    return c
  }, [tires])

  /**
   * เลือกรอบจากตารางประวัติ แล้วเลื่อนลงไปที่รายการยาง
   * @param id รอบที่เลือก ('' = ทุกรอบ)
   */
  function pickBatch(id: string) {
    setBatchId(id)
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const hasFilter = Boolean(batchId || status || query)
  const selectedBatch = batchId ? batchById.get(batchId) : undefined

  if (batches.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<FileSpreadsheet className="size-7" />}
          title="ยังไม่เคยนำเข้ายางจากไฟล์"
          description="นำเข้าซีรีย์ยางใหม่จากไฟล์ Excel หรือ CSV แล้วรายการทั้งหมดจะแสดงที่หน้านี้"
          action={
            <Link
              href="/tires/import/new"
              className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-600 px-5 text-[15px] font-medium text-white hover:bg-brand-700"
            >
              <Upload className="size-5" />
              นำเข้าไฟล์ใหม่
            </Link>
          }
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {!hasImportLog && (
        <div className="flex items-start gap-2.5 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800 ring-1 ring-inset ring-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            ข้อมูลนี้หาจากหมายเหตุของยาง อาจไม่ครบทุกเส้น — ผู้ดูแลระบบต้องอัปเดตฐานข้อมูล (migration 014)
            เพื่อให้เก็บประวัติการนำเข้าครบทุกรอบ
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="นำเข้าทั้งหมด" value={formatNumber(tires.length)} unit="เส้น" icon={<CircleDot className="size-5" />} />
        <StatTile label="จำนวนรอบนำเข้า" value={formatNumber(batches.length)} unit="รอบ" tone="slate" icon={<Layers className="size-5" />} />
        <StatTile label="ยังอยู่ในคลัง" value={formatNumber(counts.in_stock)} unit="เส้น" tone="sky" icon={<CircleDot className="size-5" />} />
        <StatTile label="ติดรถแล้ว" value={formatNumber(counts.mounted)} unit="เส้น" tone="emerald" icon={<Truck className="size-5" />} />
      </div>

      {/* ------------------------------------------------ ประวัติรอบนำเข้า */}
      <Card>
        <CardHeader title="ประวัติการนำเข้า" description="กดที่รอบเพื่อดูรายการยางของรอบนั้น" />
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th>วันที่นำเข้า</Th>
                <Th>ไฟล์</Th>
                <Th>ผู้นำเข้า</Th>
                <Th className="text-right">นำเข้าได้</Th>
                <Th className="text-right">ข้าม</Th>
                <Th className="text-right">ดูรายการ</Th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <BatchRow key={b.id} batch={b} active={b.id === batchId} hasImportLog={hasImportLog} onPick={pickBatch} />
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </Card>

      {/* ------------------------------------------------ รายการยาง */}
      <div ref={tableRef} className="scroll-mt-20">
        <Card>
          <CardHeader
            title={selectedBatch ? `ยางจากไฟล์ ${selectedBatch.fileName}` : 'ยางที่นำเข้าทั้งหมด'}
            description={
              selectedBatch
                ? `นำเข้าเมื่อ ${formatThaiDate(selectedBatch.createdAt, hasImportLog)}`
                : 'สถานะเป็นสถานะปัจจุบันของยางแต่ละเส้น'
            }
          />
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-ink-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ค้นหาซีรีย์, ยี่ห้อ, รุ่น, ขนาด, ทะเบียนรถ..."
                className="pl-10"
                aria-label="ค้นหายางที่นำเข้า"
              />
            </div>
            <Select value={batchId} onChange={(e) => setBatchId(e.target.value)} className="sm:w-64" aria-label="รอบนำเข้า">
              <option value="">ทุกรอบ</option>
              {batches.map((b) => (
                <option key={b.id} value={b.id}>
                  {formatThaiDate(b.createdAt)} · {b.fileName}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as TireStatus | '')}
              className="sm:w-44"
              aria-label="สถานะ"
            >
              <option value="">ทุกสถานะ</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>{TIRE_STATUS_LABEL[s]}</option>
              ))}
            </Select>
            {hasFilter && (
              <button
                type="button"
                onClick={() => { setBatchId(''); setStatus(''); setQuery('') }}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-500 hover:bg-brand-50 hover:text-brand-700"
              >
                <X className="size-4" />
                ล้างตัวกรอง
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={<Search className="size-6" />} title="ไม่พบยางตามตัวกรอง" />
          ) : (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>ซีรีย์</Th>
                    <Th>ยี่ห้อ / รุ่น</Th>
                    <Th>ขนาด</Th>
                    <Th>สถานะ</Th>
                    <Th>ทะเบียนรถ</Th>
                    <Th className="text-right">ระยะสะสม (กม.)</Th>
                    <Th>วันที่นำเข้า</Th>
                    {!batchId && <Th>ไฟล์</Th>}
                  </tr>
                </thead>
                <tbody>
                  {pagination.pageItems.map((t) => (
                    <tr key={t.id} className="transition-colors hover:bg-brand-50/40">
                      <Td className="font-medium">
                        <Link href={`/tires/${t.id}`} className="text-brand-700 hover:underline">
                          {t.serial}
                        </Link>
                      </Td>
                      <Td>
                        <span className="text-ink-900">{t.brand ?? '-'}</span>
                        {t.model && <span className="text-ink-500"> · {t.model}</span>}
                      </Td>
                      <Td className="whitespace-nowrap">{t.size ?? '-'}</Td>
                      <Td>
                        <Badge tone={TIRE_STATUS_TONE[t.status]}>{TIRE_STATUS_LABEL[t.status]}</Badge>
                      </Td>
                      <Td className="whitespace-nowrap">{t.plateNo ?? '-'}</Td>
                      <Td className="text-right tabular-nums">{formatNumber(t.totalDistanceKm)}</Td>
                      <Td className="whitespace-nowrap text-ink-500">{formatThaiDate(t.createdAt)}</Td>
                      {!batchId && (
                        <Td className="max-w-56 truncate text-ink-500" title={batchById.get(t.batchId ?? '')?.fileName}>
                          {batchById.get(t.batchId ?? '')?.fileName ?? '-'}
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
          <Pagination state={pagination} itemLabel="เส้น" />
          {truncated && (
            <p className="border-t border-line px-4 py-3 text-sm text-amber-700">
              แสดงเฉพาะ {formatNumber(tires.length)} เส้นล่าสุด — ใช้หน้าคลังยางค้นหาเส้นที่เก่ากว่า
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}

/**
 * แถวรอบนำเข้า 1 รอบในตารางประวัติ
 * @param batch รอบนำเข้า
 * @param active รอบนี้ถูกเลือกอยู่
 * @param hasImportLog false = ข้อมูลจากหมายเหตุ ไม่มีเวลา/ผู้นำเข้า/จำนวนที่ข้าม
 * @param onPick เลือกรอบนี้
 */
function BatchRow({
  batch,
  active,
  hasImportLog,
  onPick,
}: {
  batch: ImportBatchView
  active: boolean
  hasImportLog: boolean
  onPick: (id: string) => void
}) {
  return (
    <tr
      onClick={() => onPick(active ? '' : batch.id)}
      className={cn('cursor-pointer transition-colors hover:bg-brand-50/40', active && 'bg-brand-50')}
    >
      <Td className="whitespace-nowrap">{formatThaiDate(batch.createdAt, hasImportLog)}</Td>
      <Td className="max-w-72">
        <span className="flex items-center gap-2">
          <FileSpreadsheet className="size-4 shrink-0 text-emerald-600" />
          <span className="truncate font-medium text-ink-900" title={batch.fileName}>{batch.fileName}</span>
        </span>
      </Td>
      <Td className="text-ink-500">{batch.importedByName ?? '-'}</Td>
      <Td className="text-right tabular-nums font-medium text-emerald-700">{formatNumber(batch.insertedCount)}</Td>
      <Td className="text-right tabular-nums text-ink-500">
        {hasImportLog ? formatNumber(batch.skippedCount) : '-'}
      </Td>
      <Td className="text-right">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onPick(active ? '' : batch.id) }}
          className={cn(
            'inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium',
            active ? 'bg-brand-600 text-white' : 'text-brand-700 hover:bg-brand-50',
          )}
        >
          {active ? 'กำลังดู' : 'ดูรายการ'}
        </button>
      </Td>
    </tr>
  )
}
