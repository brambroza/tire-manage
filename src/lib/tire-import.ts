/**
 * นำเข้าซีรีย์ยางจากไฟล์ (Excel / CSV) — ส่วนที่ไม่แตะฐานข้อมูล
 *
 * ใช้ร่วมกันทั้งฝั่ง client (อ่านไฟล์ + ตรวจรูปแบบก่อนส่ง) และ server action
 * (ตรวจซ้ำอีกรอบก่อนบันทึก ไม่เชื่อผลจาก client)
 */
import {
  SERIAL_MAX, SERIAL_PATTERN, SERIAL_PATTERN_MESSAGE, formatThaiDate,
} from '@/lib/utils'

/** 1 แถวในไฟล์นำเข้า (ค่าดิบที่ตัดช่องว่างหัวท้ายแล้ว) */
export interface TireImportRow {
  /** เลขแถวในไฟล์ (แถวหัวตาราง = 1) ใช้บอกผู้ใช้ว่าต้องแก้แถวไหน */
  rowNo: number
  brand: string
  model: string
  size: string
  serial: string
  dot: string
  note: string
}

/** คีย์ของคอลัมน์ข้อมูล (ไม่รวม rowNo) */
export type TireImportColumnKey = Exclude<keyof TireImportRow, 'rowNo'>

/** ชื่อยี่ห้อกลางสำหรับยางที่ไม่ระบุยี่ห้อ (สร้างโดย migration 010) */
export const OTHER_BRAND = 'อื่นๆ'

/** นำเข้าได้ครั้งละไม่เกินกี่แถว */
export const MAX_IMPORT_ROWS = 2000

/** หมายเหตุยาวได้ไม่เกินกี่ตัวอักษร */
export const IMPORT_NOTE_MAX = 200

/** ความยาวสูงสุดของยี่ห้อ/รุ่น/ขนาด/DOT ที่รับจากไฟล์ (กันเซลล์ขยะยาว ๆ) */
export const IMPORT_TEXT_MAX = 80

/** คำอธิบายคอลัมน์ในไฟล์ต้นแบบ — เรียงตามลำดับคอลัมน์ในไฟล์ */
export const IMPORT_TEMPLATE_COLUMNS: ReadonlyArray<{
  key: TireImportColumnKey
  /** หัวคอลัมน์ภาษาไทยในไฟล์ต้นแบบ */
  header: string
  /** true = ต้องกรอกทุกแถว, 'other' = บังคับเฉพาะเมื่อยี่ห้อเป็น "อื่นๆ" */
  required: boolean | 'other'
  hint: string
  /** ตัวอย่าง 2 แถวในไฟล์ต้นแบบ */
  examples: [string, string]
}> = [
  {
    key: 'brand',
    header: 'ยี่ห้อ',
    required: true,
    hint: 'ยี่ห้อในแคตตาล็อกที่บริษัทได้รับสิทธิ์ หรือ "อื่นๆ" — แพ็กเกจ Premium ใส่ยี่ห้อใหม่ได้ ระบบจะสร้างให้เป็นของบริษัท',
    examples: ['Michelin', OTHER_BRAND],
  },
  {
    key: 'model',
    header: 'รุ่น',
    required: true,
    hint: 'ชื่อรุ่นตามแคตตาล็อก หรือรุ่นใหม่ของบริษัท (Premium) · ยี่ห้อ "อื่นๆ" เว้นว่างได้',
    examples: ['X MULTI Z', OTHER_BRAND],
  },
  {
    key: 'size',
    header: 'ขนาด',
    required: true,
    hint: 'เช่น 295/80R22.5 หรือ 11R22.5',
    examples: ['295/80R22.5', '11R22.5'],
  },
  {
    key: 'serial',
    header: 'ซีรีย์',
    required: true,
    hint: `ตัวเลข/ตัวอักษรอังกฤษ/ขีด ไม่เกิน ${SERIAL_MAX} ตัว ห้ามซ้ำกับที่มีในระบบ`,
    examples: ['MX1234567', 'OT9988'],
  },
  {
    key: 'dot',
    header: 'DOT',
    required: false,
    hint: 'สัปดาห์/ปีผลิต เช่น 1224 (ไม่บังคับ)',
    examples: ['1224', ''],
  },
  {
    key: 'note',
    header: 'หมายเหตุ',
    required: 'other',
    hint: 'บังคับเมื่อยี่ห้อ = อื่นๆ — ระบุยี่ห้อ/รุ่นที่พิมพ์อยู่บนยาง',
    examples: ['', 'ยางจีน ยี่ห้อ DOUBLE COIN รุ่น RR202'],
  },
]

