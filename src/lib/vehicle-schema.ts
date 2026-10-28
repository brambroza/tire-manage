import { z } from 'zod'
// ใส่นามสกุล .ts เพื่อให้ชุดทดสอบรันด้วย node --test ได้โดยไม่ต้องแปลง alias @/
import { PLATE_PATTERN, PLATE_PATTERN_MESSAGE } from './utils.ts'

export const VEHICLE_NICKNAME_MAX = 100
export const VEHICLE_PLATE_MAX = 20
export const VEHICLE_PROVINCE_MAX = 60

/** ข้อความเมื่อไม่ได้กรอกทั้งทะเบียนและชื่อเรียก (ใช้ตรงกันทั้ง client และ server) */
export const VEHICLE_IDENTITY_MESSAGE = 'กรุณากรอกทะเบียนหรือชื่อเรียกรถอย่างน้อยหนึ่งอย่าง'
export const VEHICLE_PROVINCE_MESSAGE = 'กรุณาเลือกจังหวัดของทะเบียน'
/** ข้อความเมื่อชื่อเรียกซ้ำกับรถที่ไม่มีทะเบียนคันอื่นในบริษัท */
export const VEHICLE_NICKNAME_TAKEN_MESSAGE =
  'มีรถที่ไม่มีทะเบียนใช้ชื่อเรียกนี้อยู่แล้ว — ค้นหารถคันเดิมหรือตั้งชื่ออื่น'
/** ข้อความเมื่อทะเบียน + จังหวัดซ้ำกับรถคันอื่นในบริษัท */
export const VEHICLE_PLATE_TAKEN_MESSAGE = 'ทะเบียนนี้ (จังหวัดเดียวกัน) มีอยู่ในระบบแล้ว'

/** ค่าว่างกลายเป็น null เพื่อไม่ให้ข้อความว่างหลุดลงฐานข้อมูล */
const blankToNull = (value: string | null | undefined) => value || null

export const vehicleNicknameSchema = z.string().trim()
  .max(VEHICLE_NICKNAME_MAX, 'ชื่อเรียกรถต้องไม่เกิน 100 ตัวอักษร')
  .nullish()
  .transform(blankToNull)

/** ทะเบียนไม่บังคับ — กฎ "ต้องมีทะเบียนหรือชื่อเรียก" ตรวจที่ระดับ object ด้วย vehicleIdentityIssues */
export const vehiclePlateSchema = z.string().trim()
  .max(VEHICLE_PLATE_MAX, 'ทะเบียนต้องไม่เกิน 20 ตัวอักษร')
  .nullish()
  .transform(blankToNull)

export const vehicleProvinceSchema = z.string().trim()
  .max(VEHICLE_PROVINCE_MAX, 'ชื่อจังหวัดไม่ถูกต้อง')
  .nullish()
  .transform(blankToNull)

/** ช่องระบุตัวรถที่ทุกฟอร์มใช้ร่วมกัน (ฟอร์มแอดมินและหน้าช่าง) */
export const vehicleIdentityFields = {
  nickname: vehicleNicknameSchema,
  plate_no: vehiclePlateSchema,
  province: vehicleProvinceSchema,
}

export interface VehicleIdentityValues {
  nickname: string | null
  plate_no: string | null
  province: string | null
}

export interface VehicleIdentityIssue {
  path: 'plate_no' | 'province'
  message: string
}

/**
 * ตรวจกฎระบุตัวรถ: ต้องมีทะเบียนหรือชื่อเรียกอย่างน้อยหนึ่งอย่าง และทะเบียนต้องมาคู่จังหวัด
 * @param data ค่าหลังผ่าน vehicleIdentityFields แล้ว
 * @param checkPlatePattern true = ทะเบียนต้องตรงรูปแบบมาตรฐาน (รถใหม่หรือทะเบียนที่เปลี่ยน)
 */
export function vehicleIdentityIssues(
  data: VehicleIdentityValues,
  checkPlatePattern: boolean,
): VehicleIdentityIssue[] {
  if (!data.plate_no) {
    return data.nickname ? [] : [{ path: 'plate_no', message: VEHICLE_IDENTITY_MESSAGE }]
  }
  const issues: VehicleIdentityIssue[] = []
  if (checkPlatePattern && !PLATE_PATTERN.test(data.plate_no)) {
    issues.push({ path: 'plate_no', message: PLATE_PATTERN_MESSAGE })
  }
  if (!data.province) issues.push({ path: 'province', message: VEHICLE_PROVINCE_MESSAGE })
  return issues
}

/**
 * ใช้กับ superRefine ของ schema ที่มี vehicleIdentityFields
 * @param checkPlatePattern ค่าคงที่ หรือฟังก์ชันตัดสินจากข้อมูล (เช่น ข้ามเมื่อเลือกรถเดิมด้วย vehicle_id)
 */
export function refineVehicleIdentity<T extends VehicleIdentityValues>(
  checkPlatePattern: boolean | ((data: T) => boolean),
) {
  return (data: T, ctx: z.RefinementCtx) => {
    const check = typeof checkPlatePattern === 'function' ? checkPlatePattern(data) : checkPlatePattern
    for (const issue of vehicleIdentityIssues(data, check)) {
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message })
    }
  }
}

/**
 * ไม่มีทะเบียน = ไม่มีจังหวัด (กันค่าเริ่มต้นจากฟอร์มหลุดลงฐานข้อมูล) — ตรงกับ check constraint ของตาราง
 * @param data ค่าที่ผ่านการตรวจแล้ว
 */
export function normalizeVehicleIdentity<T extends VehicleIdentityValues>(data: T): T {
  return data.plate_no ? data : { ...data, province: null }
}

/**
 * แปลง unique violation (23505) ของตารางรถเป็นข้อความที่ชี้ช่องถูกต้อง
 * @param error ข้อผิดพลาดจาก Supabase
 */
export function vehicleUniqueViolation(
  error: { code?: string; message?: string } | null,
): { error: string; fieldErrors: Record<string, string> } | null {
  if (error?.code !== '23505') return null
  if (error.message?.includes('vehicles_nickname_only_unique')) {
    return { error: VEHICLE_NICKNAME_TAKEN_MESSAGE, fieldErrors: { nickname: VEHICLE_NICKNAME_TAKEN_MESSAGE } }
  }
  return { error: VEHICLE_PLATE_TAKEN_MESSAGE, fieldErrors: { plate_no: VEHICLE_PLATE_TAKEN_MESSAGE } }
}
