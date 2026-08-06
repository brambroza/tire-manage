import { z } from 'zod'
import { toErrorMessage } from '@/lib/utils'

/** ผลลัพธ์มาตรฐานของ server action ทุกตัวในระบบ */
export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

/** แปลง ZodError เป็น fieldErrors สำหรับแสดงใต้ช่องกรอก */
export function zodFail(error: z.ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
  }
  return { ok: false, error: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง', fieldErrors }
}

/** แปลง error ใด ๆ เป็น ActionResult ที่ล้มเหลว */
export function fail(error: unknown): ActionResult<never> {
  return { ok: false, error: toErrorMessage(error) }
}

/**
 * ตัวช่วย: ข้อความที่ยอมให้ว่างได้ — ค่าว่าง/ไม่ส่งมา จะกลายเป็น null
 * ใช้ .optional() เพื่อให้ field นี้เป็น key ที่ไม่บังคับใน z.input ของฟอร์ม
 */
export const optionalText = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null))

/** ตัวช่วย: ตัวเลขที่ยอมให้ว่างได้ — ค่าว่าง/ไม่ส่งมา จะกลายเป็น null */
export const optionalNumber = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .transform((v) => (v === '' || v === null || v === undefined ? null : Number(v)))
  .refine((v) => v === null || Number.isFinite(v), 'ตัวเลขไม่ถูกต้อง')
