'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ActionResult, fail, optionalNumber, optionalText, zodFail } from '@/lib/action-result'
import { createTire, ensureBrandModel } from '../tires/actions'
import {
  ODOMETER_MAX, ODOMETER_MAX_MESSAGE, PLATE_PATTERN, PLATE_PATTERN_MESSAGE,
  SERIAL_MAX, SERIAL_PATTERN, SERIAL_PATTERN_MESSAGE,
} from '@/lib/utils'

/** เลขไมล์: จำนวนเต็ม 0 ถึง 999,999 (6 หลัก) */
const odometerSchema = z
  .number()
  .int()
  .min(0, 'กรุณากรอกเลขไมล์')
  .max(ODOMETER_MAX, ODOMETER_MAX_MESSAGE)

/** ซีรีย์ยาง: แปลงเป็นตัวพิมพ์ใหญ่ก่อน แล้วรับเฉพาะ A-Z 0-9 ขีด */
const serialSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(1, 'กรุณากรอกเลขยาง (ซีเรียล)')
  .max(SERIAL_MAX, `ซีรีย์ยางยาวได้ไม่เกิน ${SERIAL_MAX} ตัว`)
  .regex(SERIAL_PATTERN, SERIAL_PATTERN_MESSAGE)

const unmountSchema = z.object({
  tire_id: z.string().uuid(),
  odometer: odometerSchema,
  tread_mm: optionalNumber,
  reason_id: optionalText,
  note: optionalText,
  event_date: z.string().min(1),
})

const mountSchema = z.object({
  tire_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  position_code: z.string().min(1, 'กรุณาเลือกตำแหน่งล้อ'),
  odometer: odometerSchema,
  tread_mm: optionalNumber,
  note: optionalText,
  event_date: z.string().min(1),
})

export type UnmountInput = z.input<typeof unmountSchema>
export type MountInput = z.input<typeof mountSchema>

/**
 * ถอดยางออกจากรถ — ระบบจะคำนวณระยะวิ่งของรอบนี้และสะสมให้อัตโนมัติ
 * @param input ข้อมูลการถอดยาง
 */
export async function unmountTireAction(input: UnmountInput): Promise<ActionResult> {
  await requireSession(['admin', 'technician'])
  const parsed = unmountSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.rpc('unmount_tire', {
    p_tire_id: parsed.data.tire_id,
    p_odometer: parsed.data.odometer,
    p_tread_mm: parsed.data.tread_mm,
    p_reason_id: parsed.data.reason_id,
    p_note: parsed.data.note,
    p_event_date: parsed.data.event_date,
  })

  if (error) return fail(error)
  revalidateService()
  return { ok: true }
}

/**
 * ใส่ยางเข้าตำแหน่งล้อที่เลือก
 * @param input ข้อมูลการใส่ยาง
 */
export async function mountTireAction(input: MountInput): Promise<ActionResult> {
  await requireSession(['admin', 'technician'])
  const parsed = mountSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const supabase = await createClient()
  const { error } = await supabase.rpc('mount_tire', {
    p_tire_id: parsed.data.tire_id,
    p_vehicle_id: parsed.data.vehicle_id,
    p_position_code: parsed.data.position_code,
    p_odometer: parsed.data.odometer,
    p_tread_mm: parsed.data.tread_mm,
    p_note: parsed.data.note,
    p_event_date: parsed.data.event_date,
  })

  if (error) return fail(error)
  revalidateService()
  return { ok: true }
}

const manualUnmountSchema = z.object({
  vehicle_id: z.string().uuid(),
  position_code: z.string().min(1, 'กรุณาเลือกตำแหน่งล้อ'),
  /** ข้อมูลยางที่ช่างคีย์เองหน้างาน */
  serial_no: serialSchema,
  tire_model_id: optionalText,
  brand_name: optionalText,
  model_name: optionalText,
  size: optionalText,
  dot: optionalText,
  new_tread_mm: optionalNumber,
  /** เลขไมล์ตอนที่ยางเส้นนี้ถูกใส่ (ถ้าทราบ) — ใช้คำนวณระยะวิ่งรอบนี้ */
  mounted_odometer: optionalNumber,
  odometer: odometerSchema,
  tread_mm: optionalNumber,
  reason_id: optionalText,
  note: optionalText,
  event_date: z.string().min(1),
})

