'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, ClipboardPaste, ScanBarcode, Trash2, X } from 'lucide-react'
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Textarea,
} from '@/components/ui'
import { Modal } from '@/components/ui/modal'
import { SERIAL_MAX, SERIAL_PATTERN, cn, formatNumber, toUpperText } from '@/lib/utils'
import {
  IMPORT_NOTE_MAX, MAX_IMPORT_ROWS, isOtherBrand, normalizeImportSerial, scanBatchName,
  type TireImportRow,
} from '@/lib/tire-import'
import {
  commitTireImport, previewTireImport, type TireImportCommitResult,
} from '../../import-actions'

/** รุ่นยางที่เลือกได้ (เฉพาะที่ super admin เปิดสิทธิ์) */
export interface ScanModelOption {
  id: string
  brand: string
  model: string
  size: string
}

/** ซีรีย์ 1 เส้นในรายการรอบันทึก */
interface SerialItem {
  serial: string
  /** ผลตรวจ — null = ยังไม่ได้ตรวจกับระบบ */
  status: 'ok' | 'error' | null
  message: string | null
}

/**
 * ตรวจรูปแบบซีรีย์ฝั่ง client (ตรงกับกฎของการนำเข้าไฟล์) เพื่อแจ้งทันทีตอนสแกน
 * @param serial ซีรีย์ที่แปลงเป็นตัวพิมพ์ใหญ่แล้ว
 * @returns ข้อความปัญหา หรือ null ถ้าผ่าน
 */
function localSerialError(serial: string): string | null {
  if (serial.length > SERIAL_MAX) return `ยาวเกิน ${SERIAL_MAX} ตัว`
  if (!SERIAL_PATTERN.test(serial)) return 'ใช้ได้เฉพาะ A-Z 0-9 และขีด'
  return null
}

/**
 * แยกข้อความที่วางมาเป็นซีรีย์หลายตัว — คั่นด้วยขึ้นบรรทัดใหม่ จุลภาค เซมิโคลอน หรือแท็บ
 * (ไม่แยกด้วยช่องว่าง เพื่อให้ซีรีย์ที่มีช่องว่างติดมาถูกแจ้งว่าผิดรูปแบบ แทนที่จะกลายเป็น 2 เส้น)
 * @param text ข้อความที่วาง
 */
function splitSerials(text: string): string[] {
  return text.split(/[\r\n,;\t]+/).map((s) => s.trim()).filter(Boolean)
}

/**
 * หน้าคีย์/สแกนซีรีย์ยางใหม่: เลือกยี่ห้อ → รุ่น/ขนาด แล้วสแกนทีละเส้น (เครื่องสแกนส่ง Enter) หรือวางหลายซีรีย์
 * @param models รุ่นที่บริษัทได้รับสิทธิ์
 */
