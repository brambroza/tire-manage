'use server'

import { vehicleLabel } from '@/lib/vehicle-display'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { resolveCompanyScope } from '@/lib/company-scope'
import { createClient } from '@/lib/supabase/server'
import { fail, zodFail, type ActionResult } from '@/lib/action-result'
import { featureLockedMessage, hasFeature } from '@/lib/plan'
import { isMissingImportSchema } from '@/lib/tire-import-history'
import {
  IMPORT_NOTE_MAX, IMPORT_TEXT_MAX, MAX_IMPORT_ROWS, buildImportNote, importSourceLabel,
  isOtherBrand, validateImportRows, type TireImportRow,
} from '@/lib/tire-import'
import { TIRE_STATUS_LABEL, toErrorMessage } from '@/lib/utils'
import type { TireStatus } from '@/lib/database.types'

/** ผลตรวจ 1 แถวหลังเทียบกับฐานข้อมูลแล้ว — client ใช้แสดงตารางก่อนนำเข้า */
export interface TireImportPreviewRow {
  rowNo: number
  /** ซีรีย์ที่แปลงเป็นตัวพิมพ์ใหญ่แล้ว */
  serial: string
  brand: string
  model: string
  size: string
  note: string
  status: 'ok' | 'error'
  /** สาเหตุที่นำเข้าไม่ได้ (null เมื่อผ่าน) */
  message: string | null
  /** รุ่นในแคตตาล็อกที่จับคู่ได้ + snapshot ที่จะบันทึกลง tires */
  resolved: {
    tire_model_id: string
    brand_name: string
    model_name: string
    size: string | null
    new_tread_mm: number | null
  } | null
}

export interface TireImportCommitResult {
  inserted: number
  skipped: number
  /** รอบนำเข้าที่บันทึกไว้ (null = ยังไม่ได้ apply migration 014 จึงไม่มีประวัติรอบ) */
  importId: string | null
}

/* ---------------------------------------------------------- validation */

/**
 * ความยาวใน zod ตั้งหลวมกว่ากฎจริง — ให้แถวที่ยาวเกินถูกรายงานเป็นปัญหารายแถว
 * (validateImportRows) แทนที่จะปฏิเสธทั้งไฟล์
 */
const rowSchema = z.object({
  rowNo: z.number().int().min(1).max(1_000_000),
  brand: z.string().trim().max(IMPORT_TEXT_MAX * 4),
  model: z.string().trim().max(IMPORT_TEXT_MAX * 4),
  size: z.string().trim().max(IMPORT_TEXT_MAX * 4),
  serial: z.string().trim().max(200),
  note: z.string().trim().max(IMPORT_NOTE_MAX * 4),
})

const rowsSchema = z
  .array(rowSchema)
  .min(1, 'ไม่พบข้อมูลในไฟล์')
  .max(MAX_IMPORT_ROWS, `นำเข้าได้ครั้งละไม่เกิน ${MAX_IMPORT_ROWS.toLocaleString('en-US')} แถว — แบ่งไฟล์แล้วนำเข้าทีละส่วน`)

const fileNameSchema = z.string().trim().min(1).max(200)

/* --------------------------------------------------------------- scope */

/**
 * ตรวจสิทธิ์นำเข้า: แอดมินบริษัทต้องอยู่แพ็กเกจ Premium, super admin ทำแทนได้ทุกบริษัท
 * @param companyId บริษัทเป้าหมาย (ใช้เฉพาะ super admin)
 */
async function resolveImportScope(companyId?: string) {
  const scope = await resolveCompanyScope(['admin'], companyId)
  if (!scope.ok) return scope
  if (scope.session.profile.role !== 'super_admin' && !hasFeature(scope.session.company, 'tire_import')) {
    return { ok: false as const, error: featureLockedMessage('tire_import') }
  }
  return scope
}


/* ------------------------------------------------------------- lookups */

type Supabase = Awaited<ReturnType<typeof createClient>>

/** รุ่นในแคตตาล็อกที่บริษัทใช้ได้ พร้อมคีย์สำหรับจับคู่ */
interface CatalogModel {
  id: string
  brand_name: string
  model_name: string
  size: string | null
  new_tread_mm: number | null
}

interface CatalogModelRow {
  id: string
  name: string
  size: string | null
  new_tread_mm: number | null
  created_by_company: string | null
  tire_brands: { name: string; is_active: boolean } | null
}

/** ทำข้อความให้เทียบกันได้โดยไม่สนตัวพิมพ์และช่องว่าง เช่น "295/80 R22.5" = "295/80r22.5" */
function matchKey(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/\s+/g, '')
}