export type ManualUnmountInput = z.input<typeof manualUnmountSchema>

/**
 * ถอดยางที่ "ยังไม่มีข้อมูลในระบบ"
 * สร้างประวัติยางเส้นนั้นขึ้นมาก่อน แล้วบันทึกใส่-ถอดย้อนหลังให้ครบ
 * เพื่อให้ตำแหน่งล้อและระยะวิ่งตรงกับหน้างานจริง
 * @param input ข้อมูลยางที่คีย์เอง + รายละเอียดการถอด
 */
export async function unmountManualTireAction(input: ManualUnmountInput): Promise<ActionResult> {
  await requireSession(['admin', 'technician'])
  const parsed = manualUnmountSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)
  const data = parsed.data

  const mountedOdometer = data.mounted_odometer ?? data.odometer
  if (mountedOdometer > data.odometer) {
    return {
      ok: false,
      error: 'เลขไมล์ตอนใส่ยางต้องไม่มากกว่าเลขไมล์ปัจจุบัน',
      fieldErrors: { mounted_odometer: 'ต้องไม่มากกว่าเลขไมล์ปัจจุบัน' },
    }
  }

  // ยังไม่มีรุ่นในแคตตาล็อกแต่ช่างพิมพ์ยี่ห้อมา → สร้างยี่ห้อ/รุ่นให้อัตโนมัติ
  let modelId = data.tire_model_id
  if (!modelId && data.brand_name) {
    const ensured = await ensureBrandModel(data.brand_name, data.model_name, data.size)
    if (!ensured.ok) return ensured
    modelId = ensured.data?.modelId ?? null
  }

  const created = await createTire({
    serial_no: data.serial_no,
    tire_model_id: modelId,
    brand_name: data.brand_name,
    model_name: data.model_name,
    size: data.size,
    dot: data.dot,
    new_tread_mm: data.new_tread_mm,
    tread_mm: data.tread_mm,
    note: data.note,
  })
  if (!created.ok) return created

  const tireId = created.data!.id
  const supabase = await createClient()

  // ใส่ย้อนหลังเพื่อผูกยางเข้าตำแหน่งเดิมก่อน แล้วจึงถอดออกตามจริง
  const { error: mountError } = await supabase.rpc('mount_tire', {
    p_tire_id: tireId,
    p_vehicle_id: data.vehicle_id,
    p_position_code: data.position_code,
    p_odometer: mountedOdometer,
    p_tread_mm: null,
    p_note: 'บันทึกย้อนหลัง (ยางไม่มีข้อมูลในระบบ)',
    p_event_date: data.event_date,
  })
  if (mountError) {
    // ลบยางที่เพิ่งสร้างทิ้ง เพื่อไม่ให้ค้างเป็นข้อมูลขยะในคลัง
    await supabase.from('tires').delete().eq('id', tireId).eq('status', 'in_stock')
    return fail(mountError)
  }

  const { error: unmountError } = await supabase.rpc('unmount_tire', {
    p_tire_id: tireId,
    p_odometer: data.odometer,
    p_tread_mm: data.tread_mm,
    p_reason_id: data.reason_id,
    p_note: data.note,
    p_event_date: data.event_date,
  })
  if (unmountError) return fail(unmountError)

  revalidateService()
  return { ok: true }
}

/**
 * เปลี่ยนยาง: ถอดเส้นเดิมออกแล้วใส่เส้นใหม่ในตำแหน่งเดียวกัน
 * @param unmount ข้อมูลการถอดเส้นเดิม
 * @param mount ข้อมูลการใส่เส้นใหม่
 */
export async function replaceTireAction(
  unmount: UnmountInput,
  mount: MountInput,
): Promise<ActionResult> {
  const removed = await unmountTireAction(unmount)
  if (!removed.ok) return removed
  return mountTireAction(mount)
}

/* ============================================================
 * บันทึกหลายรายการในครั้งเดียว (ถอด/ใส่ หลายเส้นต่อรถ 1 คัน)
 * ============================================================ */

const manualTireSchema = z.object({
  serial_no: serialSchema,
  tire_model_id: optionalText,
  brand_name: optionalText,
  model_name: optionalText,
  size: optionalText,
  dot: optionalText,
  new_tread_mm: optionalNumber,
  /** เลขไมล์ตอนที่ยางเส้นนี้ถูกใส่ (ถ้าทราบ) ใช้คำนวณระยะวิ่งย้อนหลัง */
  mounted_odometer: optionalNumber,
})