export function ScanSerialClient({ models }: { models: ScanModelOption[] }) {
  const router = useRouter()
  const brands = React.useMemo(() => [...new Set(models.map((m) => m.brand))], [models])

  const [brand, setBrand] = React.useState(brands[0] ?? '')
  const brandModels = React.useMemo(() => models.filter((m) => m.brand === brand), [models, brand])
  const [modelId, setModelId] = React.useState(brandModels[0]?.id ?? '')
  const selected = models.find((m) => m.id === modelId) ?? null
  const otherBrand = isOtherBrand(selected?.brand)

  const [note, setNote] = React.useState('')
  const [items, setItems] = React.useState<SerialItem[]>([])
  const [input, setInput] = React.useState('')
  const [notice, setNotice] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [checked, setChecked] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [pasteOpen, setPasteOpen] = React.useState(false)
  const [pasteText, setPasteText] = React.useState('')
  const [result, setResult] = React.useState<TireImportCommitResult | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const okCount = items.filter((i) => i.status === 'ok').length
  const errorCount = items.filter((i) => i.status === 'error').length

  /** เปลี่ยนรุ่น/ยี่ห้อ/หมายเหตุ/รายการ ต้องตรวจใหม่ก่อนบันทึก */
  function invalidate() {
    setChecked(false)
    setItems((list) =>
      list.map((i) => {
        const local = localSerialError(i.serial)
        return { ...i, status: local ? 'error' : null, message: local }
      }),
    )
  }

  /**
   * เลือกยี่ห้อ แล้วเลือกรุ่นแรกของยี่ห้อนั้นให้อัตโนมัติ
   * @param next ชื่อยี่ห้อ
   */
  function changeBrand(next: string) {
    setBrand(next)
    setModelId(models.find((m) => m.brand === next)?.id ?? '')
    invalidate()
  }

  /**
   * เพิ่มซีรีย์เข้ารายการ — ตัดตัวซ้ำในรายการทิ้ง และแจ้งจำนวนที่ข้าม
   * @param raw ซีรีย์ดิบ
   */
  function addSerials(raw: string[]) {
    setError(null)
    const existing = new Set(items.map((i) => i.serial))
    const added: SerialItem[] = []
    let duplicates = 0
    for (const r of raw) {
      const serial = normalizeImportSerial(r)
      if (!serial) continue
      if (existing.has(serial)) {
        duplicates += 1
        continue
      }
      existing.add(serial)
      const local = localSerialError(serial)
      added.push({ serial, status: local ? 'error' : null, message: local })
    }
    const room = MAX_IMPORT_ROWS - items.length
    const accepted = added.slice(0, Math.max(0, room))
    // เส้นใหม่ขึ้นบนสุด จะได้เห็นทันทีว่าสแกนติด
    setItems((list) => [...accepted.reverse(), ...list])
    if (accepted.length > 0) setChecked(false)

    const parts: string[] = []
    if (accepted.length > 0) parts.push(`เพิ่ม ${formatNumber(accepted.length)} เส้น`)
    if (duplicates > 0) parts.push(`ซ้ำในรายการ ${formatNumber(duplicates)} เส้น (ข้าม)`)
    if (added.length > accepted.length) parts.push(`เกิน ${formatNumber(MAX_IMPORT_ROWS)} เส้นต่อรอบ — บันทึกรอบนี้ก่อน`)
    setNotice(parts.join(' · ') || null)
  }

  /** Enter จากคีย์บอร์ดหรือเครื่องสแกน = เพิ่ม 1 เส้น (วางหลายบรรทัดในช่องนี้ก็แยกให้) */
  function submitInput(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim()) return
    addSerials(splitSerials(input))
    setInput('')
    inputRef.current?.focus()
  }

  /**
   * ลบซีรีย์ออกจากรายการ
   * @param serial ซีรีย์ที่จะลบ
   */
  function removeSerial(serial: string) {
    setItems((list) => list.filter((i) => i.serial !== serial))
  }

  /** แปลงรายการเป็นแถวแบบเดียวกับไฟล์นำเข้า เพื่อใช้ขั้นตอนตรวจ/บันทึกชุดเดียวกัน */
  function toRows(): TireImportRow[] {
    if (!selected) return []
    return [...items].reverse().map((i, index) => ({
      rowNo: index + 1,
      brand: selected.brand,
      model: selected.model,
      size: selected.size,
      serial: i.serial,
      note: otherBrand ? toUpperText(note.trim()) : '',
    }))
  }

  /** ตรวจกับระบบ: ซีรีย์ซ้ำในระบบ / รูปแบบ / รุ่นที่ได้รับสิทธิ์ */
  async function check() {
    if (busy || !selected || items.length === 0) return
    if (otherBrand && !note.trim()) {
      setError('ยี่ห้อ "อื่นๆ" ต้องกรอกหมายเหตุว่ายี่ห้อ/รุ่นที่พิมพ์บนยางคืออะไร')
      return
    }
    setBusy(true)
    setError(null)
    const rows = toRows()
    const res = await previewTireImport(rows)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    const bySerial = new Map((res.data?.rows ?? []).map((r) => [r.serial, r]))
    setItems((list) =>
      list.map((i) => {
        const r = bySerial.get(i.serial)
        return r ? { ...i, status: r.status, message: r.message } : i
      }),
    )
    setChecked(true)
  }

  /** บันทึกเฉพาะเส้นที่ผ่าน เข้าคลังยางใหม่ */
  async function save() {
    if (busy || !selected || okCount === 0) return
    setBusy(true)
    setError(null)
    const res = await commitTireImport(
      toRows(),
      undefined,
      scanBatchName(selected.brand, selected.model, selected.size),
    )
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setResult(res.data ?? null)
    router.refresh()
  }

  /** เริ่มรอบใหม่ — คงยี่ห้อ/รุ่นเดิมไว้ เพราะมักสแกนรุ่นเดิมต่อ */
  function startOver() {
    setItems([])
    setResult(null)
    setChecked(false)
    setNotice(null)
    setError(null)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  if (models.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={<ScanBarcode className="size-7" />}
          title="ยังไม่มีรุ่นยางที่บริษัทใช้ได้"
          description="ต้องมีรุ่นยางก่อนถึงจะเพิ่มซีรีย์ได้ แจ้ง Dreammaker เปิดรุ่นให้บริษัท"
        />
      </Card>
    )
  }

  if (result) {
    return (
      <Card>
        <CardBody className="flex flex-col items-center py-12 text-center">
          <span className="flex size-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="size-8" strokeWidth={3} />
          </span>
          <p className="mt-4 text-xl font-semibold text-ink-900">
            บันทึกยางใหม่เรียบร้อย {formatNumber(result.inserted)} เส้น
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {selected ? `${selected.brand} ${selected.model} ${selected.size}` : ''}
            {result.skipped > 0 ? ` · ข้ามที่ติดปัญหา ${formatNumber(result.skipped)} เส้น` : ''}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button className="min-h-12" onClick={startOver}>
              <ScanBarcode className="size-5" />
              เพิ่มซีรีย์ต่อ
            </Button>
            <Link
              href={result.importId ? `/tires/import?batch=${result.importId}` : '/tires/import'}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line bg-white px-5 text-[15px] font-medium text-ink-700 hover:bg-brand-50"
            >
              ดูรายการที่บันทึกรอบนี้
            </Link>
          </div>
        </CardBody>
      </Card>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* ------------------------------------------------ เลือกรุ่น + สแกน */}
      <Card className="lg:col-span-2">
        <CardHeader title="1. เลือกยี่ห้อและรุ่นยาง" description="เลือกได้เฉพาะรุ่นที่อยู่ในเมนูข้อมูลยาง" />
        <CardBody className="space-y-5">
          <Field label="ยี่ห้อ" required>
            <Select value={brand} onChange={(e) => changeBrand(e.target.value)}>
              {brands.map((b) => <option key={b} value={b}>{b}</option>)}
            </Select>
          </Field>
          <Field label="รุ่น / ขนาด" required>
            <Select value={modelId} onChange={(e) => { setModelId(e.target.value); invalidate() }}>
              {brandModels.map((m) => (
                <option key={m.id} value={m.id}>{[m.model, m.size].filter(Boolean).join(' · ')}</option>
              ))}
            </Select>
          </Field>
          {otherBrand && (
            <Field label="หมายเหตุ (ยี่ห้อ/รุ่นบนยาง)" required hint="ใช้กับทุกเส้นในรอบนี้">
              <Input
                value={note}
                maxLength={IMPORT_NOTE_MAX}
                onChange={(e) => { setNote(toUpperText(e.target.value)); invalidate() }}
                placeholder="เช่น DOUBLE COIN RR202"
              />
            </Field>
          )}
        </CardBody>

        <CardHeader title="2. สแกนหรือคีย์ซีรีย์" description="ยิงบาร์โค้ดต่อกันได้เลย หรือพิมพ์แล้วกด Enter" className="border-t" />
        <CardBody className="space-y-3">
          <form onSubmit={submitInput} className="flex gap-2">
            <Input
              ref={inputRef}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="สแกน / พิมพ์ซีรีย์ แล้วกด Enter"
              className="font-mono text-lg"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              aria-label="ซีรีย์ยาง"
            />
            <Button type="submit" className="shrink-0" disabled={!input.trim()}>เพิ่ม</Button>
          </form>
          <Button type="button" variant="secondary" className="w-full" onClick={() => setPasteOpen(true)}>
            <ClipboardPaste className="size-4.5" />
            วางหลายซีรีย์พร้อมกัน
          </Button>
          {notice && <p className="text-sm text-ink-500">{notice}</p>}
        </CardBody>
      </Card>

      {/* ------------------------------------------------ รายการรอบันทึก */}
      <Card className="lg:col-span-3">
        <CardHeader
          title={`3. ตรวจสอบและบันทึก · ${formatNumber(items.length)} เส้น`}
          description={
            checked
              ? `ผ่าน ${formatNumber(okCount)} · ติดปัญหา ${formatNumber(errorCount)} — บันทึกเฉพาะเส้นที่ผ่าน`
              : 'กดตรวจสอบก่อนบันทึก ระบบจะเช็กซีรีย์ซ้ำกับที่มีอยู่แล้ว'
          }
          action={
            items.length > 0 && (
              <button
                type="button"
                onClick={() => { setItems([]); setChecked(false); setNotice(null) }}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-ink-500 hover:bg-rose-50 hover:text-rose-600"
              >
                <Trash2 className="size-4" />
                ล้างทั้งหมด
              </button>
            )
          }
        />
        {error && (
          <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {items.length === 0 ? (
          <EmptyState icon={<ScanBarcode className="size-6" />} title="ยังไม่มีซีรีย์" description="สแกนหรือคีย์ซีรีย์ทางซ้าย รายการจะขึ้นที่นี่" />
        ) : (
          <ul className="max-h-[28rem] divide-y divide-line overflow-y-auto">
            {items.map((i) => (
              <li
                key={i.serial}
                className={cn(
                  'flex items-center gap-3 px-5 py-2.5',
                  i.status === 'error' && 'bg-rose-50',
                  i.status === 'ok' && 'bg-emerald-50/60',
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-[15px] font-semibold text-ink-900">{i.serial}</span>
                  {i.message && <span className="block text-[13px] text-rose-700">{i.message}</span>}
                </span>
                {i.status === 'ok' && <Badge tone="emerald">ผ่าน</Badge>}
                <button
                  type="button"
                  onClick={() => removeSerial(i.serial)}
                  aria-label={`ลบ ${i.serial}`}
                  className="flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <X className="size-4.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap justify-end gap-3 border-t border-line px-5 py-4">
          <Button variant="secondary" onClick={check} loading={busy && !checked} disabled={items.length === 0 || !selected}>
            ตรวจสอบ
          </Button>
          <Button variant="success" onClick={save} loading={busy && checked} disabled={!checked || okCount === 0}>
            <Check className="size-4.5" strokeWidth={3} />
            บันทึกยางใหม่ {checked ? `${formatNumber(okCount)} เส้น` : ''}
          </Button>
        </div>
      </Card>

      <Modal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        title="วางหลายซีรีย์พร้อมกัน"
        description="บรรทัดละหนึ่งซีรีย์ หรือคั่นด้วยจุลภาค ก๊อปจาก Excel มาวางได้เลย"
        footer={
          <>
            <Button variant="secondary" onClick={() => setPasteOpen(false)}>ยกเลิก</Button>
            <Button
              onClick={() => {
                addSerials(splitSerials(pasteText))
                setPasteText('')
                setPasteOpen(false)
              }}
              disabled={!pasteText.trim()}
            >
              เพิ่ม {formatNumber(splitSerials(pasteText).length)} ซีรีย์
            </Button>
          </>
        }
      >
        <Textarea
          rows={10}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          className="font-mono"
          placeholder={'CS2410001\nCS2410002\nCS2410003'}
        />
      </Modal>
    </div>
  )
}