/**
 * โหลดแคตตาล็อกที่นำเข้าได้ = เฉพาะรุ่นที่ super admin เปิดสิทธิ์ให้บริษัท (company_tire_models)
 * ยี่ห้อ/รุ่นต้องมีอยู่ก่อนเสมอ ระบบไม่สร้างให้ระหว่างนำเข้า
 */
async function loadCompanyCatalog(
  supabase: Supabase,
  companyId: string,
): Promise<{ byFull: Map<string, CatalogModel>; otherBySize: Map<string, CatalogModel> } | { error: unknown }> {
  const [{ data: grants, error: grantError }, { data: models, error: modelError }] = await Promise.all([
    supabase.from('company_tire_models').select('tire_model_id').eq('company_id', companyId),
    supabase
      .from('tire_models')
      .select('id, name, size, new_tread_mm, created_by_company, tire_brands(name, is_active)')
      .eq('is_active', true),
  ])
  if (grantError) return { error: grantError }
  if (modelError) return { error: modelError }

  const granted = new Set((grants ?? []).map((g) => g.tire_model_id))
  const byFull = new Map<string, CatalogModel>()
  const otherBySize = new Map<string, CatalogModel>()

  for (const m of (models ?? []) as unknown as CatalogModelRow[]) {
    if (!m.tire_brands || !m.tire_brands.is_active) continue
    // รับเฉพาะรุ่นที่ super admin เปิดสิทธิ์ให้ — ไม่สร้างหรือรับรุ่นที่บริษัทพิมพ์เอง กันข้อมูลผิด
    if (!granted.has(m.id)) continue
    const model: CatalogModel = {
      id: m.id,
      brand_name: m.tire_brands.name,
      model_name: m.name,
      size: m.size,
      new_tread_mm: m.new_tread_mm,
    }
    if (isOtherBrand(model.brand_name)) {
      // ยี่ห้อ "อื่นๆ" มีรุ่นเดียวต่อขนาด → จับคู่ด้วยขนาดอย่างเดียว
      const key = matchKey(model.size)
      if (!otherBySize.has(key)) otherBySize.set(key, model)
    } else {
      const key = `${matchKey(model.brand_name)}|${matchKey(model.model_name)}|${matchKey(model.size)}`
      if (!byFull.has(key)) byFull.set(key, model)
    }
  }
  return { byFull, otherBySize }
}

interface ExistingTire {
  serial_no: string
  status: TireStatus
  plate_no: string | null
}

/**
 * หาซีรีย์ที่มีในระบบแล้วของบริษัทนี้ — ค้นเป็นชุดละ 200 กัน URL ยาวเกิน
 * ซีรีย์ในฐานข้อมูลเป็นตัวพิมพ์ใหญ่ทั้งหมดตั้งแต่ migration 008 จึงเทียบตรง ๆ ได้
 */
async function loadExistingSerials(
  supabase: Supabase,
  companyId: string,
  serials: string[],
): Promise<Map<string, ExistingTire> | { error: unknown }> {
  const found = new Map<string, ExistingTire>()
  const unique = [...new Set(serials)]
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200)
    const { data, error } = await supabase
      .from('tires')
      .select('serial_no, status, vehicle_id, vehicles(nickname, plate_no)')
      .eq('company_id', companyId)
      .in('serial_no', chunk)
    if (error) return { error }
    for (const t of (data ?? []) as unknown as Array<{
      serial_no: string
      status: TireStatus
      vehicles: { nickname: string | null; plate_no: string | null } | null
    }>) {
      found.set(t.serial_no.toUpperCase(), {
        serial_no: t.serial_no,
        status: t.status,
        plate_no: vehicleLabel(t.vehicles, '') || null,
      })
    }
  }
  return found
}

/** ข้อความเมื่อซีรีย์มีอยู่แล้ว — บอกด้วยว่าอยู่ไหน จะได้ไปตรวจถูกเส้น */
function existingMessage(tire: ExistingTire): string {
  const where =
    tire.status === 'mounted'
      ? `ติดรถ ${tire.plate_no ?? 'ไม่ทราบทะเบียน'}`
      : TIRE_STATUS_LABEL[tire.status]
  return `ซีรีย์นี้มีในระบบแล้ว (${where})`
}

/**
 * ตรวจทุกแถวเทียบกับฐานข้อมูล — ใช้ทั้งตอนพรีวิวและตอนบันทึกจริง (ชุดเดียวกัน)
 */