const batchItemSchema = z.object({
  kind: z.enum(['unmount', 'mount', 'manual_unmount', 'manual_mount']),
  tire_id: optionalText,
  /** ตำแหน่งต้นทาง (ถอด) หรือปลายทาง (ใส่) */
  position_code: optionalText,
  tread_mm: optionalNumber,
  reason_id: optionalText,
  note: optionalText,
  manual: manualTireSchema.nullable().optional(),
  /** true = ช่างเลือก "ยางใหม่" — ต้องใช้รุ่นจากแคตตาล็อกของ super admin และซีรีย์ต้องไม่ซ้ำ */
  new_tire: z.boolean().optional(),
})

const batchSchema = z.object({
  vehicle_id: z.string().uuid(),
  odometer: odometerSchema,
  event_date: z.string().min(1),
  items: z.array(batchItemSchema).min(1, 'กรุณาเพิ่มอย่างน้อย 1 รายการ').max(60),
})

export type ServiceBatchItem = z.input<typeof batchItemSchema>
export type ServiceBatchInput = z.input<typeof batchSchema>

/** op ที่จะส่งให้ RPC apply_tire_ops ทำงานตามลำดับ */
interface TireOp {
  op: 'mount' | 'unmount'
  tire_id: string
  position_code?: string
  odometer: number
  tread_mm?: number | null
  reason_id?: string | null
  note?: string | null
}

/**
 * บันทึกงานยางหลายรายการของรถ 1 คันในครั้งเดียว
 *
 * ลำดับการทำงานถูกจัดให้อัตโนมัติ เพื่อให้ตำแหน่งล้อไม่ชนกันระหว่างทาง
 *   1) ผูกยางที่ช่างคีย์เอง (ยังไม่มีในระบบ) เข้าตำแหน่งเดิมย้อนหลัง
 *   2) ถอดยางทุกเส้นที่ต้องถอด
 *   3) ใส่ยางทุกเส้นตามตำแหน่งที่เลือก
 *
 * ทั้งหมดรันใน RPC เดียว = ทรานแซกชันเดียว ถ้าพลาดรายการใดจะ rollback ทั้งชุด
 *
 * @param input รถ เลขไมล์ วันที่ และรายการงานทั้งหมด
 * @returns จำนวนรายการที่บันทึก
 */
