'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { resolveCompanyScope } from '@/lib/company-scope'
import { createClient } from '@/lib/supabase/server'
import { fail, zodFail, type ActionResult } from '@/lib/action-result'
import { featureLockedMessage, hasFeature } from '@/lib/plan'
import { ensureBrandModelFor } from '@/lib/tire-stock'
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
  dot: string
  note: string
  status: 'ok' | 'error'
  /** สาเหตุที่นำเข้าไม่ได้ (null เมื่อผ่าน) */
  message: string | null
  /** true = ไม่มีรุ่นนี้ในแคตตาล็อก จะสร้างยี่ห้อ/รุ่นใหม่ให้บริษัทตอนนำเข้า (เฉพาะ Premium) */
  willCreate?: boolean
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
  dot: z.string().trim().max(IMPORT_TEXT_MAX * 4),
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

/** บริษัทนี้สร้างยี่ห้อ/รุ่นของตัวเองระหว่างนำเข้าได้ไหม — super admin ทำแทนได้เสมอ */
function canCreateCatalogFor(scope: { session: { profile: { role: string }; company: Parameters<typeof hasFeature>[0] } }): boolean {
  return scope.session.profile.role === 'super_admin' || hasFeature(scope.session.company, 'tire_catalog_own')
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
 * โหลดแคตตาล็อกที่บริษัทนี้ใช้ได้ = รุ่นที่ super admin เปิดสิทธิ์ + รุ่นที่บริษัทสร้างเอง
 * (กฎเดียวกับ RLS ของ tire_models แต่ต้องกรองเองเพราะ super admin เห็นทุกรุ่น)
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
    if (!granted.has(m.id) && m.created_by_company !== companyId) continue
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
      .select('serial_no, status, vehicle_id, vehicles(plate_no)')
      .eq('company_id', companyId)
      .in('serial_no', chunk)
    if (error) return { error }
    for (const t of (data ?? []) as unknown as Array<{
      serial_no: string
      status: TireStatus
      vehicles: { plate_no: string } | null
    }>) {
      found.set(t.serial_no.toUpperCase(), {
        serial_no: t.serial_no,
        status: t.status,
        plate_no: t.vehicles?.plate_no ?? null,
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
  /** บริษัทสร้างยี่ห้อ/รุ่นของตัวเองได้ (Premium หรือ super admin ทำแทน) */
  canCreateCatalog: boolean,
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
      dot: row.dot,
      note: row.note,
    }
    if (error) return { ...base, status: 'error', message: error, resolved: null }

    const found = existing.get(serial)
    if (found) return { ...base, status: 'error', message: existingMessage(found), resolved: null }

    const model = isOtherBrand(row.brand)
      ? catalog.otherBySize.get(matchKey(row.size))
      : catalog.byFull.get(`${matchKey(row.brand)}|${matchKey(row.model)}|${matchKey(row.size)}`)
    if (!model) {
      // Premium: ยี่ห้อ/รุ่นที่ไม่มีในแคตตาล็อกจะถูกสร้างเป็นรายการของบริษัทตอนนำเข้า
      // (ยกเว้น "อื่นๆ" ที่ต้องมีขนาดในแคตตาล็อกกลางอยู่แล้ว)
      if (canCreateCatalog && !isOtherBrand(row.brand)) {
        return {
          ...base,
          status: 'ok',
          willCreate: true,
          message: `ยังไม่มีรุ่นนี้ — จะสร้าง ${row.brand} ${row.model} ${row.size} เป็นรายการของบริษัทให้`,
          resolved: null,
        }
      }
      return {
        ...base,
        status: 'error',
        message: isOtherBrand(row.brand)
          ? `ไม่มีรุ่น "อื่นๆ" ขนาด ${row.size} ในแคตตาล็อก — แจ้ง Dreammaker เพิ่มขนาดนี้`
          : 'บริษัทยังไม่ได้รับสิทธิ์ใช้รุ่นนี้ แจ้ง Dreammaker เปิดให้ (ตรวจการสะกดยี่ห้อ/รุ่น/ขนาดด้วย)',
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
  const checked = await checkRows(supabase, scope.companyId, parsed.data, canCreateCatalogFor(scope))
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
  const checked = await checkRows(supabase, scope.companyId, parsed.data, canCreateCatalogFor(scope))
  if ('error' in checked) return fail(checked.error)

  // สร้างยี่ห้อ/รุ่นใหม่ให้บริษัทก่อน (Premium) แล้วค่อยผูกซีรีย์เข้ากับรุ่นที่ได้ — รุ่นซ้ำกันหลายแถวสร้างครั้งเดียว
  // super admin ทำแทน → รายการใหม่เป็นของบริษัทลูกค้านั้น ไม่ใช่แคตตาล็อกกลาง
  const createdModels = new Map<string, NonNullable<TireImportPreviewRow['resolved']>>()
  for (const r of checked) {
    if (r.status !== 'ok' || !r.willCreate) continue
    const key = `${r.brand.toLowerCase()}|${r.model.toLowerCase()}|${r.size.toLowerCase().replace(/\s+/g, '')}`
    let resolved = createdModels.get(key)
    if (!resolved) {
      const ensured = await ensureBrandModelFor(supabase, scope.companyId, r.brand, r.model, r.size)
      if (!ensured.ok || !ensured.data?.modelId) {
        revalidateImport(scope.companyId)
        return { ok: false, error: `แถว ${r.rowNo}: ${ensured.ok ? 'สร้างรุ่นยางไม่สำเร็จ' : ensured.error}` }
      }
      resolved = {
        tire_model_id: ensured.data.modelId,
        brand_name: r.brand.toUpperCase(),
        model_name: r.model,
        size: r.size || null,
        new_tread_mm: null,
      }
      createdModels.set(key, resolved)
    }
    r.resolved = resolved
  }

  const okRows = checked.filter((r) => r.status === 'ok' && r.resolved)
  const skipped = checked.length - okRows.length
  if (okRows.length === 0) {
    return { ok: false, error: 'ไม่มีแถวที่ผ่านการตรวจ — แก้ไฟล์ตามข้อความในตารางแล้วลองใหม่' }
  }

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
      dot: r.dot === '' ? null : r.dot,
      status: 'in_stock' as const,
      total_distance_km: 0,
      // ยางที่นำเข้าถือว่ายังไม่เคยใช้ → ดอกยางเริ่มต้นเท่ากับดอกยางตอนใหม่ของรุ่น
      tread_mm: resolved.new_tread_mm,
      new_tread_mm: resolved.new_tread_mm,
      note: buildImportNote(r.note, isOtherBrand(r.brand), source),
    }
  })

  let inserted = 0
  for (let i = 0; i < payload.length; i += 200) {
    const chunk = payload.slice(i, i + 200)
    const { error } = await supabase.from('tires').insert(chunk)
    if (error) {
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

  revalidateImport(scope.companyId)
  return { ok: true, data: { inserted, skipped } }
}

/** หน้าที่แสดงคลังยาง/ตัวเลือกยางต้องเห็นเส้นที่เพิ่งนำเข้าทันที */
function revalidateImport(companyId: string) {
  revalidatePath('/tires')
  revalidatePath('/service')
  revalidatePath('/dashboard')
  revalidatePath(`/superadmin/companies/${companyId}/tires`)
}
