'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireSession } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ActionResult, fail, optionalNumber, optionalText, zodFail } from '@/lib/action-result'
import { createTire, ensureBrandModel } from '../tires/actions'

const unmountSchema = z.object({
  tire_id: z.string().uuid(),
  odometer: z.number().int().min(0, 'กรุณากรอกเลขไมล์'),
  tread_mm: optionalNumber,
  reason_id: optionalText,
  note: optionalText,
  event_date: z.string().min(1),
})

const mountSchema = z.object({
  tire_id: z.string().uuid(),
  vehicle_id: z.string().uuid(),
  position_code: z.string().min(1, 'กรุณาเลือกตำแหน่งล้อ'),
  odometer: z.number().int().min(0, 'กรุณากรอกเลขไมล์'),
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
  serial_no: z.string().trim().min(1, 'กรุณากรอกเลขยาง (ซีเรียล)').max(50),
  tire_model_id: optionalText,
  brand_name: optionalText,
  model_name: optionalText,
  size: optionalText,
  dot: optionalText,
  new_tread_mm: optionalNumber,
  /** เลขไมล์ตอนที่ยางเส้นนี้ถูกใส่ (ถ้าทราบ) — ใช้คำนวณระยะวิ่งรอบนี้ */
  mounted_odometer: optionalNumber,
  odometer: z.number().int().min(0, 'กรุณากรอกเลขไมล์'),
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

/**
 * สลับตำแหน่งยาง: ถอดออกแล้วใส่กลับที่ตำแหน่งใหม่ของรถคันเดิม
 * @param tireId รหัสยาง
 * @param vehicleId รหัสรถ
 * @param toPosition ตำแหน่งปลายทาง
 * @param odometer เลขไมล์ปัจจุบัน
 * @param treadMm ดอกยางที่วัดได้
 * @param eventDate วันที่ทำรายการ
 * @param reasonId สาเหตุ (ปกติคือ "สลับตำแหน่ง")
 */
export async function rotateTireAction(
  tireId: string,
  vehicleId: string,
  toPosition: string,
  odometer: number,
  treadMm: number | null,
  eventDate: string,
  reasonId: string | null,
): Promise<ActionResult> {
  const removed = await unmountTireAction({
    tire_id: tireId,
    odometer,
    tread_mm: treadMm,
    reason_id: reasonId,
    note: 'สลับตำแหน่งยาง',
    event_date: eventDate,
  })
  if (!removed.ok) return removed

  return mountTireAction({
    tire_id: tireId,
    vehicle_id: vehicleId,
    position_code: toPosition,
    odometer,
    tread_mm: treadMm,
    note: 'สลับตำแหน่งยาง',
    event_date: eventDate,
  })
}

/* ============================================================
 * บันทึกหลายรายการในครั้งเดียว (ถอด/ใส่/สลับ หลายเส้นต่อรถ 1 คัน)
 * ============================================================ */

const manualTireSchema = z.object({
  serial_no: z.string().trim().min(1, 'กรุณากรอกเลขยาง (ซีเรียล)').max(50),
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
  kind: z.enum(['unmount', 'mount', 'rotate', 'manual_unmount']),
  tire_id: optionalText,
  /** ตำแหน่งต้นทาง (ถอด/สลับ) หรือปลายทาง (ใส่) */
  position_code: optionalText,
  /** ตำแหน่งปลายทางของการสลับ */
  target_position: optionalText,
  tread_mm: optionalNumber,
  reason_id: optionalText,
  note: optionalText,
  manual: manualTireSchema.nullable().optional(),
})

const batchSchema = z.object({
  vehicle_id: z.string().uuid(),
  odometer: z.number().int().min(0, 'กรุณากรอกเลขไมล์'),
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
 *   2) ถอดยางทุกเส้นที่ต้องถอด (รวมต้นทางของการสลับ)
 *   3) ใส่ยางทุกเส้นตามตำแหน่งใหม่ (รวมปลายทางของการสลับ)
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
    } else if (item.kind === 'mount') {
      if (!item.position_code) {
        await rollbackCreatedTires()
        return { ok: false, error: `${at}: กรุณาเลือกตำแหน่งล้อที่จะใส่ยาง` }
      }
      mounts.push({
        op: 'mount',
        tire_id: item.tire_id,
        position_code: item.position_code,
        odometer,
        tread_mm: item.tread_mm,
        note: item.note,
      })
    } else {
      // rotate: ถอดจากตำแหน่งเดิมแล้วใส่กลับที่ตำแหน่งใหม่
      if (!item.target_position) {
        await rollbackCreatedTires()
        return { ok: false, error: `${at}: กรุณาเลือกตำแหน่งปลายทางของการสลับ` }
      }
      unmounts.push({
        op: 'unmount',
        tire_id: item.tire_id,
        odometer,
        tread_mm: item.tread_mm,
        reason_id: item.reason_id,
        note: item.note ?? 'สลับตำแหน่งยาง',
      })
      mounts.push({
        op: 'mount',
        tire_id: item.tire_id,
        position_code: item.target_position,
        odometer,
        tread_mm: item.tread_mm,
        note: item.note ?? 'สลับตำแหน่งยาง',
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

function revalidateService() {
  revalidatePath('/service')
  revalidatePath('/dashboard')
  revalidatePath('/tires')
  revalidatePath('/vehicles')
}