export async function applyServiceBatchAction(
  input: ServiceBatchInput,
): Promise<ActionResult<{ count: number }>> {
  await requireSession(['admin', 'technician'])
  const parsed = batchSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)

  const { vehicle_id, odometer, event_date, items } = parsed.data
  const supabase = await createClient()

  const preMounts: TireOp[] = []
  const unmounts: TireOp[] = []
  const mounts: TireOp[] = []
  /** ยางที่สร้างใหม่ในรอบนี้ ใช้ลบทิ้งถ้าบันทึกไม่สำเร็จ */
  const createdTireIds: string[] = []

  /** ลบยางที่เพิ่งสร้าง เพื่อไม่ให้ค้างเป็นข้อมูลขยะเมื่อบันทึกไม่สำเร็จ */
  async function rollbackCreatedTires() {
    for (const id of createdTireIds) {
      await supabase.from('tires').delete().eq('id', id).eq('status', 'in_stock')
    }
  }

  for (const [index, item] of items.entries()) {
    const at = `รายการที่ ${index + 1}`

    if (item.kind === 'manual_unmount') {
      const manual = item.manual
      if (!manual) {
        await rollbackCreatedTires()
        return { ok: false, error: `${at}: ไม่มีข้อมูลยางที่คีย์เอง` }
      }
      if (!item.position_code) {
        await rollbackCreatedTires()
        return { ok: false, error: `${at}: กรุณาเลือกตำแหน่งล้อ` }
      }

      const mountedOdometer = manual.mounted_odometer ?? odometer
      if (mountedOdometer > odometer) {
        await rollbackCreatedTires()
        return { ok: false, error: `${at}: เลขไมล์ตอนใส่ยางต้องไม่มากกว่าเลขไมล์ปัจจุบัน` }
      }

      // ซีรีย์นี้อาจมีอยู่แล้วแต่หน้าช่างมองไม่เห็น (เช่น ตัดจำหน่ายแล้ว หรืออยู่ในคลัง)
      // ต้องใช้เส้นเดิม ไม่งั้นชน unique (company_id, serial_no) และประวัติยางขาดตอน
      const { data: existingTire, error: existingError } = await supabase
        .from('tires')
        .select('id, serial_no, status, vehicle_id, position_code')
        .eq('serial_no', manual.serial_no)
        .maybeSingle()
      if (existingError) {
        await rollbackCreatedTires()
        return fail(existingError)
      }

      if (existingTire) {
        if (existingTire.status === 'mounted' && existingTire.vehicle_id !== vehicle_id) {
          await rollbackCreatedTires()
          return {
            ok: false,
            error: `${at}: ซีรีย์ ${existingTire.serial_no} ติดตั้งอยู่บนรถคันอื่น — ตรวจสอบซีรีย์ยางอีกครั้ง`,
          }
        }

        // ติดตั้งอยู่ที่ล้อนี้อยู่แล้ว = ถอดได้เลย ไม่ต้องผูกย้อนหลัง
        const alreadyHere =
          existingTire.status === 'mounted' && existingTire.position_code === item.position_code
        if (!alreadyHere) {
          preMounts.push({
            op: 'mount',
            tire_id: existingTire.id,
            position_code: item.position_code,
            odometer: mountedOdometer,
            note: 'บันทึกย้อนหลัง (ระบบไม่มีข้อมูลว่ายางเส้นนี้อยู่ที่ล้อนี้)',
          })
        }
        unmounts.push({
          op: 'unmount',
          tire_id: existingTire.id,
          odometer,
          tread_mm: item.tread_mm,
          reason_id: item.reason_id,
          note: item.note,
        })
        continue
      }

      // ยังไม่มีรุ่นในแคตตาล็อกแต่ช่างพิมพ์ยี่ห้อมา → สร้างยี่ห้อ/รุ่นให้อัตโนมัติ
      let modelId = manual.tire_model_id
      if (!modelId && manual.brand_name) {
        const ensured = await ensureBrandModel(manual.brand_name, manual.model_name, manual.size)
        if (!ensured.ok) {
          await rollbackCreatedTires()
          return ensured
        }
        modelId = ensured.data?.modelId ?? null
      }

      const created = await createTire({
        serial_no: manual.serial_no,
        tire_model_id: modelId,
        brand_name: manual.brand_name,
        model_name: manual.model_name,
        size: manual.size,
        dot: manual.dot,
        new_tread_mm: manual.new_tread_mm,
        tread_mm: item.tread_mm,
        note: item.note,
      })
      if (!created.ok) {
        await rollbackCreatedTires()
        return { ok: false, error: `${at}: ${created.error}` }
      }

      const tireId = created.data!.id
      createdTireIds.push(tireId)

      preMounts.push({
        op: 'mount',
        tire_id: tireId,
        position_code: item.position_code,
        odometer: mountedOdometer,
        note: 'บันทึกย้อนหลัง (ยางไม่มีข้อมูลในระบบ)',
      })
      unmounts.push({
        op: 'unmount',
        tire_id: tireId,
        odometer,
        tread_mm: item.tread_mm,
        reason_id: item.reason_id,
        note: item.note,
      })
      continue
    }

    if (item.kind === 'manual_mount') {
      // ยางที่ช่างคีย์เองตอนใส่ (ยังไม่มีในคลัง) → สร้างเข้าระบบก่อนแล้วค่อยใส่
      const manual = item.manual
      if (!manual) {
        await rollbackCreatedTires()
        return { ok: false, error: `${at}: ไม่มีข้อมูลยางที่คีย์เอง` }
      }
      if (!item.position_code) {
        await rollbackCreatedTires()
        return { ok: false, error: `${at}: กรุณาเลือกตำแหน่งล้อที่จะใส่ยาง` }
      }

      // เช็คซ้ำจากซีรีย์ยางอย่างเดียว — ครอบคลุมยางที่หน้าช่างมองไม่เห็น (เช่น ตัดจำหน่ายแล้ว)
      const { data: existingTire, error: existingError } = await supabase
        .from('tires')
        .select('id, serial_no, status, vehicle_id')
        .eq('serial_no', manual.serial_no)
        .maybeSingle()
      if (existingError) {
        await rollbackCreatedTires()
        return fail(existingError)
      }

      if (existingTire) {
        if (item.new_tire) {
          await rollbackCreatedTires()
          return {
            ok: false,
            error: `${at}: ซีรีย์ ${existingTire.serial_no} มีอยู่ในระบบแล้ว — ยางใหม่ต้องเป็นซีรีย์ที่ยังไม่เคยบันทึก`,
          }
        }
        // ยางเก่า: ซ้ำเฉพาะเมื่อซีรีย์นั้นยังติดตั้งอยู่บนรถ ต้องถอดออกก่อนถึงจะเอาไปใส่ที่อื่นได้
        if (existingTire.status === 'mounted') {
          await rollbackCreatedTires()
          return {
            ok: false,
            error: `${at}: ซีรีย์ ${existingTire.serial_no} ติดตั้งอยู่บนรถคันอื่น — ต้องถอดออกก่อน`,
          }
        }
        // ไม่ได้ติดตั้งอยู่ = ใช้ยางเส้นเดิม ไม่สร้างซ้ำ ประวัติยางจะได้ต่อเนื่อง
        mounts.push({
          op: 'mount',
          tire_id: existingTire.id,
          position_code: item.position_code,
          odometer,
          tread_mm: item.tread_mm,
          note: item.note,
        })
        continue
      }

      let modelId = manual.tire_model_id
      if (!modelId && manual.brand_name) {
        const ensured = await ensureBrandModel(manual.brand_name, manual.model_name, manual.size)
        if (!ensured.ok) {
          await rollbackCreatedTires()
          return ensured
        }
        modelId = ensured.data?.modelId ?? null
      }

      const created = await createTire({
        serial_no: manual.serial_no,
        tire_model_id: modelId,
        brand_name: manual.brand_name,
        model_name: manual.model_name,
        size: manual.size,
        dot: manual.dot,
        new_tread_mm: manual.new_tread_mm,
        tread_mm: item.tread_mm,
        note: item.note,
      })
      if (!created.ok) {
        await rollbackCreatedTires()
        return { ok: false, error: `${at}: ${created.error}` }
      }

      const tireId = created.data!.id
      createdTireIds.push(tireId)

      mounts.push({
        op: 'mount',
        tire_id: tireId,
        position_code: item.position_code,
        odometer,
        tread_mm: item.tread_mm,
        note: item.note,
      })
      continue
    }

    if (!item.tire_id) {
      await rollbackCreatedTires()
      return { ok: false, error: `${at}: ไม่ได้ระบุยาง` }
    }

    if (item.kind === 'unmount') {
      unmounts.push({
        op: 'unmount',
        tire_id: item.tire_id,
        odometer,
        tread_mm: item.tread_mm,
        reason_id: item.reason_id,
        note: item.note,
      })
    } else {
      if (!item.position_code) {
        await rollbackCreatedTires()
        return { ok: false, error: `${at}: กรุณาเลือกตำแหน่งล้อที่จะใส่ยาง` }
      }
      if (item.new_tire) {
        // เลือกยางเส้นที่มีอยู่แล้วมาใส่เป็น "ยางใหม่" ไม่ได้ — ซีรีย์ซ้ำกับของเดิม
        await rollbackCreatedTires()
        return {
          ok: false,
          error: `${at}: ซีรีย์นี้มีอยู่ในระบบแล้ว — ยางใหม่ต้องเป็นซีรีย์ที่ยังไม่เคยบันทึก`,
        }
      }
      mounts.push({
        op: 'mount',
        tire_id: item.tire_id,
        position_code: item.position_code,
        odometer,
        tread_mm: item.tread_mm,
        note: item.note,
      })
    }
  }

  const ops = [...preMounts, ...unmounts, ...mounts]

  const { error } = await supabase.rpc('apply_tire_ops', {
    p_vehicle_id: vehicle_id,
    p_event_date: event_date,
    p_ops: ops,
  })

  if (error) {
    await rollbackCreatedTires()
    return fail(error)
  }

  revalidateService()
  return { ok: true, data: { count: items.length } }
}