async function checkRows(
  supabase: Supabase,
  companyId: string,
  rows: TireImportRow[],
): Promise<TireImportPreviewRow[] | { error: unknown }> {
  const checks = validateImportRows(rows)

  const catalog = await loadCompanyCatalog(supabase, companyId)
  if ('error' in catalog) return catalog

  const existing = await loadExistingSerials(
    supabase,
    companyId,
    checks.filter((c) => !c.error).map((c) => c.serial),
  )
  if ('error' in existing) return existing

  return checks.map(({ row, serial, error }) => {
    const base = {
      rowNo: row.rowNo,
      serial,
      brand: row.brand,
      model: row.model,
      size: row.size,
      note: row.note,
    }
    if (error) return { ...base, status: 'error', message: error, resolved: null }

    const found = existing.get(serial)
    if (found) return { ...base, status: 'error', message: existingMessage(found), resolved: null }

    const model = isOtherBrand(row.brand)
      ? catalog.otherBySize.get(matchKey(row.size))
      : catalog.byFull.get(`${matchKey(row.brand)}|${matchKey(row.model)}|${matchKey(row.size)}`)
    if (!model) {
      return {
        ...base,
        status: 'error',
        message: isOtherBrand(row.brand)
          ? `ไม่มีรุ่น "อื่นๆ" ขนาด ${row.size} ในแคตตาล็อก — แจ้ง Dreammaker เพิ่มขนาดนี้`
          : 'ไม่พบยี่ห้อ/รุ่น/ขนาดนี้ในข้อมูลยางของบริษัท — ตรวจการสะกด หรือแจ้ง Dreammaker เพิ่ม/เปิดสิทธิ์รุ่นนี้ก่อนนำเข้า',
        resolved: null,
      }
    }

    return {
      ...base,
      status: 'ok',
      message: null,
      resolved: {
        tire_model_id: model.id,
        brand_name: model.brand_name,
        model_name: model.model_name,
        size: model.size,
        new_tread_mm: model.new_tread_mm,
      },
    }
  })
}

/* ------------------------------------------------------- import batch */

/**
 * เปิดรอบนำเข้าใหม่ใน tire_imports ก่อนบันทึกยาง เพื่อให้ยางทุกเส้นผูก import_id ได้
 * @returns id ของรอบ, null ถ้ายังไม่ได้ apply migration 014, หรือ error อื่น
 */
async function startImportBatch(
  supabase: Supabase,
  input: {
    companyId: string
    fileName: string
    userId: string
    userName: string
    rowCount: number
    skipped: number
  },
): Promise<{ id: string | null } | { error: unknown }> {
  const { data, error } = await supabase
    .from('tire_imports')
    .insert({
      company_id: input.companyId,
      file_name: input.fileName,
      imported_by: input.userId,
      imported_by_name: input.userName,
      row_count: input.rowCount,
      inserted_count: 0,
      skipped_count: input.skipped,
    })
    .select('id')
    .single()
  if (error) return isMissingImportSchema(error) ? { id: null } : { error }
  return { id: data.id }
}

/**
 * ปิดรอบนำเข้า: บันทึกจำนวนที่นำเข้าได้จริง — ถ้าไม่ได้สักเส้นให้ลบรอบทิ้ง ไม่ให้มีรอบว่างในประวัติ
 * ไม่ส่ง error กลับ เพราะยางถูกบันทึกไปแล้ว ประวัติรอบเป็นข้อมูลประกอบ
 */
async function finishImportBatch(supabase: Supabase, id: string | null, inserted: number, skipped: number) {
  if (!id) return
  if (inserted === 0) {
    await supabase.from('tire_imports').delete().eq('id', id)
    return
  }
  await supabase.from('tire_imports').update({ inserted_count: inserted, skipped_count: skipped }).eq('id', id)
}

/* ------------------------------------------------------------- actions */

/**
 * ตรวจแถวจากไฟล์ก่อนนำเข้า: รูปแบบ, ซ้ำในไฟล์, ซ้ำในระบบ, รุ่นที่บริษัทใช้ได้
 * @param rows แถวที่ client อ่านจากไฟล์
 * @param companyId บริษัทเป้าหมาย (เฉพาะ super admin ทำแทน)
 */
export async function previewTireImport(
  rows: TireImportRow[],
  companyId?: string,
): Promise<ActionResult<{ rows: TireImportPreviewRow[] }>> {
  const scope = await resolveImportScope(companyId)
  if (!scope.ok) return scope

  const parsed = rowsSchema.safeParse(rows)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const checked = await checkRows(supabase, scope.companyId, parsed.data)
  if ('error' in checked) return fail(checked.error)
  return { ok: true, data: { rows: checked } }
}

