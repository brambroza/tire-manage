/**
 * ประวัติการนำเข้าซีรีย์ยางใหม่จากไฟล์ — ใช้ในหน้า "ข้อมูลยางใหม่" (/tires/import)
 *
 * แหล่งข้อมูลหลักคือ tire_imports + tires.import_id (migration 014)
 * ถ้ายังไม่ได้ apply migration 014 จะถอยไปหาจากหมายเหตุ "นำเข้าจากไฟล์ ..." ที่บันทึกกับยาง
 * (แบบนี้อาจตกหล่นยางยี่ห้อปกติที่ผู้ใช้กรอกหมายเหตุเอง)
 */
import { vehicleLabel } from '@/lib/vehicle-display'
import type { createClient } from '@/lib/supabase/server'
import type { TireStatus } from '@/lib/database.types'

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * ข้อความที่มาในหมายเหตุยาง (ตรงกับ importSourceLabel ใน tire-import.ts)
 * กลุ่ม 1 = ชื่อไฟล์, กลุ่ม 2 = ชื่อรอบคีย์/สแกน, กลุ่ม 3 = วันที่
 */
const SOURCE_NOTE_PATTERN = /(?:นำเข้าจากไฟล์ (.+)|(คีย์\/สแกน · .+)) (\d{1,2} \S+ \d{4})$/

/** จำกัดจำนวนยางที่โหลดต่อครั้ง กันหน้าโหลดหนักเกิน (นำเข้าได้ครั้งละ 2,000 เส้น) */
export const IMPORT_HISTORY_TIRE_LIMIT = 10_000

/** รอบนำเข้า 1 รอบ */
export interface ImportBatchView {
  id: string
  fileName: string
  importedByName: string | null
  rowCount: number
  insertedCount: number
  skippedCount: number
  createdAt: string
}

/** ยาง 1 เส้นที่มาจากการนำเข้า พร้อมสถานะปัจจุบัน */
export interface ImportedTireView {
  id: string
  serial: string
  brand: string | null
  model: string | null
  size: string | null
  status: TireStatus
  plateNo: string | null
  totalDistanceKm: number
  /** เคยมี event ใส่/ถอดแล้ว — ยางที่ถอดเก็บต้องไม่แสดงเป็น "ยางใหม่" แม้ระยะสะสมเป็น 0 */
  hasBeenMounted: boolean
  note: string | null
  createdAt: string
  /** รอบที่นำเข้า (null = หารอบไม่เจอ) */
  batchId: string | null
}

export interface ImportHistory {
  batches: ImportBatchView[]
  tires: ImportedTireView[]
  /** false = ยังไม่ได้ apply migration 014 ข้อมูลมาจากหมายเหตุ อาจไม่ครบ */
  hasImportLog: boolean
  /** true = ยางเกิน IMPORT_HISTORY_TIRE_LIMIT แสดงไม่ครบ */
  truncated: boolean
}

/**
 * error ที่แปลว่ายังไม่มีตาราง/คอลัมน์ของ migration 014
 * (PGRST205 = ไม่พบตาราง, PGRST204 = ไม่พบคอลัมน์ใน schema cache, 42P01/42703 = ของ Postgres)
 * @param error error จาก supabase-js
 */
export function isMissingImportSchema(error: { code?: string | null } | null | undefined): boolean {
  const code = error?.code
  return code === 'PGRST205' || code === 'PGRST204' || code === '42P01' || code === '42703'
}

interface TireRow {
  id: string
  serial_no: string
  brand_name: string | null
  model_name: string | null
  size: string | null
  status: TireStatus
  total_distance_km: number
  note: string | null
  created_at: string
  import_id?: string | null
  vehicles: { nickname: string | null; plate_no: string } | null
}

const TIRE_COLUMNS =
  'id, serial_no, brand_name, model_name, size, status, total_distance_km, note, created_at, vehicles(nickname, plate_no)'

/**
 * แปลงแถวยางจากฐานข้อมูลเป็นรูปแบบที่หน้าจอใช้
 * @param t แถวยาง
 * @param batchId รอบที่ยางนี้อยู่
 * @param everMounted ชุด id ของยางในคลังที่เคยถูกใส่/ถอดแล้ว
 */
function toTireView(t: TireRow, batchId: string | null, everMounted: Set<string>): ImportedTireView {
  return {
    id: t.id,
    serial: t.serial_no,
    brand: t.brand_name,
    model: t.model_name,
    size: t.size,
    status: t.status,
    plateNo: vehicleLabel(t.vehicles, '') || null,
    totalDistanceKm: t.total_distance_km,
    hasBeenMounted: everMounted.has(t.id),
    note: t.note,
    createdAt: t.created_at,
    batchId,
  }
}