/**
 * หัวคอลัมน์ที่ยอมรับ (หลัง normalize) → คีย์ข้อมูล
 * รองรับทั้งไทยและอังกฤษ รวมคำที่ลูกค้ามักสะกดต่างกัน
 */
const HEADER_ALIASES: Record<string, TireImportColumnKey> = {
  'ยี่ห้อ': 'brand',
  'ยี่ห้อยาง': 'brand',
  'brand': 'brand',
  'รุ่น': 'model',
  'รุ่นยาง': 'model',
  'model': 'model',
  'ขนาด': 'size',
  'ขนาดยาง': 'size',
  'size': 'size',
  'ซีรีย์': 'serial',
  'ซีรี่ย์': 'serial',
  'ซีรีส์': 'serial',
  'ซีเรียล': 'serial',
  'เลขยาง': 'serial',
  'serial': 'serial',
  'serialno': 'serial',
  'serial_no': 'serial',
  'serialnumber': 'serial',
  'dot': 'dot',
  'หมายเหตุ': 'note',
  'note': 'note',
  'remark': 'note',
  'remarks': 'note',
}

/** คอลัมน์ที่ไฟล์ต้องมี (ไม่งั้นอ่านต่อไม่ได้) */
const REQUIRED_COLUMNS: TireImportColumnKey[] = ['brand', 'model', 'size', 'serial']

/**
 * ทำหัวคอลัมน์ให้เทียบได้ — ตัดช่องว่าง ดอกจัน วงเล็บ และตัวพิมพ์ใหญ่
 * เช่น "ซีรีย์ *" "Serial No." "ยี่ห้อ (brand)" → "ซีรีย์" "serialno" "ยี่ห้อ"
 * @param value หัวคอลัมน์ดิบ
 */
function normalizeHeader(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/[\s*.:：]/g, '')
}

/**
 * แปลงค่าในเซลล์เป็นข้อความที่ตัดช่องว่างแล้ว
 * ตัวเลขจาก Excel (เช่น DOT 1224 ที่ Excel มองเป็นตัวเลข) ต้องไม่กลายเป็น "1224.0" หรือ "1.2e3"
 * @param value ค่าดิบจากไลบรารีอ่านไฟล์
 */
export function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return ''
    return Number.isInteger(value) ? String(value) : value.toString()
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10)
  return String(value).trim()
}

/** ผลการอ่านตาราง — ถ้าหัวคอลัมน์ไม่ครบจะอ่านต่อไม่ได้ */
export type ParseMatrixResult =
  | { ok: true; rows: TireImportRow[] }
  | { ok: false; error: string }

/**
 * แปลงตารางดิบ (แถว × คอลัมน์) เป็นแถวนำเข้า — แถวแรกคือหัวตาราง ข้ามแถวว่าง
 *
 * หัวคอลัมน์จับคู่จากชื่อ ไม่ใช่ลำดับ ผู้ใช้จึงสลับคอลัมน์หรือมีคอลัมน์เกินได้
 * @param cells ตารางดิบจาก read-excel-file หรือ parseCsv
 */