/* ============================================================
 * หน้าช่าง: เพิ่มคำค้นที่ไม่มีในแคตตาล็อกเป็นรายการรอตรวจสอบ
 * ============================================================ */

const companyTireModelSchema = z.object({
  /** คำค้นดิบจากหน้างาน — super admin จะแก้เป็นยี่ห้อ รุ่น และขนาดที่ถูกต้องภายหลัง */
  label: z.string().trim().min(1, 'กรุณาพิมพ์ข้อมูลยาง').max(40, 'ข้อมูลยางยาวเกิน 40 ตัวอักษร'),
})

export type CompanyTireModelInput = z.input<typeof companyTireModelSchema>

export interface CompanyTireModelResult {
  id: string
  brand_name: string
  model_name: string
  size: string | null
  new_tread_mm: number | null
}

/**
 * เพิ่มคำค้นเป็นรุ่นยางรอตรวจสอบของบริษัทที่ผู้ใช้สังกัด
 *
 * ใช้ตอนช่างหายางในรายการไม่เจอหน้างาน โดยไม่ต้องกรอกฟอร์มเพิ่มยี่ห้อ/รุ่น
 * ระบบเก็บคำค้นไว้เป็นขนาดชั่วคราวภายใต้ยี่ห้อรอตรวจสอบของบริษัทนั้น
 * และติด created_by_company เพื่อให้ super admin เห็นที่มาและแก้รายละเอียดภายหลัง
 *
 * @param input คำค้นขนาด/ยี่ห้อ/รุ่นที่ช่างพิมพ์
 */
