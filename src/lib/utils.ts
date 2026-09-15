import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import type { TireStatus } from '@/lib/database.types'

/** รวม class ของ tailwind แบบไม่ชนกัน */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * จัดรูปแบบตัวเลขแบบไทย
 * @param n ตัวเลข
 * @param digits จำนวนทศนิยม
 */
export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '-'
  return n.toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** จัดรูปแบบระยะทาง เช่น "128,560 กม." */
export function formatKm(n: number | null | undefined): string {
  return n === null || n === undefined ? '-' : `${formatNumber(n)} กม.`
}

/** จัดรูปแบบเงินบาท */
export function formatBaht(n: number | null | undefined): string {
  return n === null || n === undefined ? '-' : `${formatNumber(n, 2)} บาท`
}

/**
 * แปลงวันที่เป็นรูปแบบไทย (พ.ศ.)
 * @param value ISO string หรือ Date
 * @param withTime ใส่เวลาด้วยหรือไม่
 */
export function formatThaiDate(value: string | Date | null | undefined, withTime = false): string {
  if (!value) return '-'
  const d = typeof value === 'string' ? new Date(value) : value
  if (Number.isNaN(d.getTime())) return '-'
  return d.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

/** วันที่วันนี้ในรูปแบบ YYYY-MM-DD สำหรับ input[type=date] */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

/** จำนวนวันระหว่างสองวันที่ (อย่างน้อย 0) */
export function diffDays(startISO: string, endISO: string): number {
  const start = new Date(startISO).getTime()
  const end = new Date(endISO).getTime()
  return Math.max(0, Math.floor((end - start) / 86_400_000))
}

/** จัดรูปแบบระยะเวลาใช้งาน เช่น "3 เดือน 5 วัน" — เดือนนับแบบ 30 วัน */
export function formatDuration(days: number | null | undefined): string {
  if (days === null || days === undefined || Number.isNaN(days)) return '-'
  if (days < 30) return `${days} วัน`
  const months = Math.floor(days / 30)
  const rest = days % 30
  return rest === 0 ? `${months} เดือน` : `${months} เดือน ${rest} วัน`
}

/* ------------------------------------------------------------------
 * กฎการกรอกข้อมูลหน้างาน (ใช้ร่วมกันทั้งฝั่ง client และ zod ใน server action)
 * ------------------------------------------------------------------ */

/** ทะเบียนส่วนหน้า (หมวด) ยาวได้ไม่เกิน 2 ตัว เช่น "70" หรือ "กข" */
export const PLATE_PREFIX_MAX = 2
/** ทะเบียนส่วนหลัง (เลข) ยาวได้ไม่เกิน 4 หลัก */
export const PLATE_NUMBER_MAX = 4
/** รูปแบบทะเบียนเต็ม เช่น "70-1234" หรือ "กข-12" */
export const PLATE_PATTERN = /^[ก-ฮ0-9]{1,2}-\d{1,4}$/
export const PLATE_PATTERN_MESSAGE = 'ทะเบียนต้องเป็น หมวด 1-2 ตัว (ไทย/เลข) ขีด เลขไม่เกิน 4 หลัก เช่น 70-1234'

/**
 * ตัดอักขระที่ใช้ในทะเบียนส่วนหน้าไม่ได้ออก (เหลือเฉพาะพยัญชนะไทยและตัวเลข) และจำกัดความยาว
 * @param value ค่าที่พิมพ์
 */
export function sanitizePlatePrefix(value: string): string {
  return value.replace(/[^ก-ฮ0-9]/g, '').slice(0, PLATE_PREFIX_MAX)
}

/**
 * ตัดอักขระที่ไม่ใช่ตัวเลขออกจากทะเบียนส่วนหลัง และจำกัดความยาว
 * @param value ค่าที่พิมพ์
 */
export function sanitizePlateNumber(value: string): string {
  return value.replace(/\D/g, '').slice(0, PLATE_NUMBER_MAX)
}

/** เลขไมล์สูงสุดที่ระบบรับ (6 หลัก) */
export const ODOMETER_MAX = 999_999
export const ODOMETER_MAX_MESSAGE = 'เลขไมล์ต้องไม่เกิน 6 หลัก (999,999 กม.)'

/**
 * เหลือเฉพาะตัวเลขและตัดให้ไม่เกิน 6 หลัก สำหรับช่องกรอกเลขไมล์
 * @param value ค่าที่พิมพ์ (อาจมีจุลภาคคั่นหลัก)
 */
export function sanitizeOdometer(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

/**
 * ใส่จุลภาคคั่นหลักพันให้ตัวเลขที่กำลังคีย์ เช่น "555505" → "555,505"
 * @param digits ตัวเลขล้วน (ว่างได้)
 */
export function groupDigits(digits: string): string {
  if (digits === '') return ''
  return Number(digits).toLocaleString('en-US')
}

/** ซีรีย์ยางยาวได้ไม่เกินกี่ตัว */
export const SERIAL_MAX = 30
/** ซีรีย์ยางรับเฉพาะตัวเลข ตัวอักษรอังกฤษพิมพ์ใหญ่ และขีดกลาง */
export const SERIAL_PATTERN = /^[A-Z0-9-]+$/
export const SERIAL_PATTERN_MESSAGE = 'ซีรีย์ยางใช้ได้เฉพาะตัวเลขและตัวอักษรภาษาอังกฤษ'

/**
 * แปลงซีรีย์ยางให้เป็นรูปแบบมาตรฐาน: ตัวพิมพ์ใหญ่ ไม่มีช่องว่างหรืออักขระพิเศษ
 * ใช้ทั้งตอนพิมพ์และก่อนบันทึก เพื่อให้ "abc123" กับ "ABC123" ถือเป็นเส้นเดียวกัน
 * @param value ค่าที่พิมพ์
 */
export function sanitizeSerial(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, SERIAL_MAX)
}

export const TIRE_STATUS_LABEL: Record<TireStatus, string> = {
  in_stock: 'อยู่ในคลัง',
  mounted: 'ใช้งานอยู่',
  scrapped: 'ตัดจำหน่าย',
  retreading: 'ส่งหล่อดอก',
}

// เขียว = ใช้งาน, ฟ้า = พร้อมใช้ในคลัง, แดง = ตัดจำหน่าย, ส้ม = อยู่ระหว่างหล่อดอก
export const TIRE_STATUS_TONE: Record<TireStatus, 'sky' | 'emerald' | 'rose' | 'amber'> = {
  in_stock: 'sky',
  mounted: 'emerald',
  scrapped: 'rose',
  retreading: 'amber',
}

/**
 * คำนวณ % ดอกยางคงเหลือ
 * @param tread ดอกยางปัจจุบัน (มม.)
 * @param newTread ดอกยางตอนใหม่ (มม.)
 */
export function treadPercent(tread: number | null, newTread: number | null): number | null {
  if (tread === null || !newTread) return null
  return Math.max(0, Math.min(100, Math.round((tread / newTread) * 100)))
}

/** แปลง error จาก Supabase/Postgres ให้เป็นข้อความไทยที่อ่านรู้เรื่อง */
export function toErrorMessage(error: unknown): string {
  if (!error) return 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
  if (typeof error === 'string') return error
  const e = error as { message?: string; code?: string; details?: string }
  if (e.code === '23505') return 'ข้อมูลนี้มีอยู่ในระบบแล้ว (ค่าซ้ำ)'
  if (e.code === '23503') return 'ข้อมูลนี้ถูกอ้างอิงอยู่ ไม่สามารถดำเนินการได้'
  if (e.code === '42501') return 'คุณไม่มีสิทธิ์ดำเนินการนี้'
  return e.message || e.details || 'เกิดข้อผิดพลาด'
}