export function parseImportMatrix(cells: unknown[][]): ParseMatrixResult {
  // หาแถวหัวตาราง = แถวแรกที่มีข้อความอย่างน้อย 1 เซลล์ (เผื่อผู้ใช้เว้นบรรทัดบนไว้)
  const headerIndex = cells.findIndex((row) => row.some((cell) => cellText(cell) !== ''))
  if (headerIndex === -1) {
    return { ok: false, error: 'ไฟล์ว่าง — ไม่พบหัวตาราง' }
  }

  const columnOf: Partial<Record<TireImportColumnKey, number>> = {}
  cells[headerIndex].forEach((cell, index) => {
    const key = HEADER_ALIASES[normalizeHeader(cellText(cell))]
    // ถ้าหัวซ้ำกัน ใช้คอลัมน์แรกที่เจอ
    if (key && columnOf[key] === undefined) columnOf[key] = index
  })

  const missing = REQUIRED_COLUMNS.filter((key) => columnOf[key] === undefined)
  if (missing.length > 0) {
    const names = missing
      .map((key) => IMPORT_TEMPLATE_COLUMNS.find((c) => c.key === key)?.header ?? key)
      .join(', ')
    return {
      ok: false,
      error: `ไฟล์ไม่มีคอลัมน์ ${names} — ใช้หัวตารางตามไฟล์ต้นแบบ (ยี่ห้อ | รุ่น | ขนาด | ซีรีย์ | DOT | หมายเหตุ)`,
    }
  }

  const read = (row: unknown[], key: TireImportColumnKey): string => {
    const index = columnOf[key]
    return index === undefined ? '' : cellText(row[index])
  }

  const rows: TireImportRow[] = []
  for (let i = headerIndex + 1; i < cells.length; i += 1) {
    const row = cells[i] ?? []
    const brand = read(row, 'brand').toUpperCase()
    const parsed: TireImportRow = {
      rowNo: i + 1,
      // ยี่ห้อและหมายเหตุของยาง "อื่นๆ" เก็บเป็นตัวพิมพ์ใหญ่เสมอ (กฎเดียวกับช่องพิมพ์ในแอป)
      brand,
      model: read(row, 'model'),
      size: read(row, 'size'),
      serial: read(row, 'serial'),
      dot: read(row, 'dot'),
      note: isOtherBrand(brand) ? read(row, 'note').toUpperCase() : read(row, 'note'),
    }
    const isEmpty =
      parsed.brand === '' && parsed.model === '' && parsed.size === '' &&
      parsed.serial === '' && parsed.dot === '' && parsed.note === ''
    if (!isEmpty) rows.push(parsed)
  }

  return { ok: true, rows }
}

/**
 * ยี่ห้อนี้คือ "อื่นๆ" หรือไม่ (ตัดช่องว่างทั้งหมดก่อนเทียบ เช่น "อื่น ๆ")
 * @param brand ชื่อยี่ห้อ
 */
export function isOtherBrand(brand: string | null | undefined): boolean {
  return (brand ?? '').replace(/\s+/g, '') === OTHER_BRAND
}

/**
 * แปลงซีรีย์เป็นรูปแบบมาตรฐานสำหรับเทียบ/บันทึก (ตัวพิมพ์ใหญ่ ตัดช่องว่างหัวท้าย)
 * ไม่ตัดอักขระทิ้ง — ถ้ามีอักขระที่ใช้ไม่ได้ให้แจ้งผู้ใช้แก้ไฟล์แทน จะได้ไม่ได้ซีรีย์ผิดเส้น
 * @param serial ซีรีย์ดิบจากไฟล์
 */
export function normalizeImportSerial(serial: string): string {
  return serial.trim().toUpperCase()
}

/**
 * ตรวจรูปแบบของ 1 แถว (ยังไม่เทียบกับฐานข้อมูล)
 * @param row แถวที่อ่านจากไฟล์
 * @returns ข้อความปัญหา หรือ null ถ้าผ่าน
 */
export function checkImportRowFormat(row: TireImportRow): string | null {
  const missing: string[] = []
  if (row.brand === '') missing.push('ยี่ห้อ')
  // ยี่ห้อ "อื่นๆ" มีรุ่นเดียวต่อขนาด จึงไม่ต้องกรอกรุ่น (ระบุยี่ห้อ/รุ่นจริงในหมายเหตุแทน)
  if (row.model === '' && !isOtherBrand(row.brand)) missing.push('รุ่น')
  if (row.size === '') missing.push('ขนาด')
  if (row.serial === '') missing.push('ซีรีย์')
  if (missing.length > 0) return `ยังไม่ได้กรอก ${missing.join(', ')}`

  const serial = normalizeImportSerial(row.serial)
  if (serial.length > SERIAL_MAX) return `ซีรีย์ยาวเกิน ${SERIAL_MAX} ตัว`
  if (!SERIAL_PATTERN.test(serial)) return `${SERIAL_PATTERN_MESSAGE} (ห้ามมีช่องว่างหรือสัญลักษณ์อื่น)`

  for (const [label, value] of [
    ['ยี่ห้อ', row.brand],
    ['รุ่น', row.model],
    ['ขนาด', row.size],
    ['DOT', row.dot],
  ] as const) {
    if (value.length > IMPORT_TEXT_MAX) return `${label} ยาวเกิน ${IMPORT_TEXT_MAX} ตัวอักษร`
  }

  if (row.note.length > IMPORT_NOTE_MAX) return `หมายเหตุยาวเกิน ${IMPORT_NOTE_MAX} ตัวอักษร`
  if (isOtherBrand(row.brand) && row.note === '') {
    return `ยี่ห้อ "${OTHER_BRAND}" ต้องกรอกหมายเหตุว่ายี่ห้อ/รุ่นที่พิมพ์บนยางคืออะไร`
  }
  return null
}