export async function addCompanyTireModelAction(
  input: CompanyTireModelInput,
): Promise<ActionResult<CompanyTireModelResult>> {
  const { company } = await requireSession(['admin', 'technician'])
  if (!company) return { ok: false, error: 'บัญชีนี้ยังไม่ได้ผูกกับบริษัท' }

  const parsed = companyTireModelSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)
  const data = parsed.data
  const pendingBrandName = `รอตรวจสอบ (${company.code})`
  const pendingModelName = 'ข้อมูลจากหน้างาน'

  // แยกยี่ห้อรอตรวจสอบต่อบริษัท ป้องกันข้อมูลชั่วคราวของคนละบริษัทชนกัน
  const brand = await ensureBrandModel(pendingBrandName)
  if (!brand.ok) return brand
  const brandId = brand.data!.brandId

  const supabase = await createClient()

  // คำค้นเดิมของบริษัทนี้ = ใช้รายการเดิม ไม่สร้างซ้ำ
  const { data: existing, error: findError } = await supabase
    .from('tire_models')
    .select('id, name, size, new_tread_mm, tire_brands(name)')
    .eq('brand_id', brandId)
    .ilike('name', pendingModelName)
    .ilike('size', data.label)
    .maybeSingle()
  if (findError) return fail(findError)

  const toResult = (row: {
    id: string
    name: string
    size: string | null
    new_tread_mm: number | null
    tire_brands: { name: string } | { name: string }[] | null
  }): CompanyTireModelResult => {
    const brands = row.tire_brands
    return {
      id: row.id,
      brand_name: (Array.isArray(brands) ? brands[0]?.name : brands?.name) ?? pendingBrandName,
      model_name: row.name,
      size: row.size,
      new_tread_mm: row.new_tread_mm,
    }
  }

  if (existing) {
    revalidateService()
    return { ok: true, data: toResult(existing) }
  }

  const { data: created, error: createError } = await supabase
    .from('tire_models')
    .insert({
      brand_id: brandId,
      name: pendingModelName,
      size: data.label,
      created_by_company: company.id,
    })
    .select('id, name, size, new_tread_mm, tire_brands(name)')
    .single()

  if (createError) return fail(createError)

  revalidateService()
  return { ok: true, data: toResult(created) }
}

/* ============================================================
 * หน้าช่าง: คีย์ทะเบียนแล้วเริ่มงานได้เลย
 * ============================================================ */

const serviceVehicleSchema = z.object({
  plate_no: z
    .string()
    .trim()
    .min(1, 'กรุณากรอกทะเบียนรถ')
    .max(20)
    .regex(PLATE_PATTERN, PLATE_PATTERN_MESSAGE),
  province: z.string().trim().min(1, 'กรุณาเลือกจังหวัด').max(60),
  axle_type: z.string().trim().min(1, 'กรุณาเลือกประเภทรถ').max(30),
})