/**
 * นำเข้ายางเข้าคลัง (สถานะ "อยู่ในคลัง") — ตรวจซ้ำทั้งหมดอีกรอบฝั่ง server ไม่เชื่อผลจาก client
 * แถวที่ติดปัญหาจะถูกข้าม นำเข้าเฉพาะแถวที่ผ่าน
 * @param rows แถวจากไฟล์ (ชุดเดียวกับที่ส่งพรีวิว)
 * @param companyId บริษัทเป้าหมาย (เฉพาะ super admin ทำแทน)
 * @param fileName ชื่อไฟล์ ใช้บันทึกที่มาในหมายเหตุ
 */
export async function commitTireImport(
  rows: TireImportRow[],
  companyId: string | undefined,
  fileName: string,
): Promise<ActionResult<TireImportCommitResult>> {
  const scope = await resolveImportScope(companyId)
  if (!scope.ok) return scope

  const parsed = rowsSchema.safeParse(rows)
  if (!parsed.success) return zodFail(parsed.error)
  const safeFileName = fileNameSchema.safeParse(fileName)
  if (!safeFileName.success) return { ok: false, error: 'ชื่อไฟล์ไม่ถูกต้อง' }

  const supabase = await createClient()
  const checked = await checkRows(supabase, scope.companyId, parsed.data)
  if ('error' in checked) return fail(checked.error)

  const okRows = checked.filter((r) => r.status === 'ok' && r.resolved)
  const skipped = checked.length - okRows.length
  if (okRows.length === 0) {
    return { ok: false, error: 'ไม่มีแถวที่ผ่านการตรวจ — แก้ไฟล์ตามข้อความในตารางแล้วลองใหม่' }
  }

  const batch = await startImportBatch(supabase, {
    companyId: scope.companyId,
    fileName: safeFileName.data,
    userId: scope.session.userId,
    userName: scope.session.profile.full_name,
    rowCount: checked.length,
    skipped,
  })
  if ('error' in batch) return fail(batch.error)
  const importId = batch.id

  const source = importSourceLabel(safeFileName.data)
  const payload = okRows.map((r) => {
    const resolved = r.resolved!
    return {
      company_id: scope.companyId,
      serial_no: r.serial,
      tire_model_id: resolved.tire_model_id,
      brand_name: resolved.brand_name,
      model_name: resolved.model_name,
      size: resolved.size,
      status: 'in_stock' as const,
      total_distance_km: 0,
      // ยางที่นำเข้าถือว่ายังไม่เคยใช้ → ดอกยางเริ่มต้นเท่ากับดอกยางตอนใหม่ของรุ่น
      tread_mm: resolved.new_tread_mm,
      new_tread_mm: resolved.new_tread_mm,
      note: buildImportNote(r.note, isOtherBrand(r.brand), source),
      // ใส่เฉพาะเมื่อมีรอบ — ก่อน apply migration 014 ตาราง tires ยังไม่มีคอลัมน์นี้
      ...(importId ? { import_id: importId } : {}),
    }
  })

  let inserted = 0
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200)
    const { error } = await supabase.from('tires').insert(chunk)
    if (error) {
      await finishImportBatch(supabase, importId, inserted, checked.length - inserted)
      revalidateImport(scope.companyId)
      const prefix = inserted > 0 ? `นำเข้าไปแล้ว ${inserted} เส้น แต่` : ''
      if (error.code === '23505') {
        // รายละเอียดจาก Postgres เช่น Key (company_id, upper(serial_no))=(..., ABC123) already exists.
        const match = /=\((?:[^,]*,\s*)?([^)]+)\)/.exec(error.details ?? '')
        const serial = match?.[1]?.trim()
        return {
          ok: false,
          error: `${prefix}ซีรีย์${serial ? ` ${serial}` : ''} ถูกบันทึกเข้าระบบระหว่างที่ตรวจ — กดตรวจสอบใหม่แล้วนำเข้าอีกครั้ง`,
        }
      }
      return { ok: false, error: `${prefix}${toErrorMessage(error)}` }
    }
    inserted += chunk.length
  }

  await finishImportBatch(supabase, importId, inserted, skipped)
  revalidateImport(scope.companyId)
  return { ok: true, data: { inserted, skipped, importId } }
}

/** หน้าที่แสดงคลังยาง/ตัวเลือกยางต้องเห็นเส้นที่เพิ่งนำเข้าทันที */
function revalidateImport(companyId: string) {
  revalidatePath('/tires')
  revalidatePath('/tires/import')
  revalidatePath('/service')
  revalidatePath('/dashboard')
  revalidatePath(`/superadmin/companies/${companyId}/tires`)
}