/**
 * id ของยางในคลัง (in_stock) ที่เคยมี event ใส่/ถอดแล้ว — ใช้กันไม่ให้ยางที่ถอดเก็บถูกนับเป็นยางใหม่
 * ดึงเฉพาะ in_stock เพราะสถานะอื่นไม่มีทางแสดงเป็น "ยางใหม่" อยู่แล้ว (ชุดนี้จึงเล็ก)
 * ถ้ายังไม่ได้ apply migration 015 (ไม่มีคอลัมน์ has_been_mounted) คืนชุดว่าง = พฤติกรรมเดิม
 * @param supabase client ของผู้ใช้
 * @param companyId บริษัท
 */
async function loadEverMountedStockIds(supabase: Supabase, companyId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('tire_overview')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'in_stock')
    .eq('has_been_mounted', true)
    .limit(IMPORT_HISTORY_TIRE_LIMIT)
  if (error) {
    if (isMissingImportSchema(error)) return new Set()
    throw error
  }
  return new Set((data ?? []).map((row) => row.id))
}

/**
 * โหลดประวัติการนำเข้าทั้งหมดของบริษัท
 * @param supabase client ของผู้ใช้ (RLS จำกัดเฉพาะบริษัทตัวเอง)
 * @param companyId บริษัท
 */
export async function loadImportHistory(supabase: Supabase, companyId: string): Promise<ImportHistory> {
  const { data: batchRows, error: batchError } = await supabase
    .from('tire_imports')
    .select('id, file_name, imported_by_name, row_count, inserted_count, skipped_count, created_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (batchError && !isMissingImportSchema(batchError)) throw batchError
  if (batchError) return loadFromNotes(supabase, companyId)

  const batches: ImportBatchView[] = (batchRows ?? []).map((b) => ({
    id: b.id,
    fileName: b.file_name,
    importedByName: b.imported_by_name,
    rowCount: b.row_count,
    insertedCount: b.inserted_count,
    skippedCount: b.skipped_count,
    createdAt: b.created_at,
  }))

  const [{ data: tireRows, error: tireError }, everMounted] = await Promise.all([
    supabase
      .from('tires')
      .select(`${TIRE_COLUMNS}, import_id`)
      .eq('company_id', companyId)
      .not('import_id', 'is', null)
      .order('created_at', { ascending: false })
      .order('serial_no')
      .limit(IMPORT_HISTORY_TIRE_LIMIT + 1),
    loadEverMountedStockIds(supabase, companyId),
  ])
  if (tireError) throw tireError

  const rows = (tireRows ?? []) as unknown as TireRow[]
  return {
    batches,
    tires: rows
      .slice(0, IMPORT_HISTORY_TIRE_LIMIT)
      .map((t) => toTireView(t, t.import_id ?? null, everMounted)),
    hasImportLog: true,
    truncated: rows.length > IMPORT_HISTORY_TIRE_LIMIT,
  }
}

/**
 * ทางสำรองก่อน apply migration 014: หายางจากหมายเหตุ แล้วจัดรอบตาม ชื่อไฟล์ + วันที่ในหมายเหตุ
 * @param supabase client ของผู้ใช้
 * @param companyId บริษัท
 */
async function loadFromNotes(supabase: Supabase, companyId: string): Promise<ImportHistory> {
  const [{ data, error }, everMounted] = await Promise.all([
    supabase
      .from('tires')
      .select(TIRE_COLUMNS)
      .eq('company_id', companyId)
      .or('note.ilike.%นำเข้าจากไฟล์%,note.ilike.%คีย์/สแกน ·%')
      .order('created_at', { ascending: false })
      .order('serial_no')
      .limit(IMPORT_HISTORY_TIRE_LIMIT + 1),
    loadEverMountedStockIds(supabase, companyId),
  ])
  if (error) throw error

  const rows = ((data ?? []) as unknown as TireRow[]).slice(0, IMPORT_HISTORY_TIRE_LIMIT)
  const batchMap = new Map<string, ImportBatchView>()
  const tires: ImportedTireView[] = []

  for (const t of rows) {
    const match = SOURCE_NOTE_PATTERN.exec(t.note ?? '')
    if (!match) continue
    const name = match[1] ?? match[2]
    const key = `${name}|${match[3]}`
    let batch = batchMap.get(key)
    if (!batch) {
      batch = {
        id: `note:${key}`,
        fileName: name,
        importedByName: null,
        rowCount: 0,
        insertedCount: 0,
        skippedCount: 0,
        createdAt: t.created_at,
      }
      batchMap.set(key, batch)
    }
    batch.insertedCount += 1
    batch.rowCount += 1
    tires.push(toTireView(t, batch.id, everMounted))
  }

  return {
    batches: [...batchMap.values()],
    tires,
    hasImportLog: false,
    truncated: (data ?? []).length > IMPORT_HISTORY_TIRE_LIMIT,
  }
}