export type ServiceVehicleInput = z.input<typeof serviceVehicleSchema>

export interface ServiceVehicleResult {
  id: string
  plate_no: string
  province: string
  axle_type: string
  current_mileage: number
  /** true = เพิ่งสร้างรถคันนี้ให้จากหน้าช่าง */
  created: boolean
}

/**
 * หา (หรือสร้าง) รถจากทะเบียนที่ช่างคีย์หน้างาน แล้วตั้งประเภทรถให้ตรงกับที่เลือก
 *
 * ช่างทำงานกับรถที่แอดมินยังไม่ได้บันทึกไว้ได้ ระบบจะสร้างให้อัตโนมัติ
 * เพื่อไม่ให้ต้องรอแอดมินหน้างาน (RLS จำกัดให้อยู่ในบริษัทของช่างเองอยู่แล้ว)
 *
 * @param input ทะเบียน จังหวัด และรหัสประเภทเพลาที่ช่างเลือก
 */
export async function ensureServiceVehicleAction(
  input: ServiceVehicleInput,
): Promise<ActionResult<ServiceVehicleResult>> {
  const { company } = await requireSession(['admin', 'technician'])
  if (!company) return { ok: false, error: 'บัญชีนี้ยังไม่ได้ผูกกับบริษัท' }

  const parsed = serviceVehicleSchema.safeParse(input)
  if (!parsed.success) return zodFail(parsed.error)
  const data = parsed.data

  const supabase = await createClient()

  const { data: axleType, error: axleTypeError } = await supabase
    .from('axle_types')
    .select('code, is_active')
    .eq('code', data.axle_type)
    .maybeSingle()
  if (axleTypeError) return fail(axleTypeError)
  if (!axleType?.is_active) {
    return { ok: false, error: 'ประเภทรถนี้ถูกปิดใช้งานแล้ว — แจ้งแอดมินเพื่อเปิดใช้งาน' }
  }

  const { data: existing, error: findError } = await supabase
    .from('vehicles')
    .select('id, plate_no, province, axle_type, current_mileage')
    .eq('plate_no', data.plate_no)
    .maybeSingle()
  if (findError) return fail(findError)

  if (existing) {
    // เปลี่ยนประเภทรถได้เฉพาะตอนที่ยังไม่มียางติดตั้งอยู่ ไม่งั้นตำแหน่งล้อเดิมจะเพี้ยน
    if (existing.axle_type !== data.axle_type) {
      const { count, error: countError } = await supabase
        .from('tires')
        .select('id', { count: 'exact', head: true })
        .eq('vehicle_id', existing.id)
        .eq('status', 'mounted')
      if (countError) return fail(countError)
      if ((count ?? 0) > 0) {
        return {
          ok: false,
          error:
            `รถคันนี้บันทึกไว้เป็นประเภทอื่น และมียางติดตั้งอยู่ ${count} เส้น ` +
            'จึงเปลี่ยนประเภทรถจากหน้าช่างไม่ได้ — แจ้งแอดมินให้แก้ข้อมูลรถ',
        }
      }

      const { error: updateError } = await supabase
        .from('vehicles')
        .update({ axle_type: data.axle_type })
        .eq('id', existing.id)
      if (updateError) return fail(updateError)
    }

    revalidateService()
    return {
      ok: true,
      data: { ...existing, axle_type: data.axle_type, created: false },
    }
  }

  const { data: created, error: createError } = await supabase
    .from('vehicles')
    .insert({
      company_id: company.id,
      plate_no: data.plate_no,
      province: data.province,
      axle_type: data.axle_type,
      current_mileage: 0,
    })
    .select('id, plate_no, province, axle_type, current_mileage')
    .single()

  if (createError) {
    if (createError.code === '23505') {
      return { ok: false, error: 'ทะเบียนนี้มีอยู่ในระบบแล้ว — ลองค้นหาใหม่อีกครั้ง' }
    }
    return fail(createError)
  }

  revalidateService()
  return { ok: true, data: { ...created, created: true } }
}

function revalidateService() {
  revalidatePath('/service')
  revalidatePath('/dashboard')
  revalidatePath('/tires')
  revalidatePath('/vehicles')
}
