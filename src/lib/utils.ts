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

export const TIRE_STATUS_LABEL: Record<TireStatus, string> = {
  in_stock: 'อยู่ในคลัง',
  mounted: 'ใช้งานอยู่',
  scrapped: 'ตัดจำหน่าย',
  retreading: 'ส่งหล่อดอก',
}

export const TIRE_STATUS_TONE: Record<TireStatus, 'sky' | 'emerald' | 'slate' | 'amber'> = {
  in_stock: 'slate',
  mounted: 'emerald',
  scrapped: 'amber',
  retreading: 'sky',
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