/** ผลตรวจรูปแบบของแต่ละแถว (ก่อนเทียบกับฐานข้อมูล) */
export interface ImportFormatCheck {
  row: TireImportRow
  /** ซีรีย์ที่แปลงเป็นตัวพิมพ์ใหญ่แล้ว */
  serial: string
  /** ข้อความปัญหา (null = รูปแบบถูกต้อง) */
  error: string | null
}

/**
 * ตรวจรูปแบบทุกแถว + หาซีรีย์ที่ซ้ำกันเองในไฟล์
 * ใช้ทั้งฝั่ง client (โชว์ก่อนส่ง) และ server (ตรวจซ้ำก่อนบันทึก)
 * @param rows แถวจากไฟล์
 */
export function validateImportRows(rows: TireImportRow[]): ImportFormatCheck[] {
  const seenAt = new Map<string, number>()
  return rows.map((row) => {
    const serial = normalizeImportSerial(row.serial)
    let error = checkImportRowFormat(row)
    if (!error) {
      const firstRow = seenAt.get(serial)
      if (firstRow !== undefined) {
        error = `ซีรีย์ซ้ำกับแถวที่ ${firstRow} ในไฟล์เดียวกัน`
      } else {
        seenAt.set(serial, row.rowNo)
      }
    }
    return { row, serial, error }
  })
}

/**
 * ข้อความบอกที่มาของยางที่นำเข้า — เก็บใน tires.note
 * @param fileName ชื่อไฟล์ที่นำเข้า
 * @param at เวลาที่นำเข้า
 */
export function importSourceLabel(fileName: string, at = new Date()): string {
  return `นำเข้าจากไฟล์ ${fileName} ${formatThaiDate(at)}`
}

/**
 * หมายเหตุที่จะบันทึกกับยาง
 * - ยี่ห้อ "อื่นๆ": หมายเหตุของผู้ใช้ (ยี่ห้อ/รุ่นบนยาง) ต้องอยู่หน้าสุด แล้วต่อท้ายด้วยที่มา
 * - ยี่ห้ออื่น: ใช้หมายเหตุของผู้ใช้ถ้ามี ไม่มีก็ใส่ที่มาแทน
 * @param rowNote หมายเหตุจากไฟล์
 * @param otherBrand ยี่ห้อเป็น "อื่นๆ" หรือไม่
 * @param source ข้อความที่มา (จาก importSourceLabel)
 */
export function buildImportNote(rowNote: string, otherBrand: boolean, source: string): string {
  const note = rowNote.trim()
  if (note === '') return source
  return otherBrand ? `${note} · ${source}` : note
}

/* ------------------------------------------------------------------ CSV */

/**
 * อ่าน CSV แบบง่าย — รองรับตัวคั่น , หรือ ; (เดาจากบรรทัดแรก), ช่องที่ครอบด้วย "..."
 * (รวม "" แทนเครื่องหมายคำพูด และขึ้นบรรทัดใหม่ในช่อง), BOM ของ UTF-8 และ CRLF
 * @param text เนื้อไฟล์ที่ถอดรหัสเป็นข้อความแล้ว
 */
export function parseCsv(text: string): string[][] {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  const firstLine = body.split(/\r?\n/, 1)[0] ?? ''
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ','

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (quoted) {
      if (ch === '"') {
        if (body[i + 1] === '"') {
          field += '"'
          i += 1
        } else {
          quoted = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      quoted = true
    } else if (ch === delimiter) {
      row.push(field)
      field = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && body[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  // บรรทัดสุดท้ายอาจไม่มีตัวขึ้นบรรทัด
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}
