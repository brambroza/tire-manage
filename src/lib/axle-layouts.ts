/**
 * ผังตำแหน่งล้อตาม "ประเภทเพลา" ของรถ
 * ใช้ทั้งวาดแผนผังให้ช่างกดเลือก และเป็นชุดรหัสตำแหน่งที่เก็บลง DB
 *
 * รหัสตำแหน่ง (position_code) รูปแบบ: A{เพลา}{ด้าน}{นอก/ใน}
 *   ตัวอย่าง A1L = เพลา 1 ซ้าย, A3RO = เพลา 3 ขวานอก
 */

import type { AxleKind, AxleType } from '@/lib/database.types'

export type WheelSide = 'L' | 'R'

export interface WheelPosition {
  /** เลขล้อประจำตำแหน่ง เรียง 1..n จากเพลาหน้าไปหลัง ซ้ายไปขวา */
  no: number
  /** รหัสตำแหน่งที่เก็บลงฐานข้อมูล */
  code: string
  /** ชื่อภาษาไทยแบบสั้น เช่น "เพลา 2 ซ้ายนอก" */
  label: string
  /** ชื่อย่อสำหรับแสดงในวงล้อ เช่น "2LO" */
  short: string
  /** ชื่อไทยสั้นสำหรับแสดงบนปุ่มล้อ เช่น "ซ้ายนอก" */
  shortLabel: string
  axle: number
  side: WheelSide
  /** พิกัดบนผัง (viewBox 0-100 x 0-100) */
  x: number
  y: number
}

export interface AxleLayout {
  code: string
  name: string
  wheelCount: number
  positions: WheelPosition[]
}

export type AxleTypeLayoutSource = Pick<AxleType, 'code' | 'name' | 'axle_kinds'>

const SIDE_LABEL: Record<WheelSide, string> = { L: 'ซ้าย', R: 'ขวา' }

/** สร้าง layout จากรายการเพลา (เรียงจากหน้าไปหลัง) */
export function buildLayout(
  code: string,
  name: string,
  axles: readonly AxleKind[],
): AxleLayout {
  const positions: WheelPosition[] = []
  const top = 18
  const bottom = 88
  const step = axles.length > 1 ? (bottom - top) / (axles.length - 1) : 0

  axles.forEach((kind, i) => {
    const axleNo = i + 1
    const y = Math.round(top + step * i)

    const cells: Array<{ side: WheelSide; suffix: string; word: string; x: number }> =
      kind === 'single'
        ? [
            { side: 'L', suffix: 'L', word: '', x: 26 },
            { side: 'R', suffix: 'R', word: '', x: 74 },
          ]
        : [
            { side: 'L', suffix: 'LO', word: 'นอก', x: 16 },
            { side: 'L', suffix: 'LI', word: 'ใน', x: 32 },
            { side: 'R', suffix: 'RI', word: 'ใน', x: 68 },
            { side: 'R', suffix: 'RO', word: 'นอก', x: 84 },
          ]

    cells.forEach((c) => {
      positions.push({
        no: positions.length + 1,
        code: `A${axleNo}${c.suffix}`,
        label: `เพลา ${axleNo} ${SIDE_LABEL[c.side]}${c.word}`,
        short: `${axleNo}${c.suffix}`,
        shortLabel: `${SIDE_LABEL[c.side]}${c.word}`,
        axle: axleNo,
        side: c.side,
        x: c.x,
        y,
      })
    })
  })

  return { code, name, wheelCount: positions.length, positions }
}

/** ค่า fallback ระหว่าง deploy migration และสำหรับประวัติเก่าที่ไม่มีแถวในฐานข้อมูล */
export const DEFAULT_AXLE_TYPES: AxleTypeLayoutSource[] = [
  { code: '4W', name: 'รถ 4 ล้อ (เพลาเดี่ยว 2 เพลา)', axle_kinds: ['single', 'single'] },
  { code: '6W', name: 'รถ 6 ล้อ (หน้าเดี่ยว หลังคู่)', axle_kinds: ['single', 'dual'] },
  { code: '10W', name: 'รถ 10 ล้อ (หน้าเดี่ยว หลังคู่ 2 เพลา)', axle_kinds: ['single', 'dual', 'dual'] },
  { code: '12W', name: 'รถ 12 ล้อ (หน้าเดี่ยว 2 เพลา หลังคู่ 2 เพลา)', axle_kinds: ['single', 'single', 'dual', 'dual'] },
  { code: 'TRAILER_2', name: 'หางพ่วง 2 เพลา (8 ล้อ)', axle_kinds: ['dual', 'dual'] },
  { code: 'TRAILER_3', name: 'หางพ่วง 3 เพลา (12 ล้อ)', axle_kinds: ['dual', 'dual', 'dual'] },
]

export const AXLE_LAYOUTS: Record<string, AxleLayout> = Object.fromEntries(
  DEFAULT_AXLE_TYPES.map((type) => [
    type.code,
    buildLayout(type.code, type.name, type.axle_kinds),
  ]),
)

export const AXLE_OPTIONS = Object.values(AXLE_LAYOUTS).map((l) => ({
  value: l.code,
  label: `${l.name} · ${l.wheelCount} เส้น`,
}))

/**
 * ดึงผังล้อของรถ
 * @param axleType รหัสประเภทเพลา ถ้าไม่พบจะ fallback เป็น 10W
 */
export function getLayout(
  axleType: string | null | undefined,
  axleTypes?: readonly AxleTypeLayoutSource[],
): AxleLayout {
  const definition = axleTypes?.find((type) => type.code === axleType)
  if (definition) {
    return buildLayout(definition.code, definition.name, definition.axle_kinds)
  }
  return AXLE_LAYOUTS[axleType ?? ''] ?? AXLE_LAYOUTS['10W']
}

/**
 * เลขล้อประจำตำแหน่ง (ตัวเลขเดียวกับที่แสดงกลางล้อบนแผนผัง)
 * @param code รหัสตำแหน่ง เช่น A2LO
 * @returns เลขล้อ 1..n หรือ null ถ้าไม่พบในผังของรถคันนั้น
 */
export function positionNo(
  code: string | null | undefined,
  axleType?: string | null,
  axleTypes?: readonly AxleTypeLayoutSource[],
): number | null {
  if (!code) return null
  return getLayout(axleType, axleTypes).positions.find((p) => p.code === code)?.no ?? null
}

/**
 * แปลงรหัสตำแหน่งเป็นชื่อภาษาไทย
 * @param code รหัสตำแหน่ง เช่น A2LO
 */
export function positionLabel(
  code: string | null | undefined,
  axleType?: string | null,
  axleTypes?: readonly AxleTypeLayoutSource[],
): string {
  if (!code) return '-'
  const found = getLayout(axleType, axleTypes).positions.find((p) => p.code === code)
  if (found) return found.label
  // fallback สำหรับรถที่เปลี่ยนประเภทเพลาภายหลัง
  const m = /^A(\d+)(L|R)(O|I)?$/.exec(code)
  if (!m) return code
  const inout = m[3] === 'O' ? 'นอก' : m[3] === 'I' ? 'ใน' : ''
  return `เพลา ${m[1]} ${SIDE_LABEL[m[2] as WheelSide]}${inout}`
}
