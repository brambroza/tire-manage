/**
 * ค่าคงที่ของตัวกรองสาขา (?branch=) — แยกไฟล์ไว้เพราะต้องใช้ทั้งฝั่ง server (page.tsx)
 * และฝั่ง client (vehicles-client.tsx) ซึ่ง export ค่าที่ไม่ใช่ component ข้าม 'use client' ไม่ได้
 */

/** ค่าของ query param `branch` ที่หมายถึง "รถที่ยังไม่ระบุสาขา" */
export const BRANCH_FILTER_NONE = '__none__'

/** ข้อความแสดงผลของสาขาที่ยังไม่ระบุ — ใช้ให้ตรงกันทั้งตัวกรอง ตาราง และไฟล์ส่งออก */
export const BRANCH_NONE_LABEL = 'ไม่ระบุสาขา'

/**
 * ข้อความอธิบายตัวกรองสาขาที่ใช้อยู่ สำหรับหัวรายงานส่งออก
 * @param param ค่า ?branch= จาก URL (ว่าง/undefined = ทุกสาขา)
 */
export function branchFilterLabel(param: string | null | undefined): string {
  if (!param) return ''
  return param === BRANCH_FILTER_NONE ? BRANCH_NONE_LABEL : param
}
