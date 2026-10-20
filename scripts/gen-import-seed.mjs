#!/usr/bin/env node
/**
 * สร้างไฟล์ทดสอบสำหรับหน้า "นำเข้าซีรีย์ยางใหม่" (/tires/import)
 *
 * ไฟล์ที่ได้อยู่ใน docs/test-data/tire-import/ ดูวิธีใช้และผลที่คาดหวังใน README.md ของโฟลเดอร์นั้น
 * สคริปต์นี้ไม่แตะฐานข้อมูล ยางจะเข้าระบบก็ต่อเมื่อกดนำเข้าในหน้าเว็บเท่านั้น
 *
 * แคตตาล็อกในไฟล์อิงบริษัททดสอบ GO1 (Go Along co.,Ltd. · Premium) ณ 2026-10-20
 * ถ้าใช้กับบริษัทอื่น ให้แก้ค่าใน CATALOG ให้ตรงกับรุ่นที่บริษัทนั้นได้รับสิทธิ์
 *
 * วิธีใช้:
 *   node scripts/gen-import-seed.mjs            # prefix อัตโนมัติจากวันเวลา เช่น SD10201530
 *   node scripts/gen-import-seed.mjs SEEDA      # กำหนด prefix ของซีรีย์เอง
 *
 * ซีรีย์ทุกเส้นขึ้นต้นด้วย prefix เพื่อให้รันซ้ำได้โดยไม่ชนของเดิม และลบทิ้งทีหลังได้ง่าย
 */
import fs from 'node:fs'
import path from 'node:path'
import writeXlsxFile from 'write-excel-file/node'

const OUT_DIR = path.join(process.cwd(), 'docs', 'test-data', 'tire-import')

/** ซีรีย์ใช้ได้เฉพาะ A-Z 0-9 และขีด ยาวไม่เกิน 30 ตัว (ตาม SERIAL_PATTERN / SERIAL_MAX) */
const PREFIX_PATTERN = /^[A-Z0-9-]{1,12}$/

/**
 * prefix ของซีรีย์ — รับจาก argv หรือสร้างจากเดือน/วัน/ชั่วโมง/นาทีปัจจุบัน
 * @returns prefix ตัวพิมพ์ใหญ่
 */
function resolvePrefix() {
  const arg = (process.argv[2] ?? '').trim().toUpperCase()
  if (arg) {
    if (!PREFIX_PATTERN.test(arg)) {
      console.error('prefix ต้องเป็น A-Z 0-9 หรือ - ยาวไม่เกิน 12 ตัว')
      process.exit(1)
    }
    return arg
  }
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `SD${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}`
}

/** รุ่นที่ GO1 นำเข้าได้ = เฉพาะที่ super admin เปิดสิทธิ์ (ระบบไม่สร้างยี่ห้อ/รุ่นใหม่ระหว่างนำเข้า) */
const CATALOG = [
  { brand: 'CHENGSHAN', model: 'CST-35', size: '11R22.5 16PR' },
]

/** ขนาดของยี่ห้อ "อื่นๆ" ที่ GO1 ได้รับสิทธิ์ (ยี่ห้ออื่นๆ จับคู่ด้วยขนาดอย่างเดียว) */
const OTHER_SIZES = ['11R22.5 16PR', '11R22.5 18PR', '295/80R22.5 18PR', '10.00R20 18PR', '215/70R15']

/** หมายเหตุตัวอย่างสำหรับยางยี่ห้ออื่นๆ (บังคับกรอก) */
const OTHER_NOTES = ['DOUBLE COIN RR202', 'WESTLAKE CR976A', 'LINGLONG KTL200', 'TRIANGLE TR691', 'AEOLUS HN08']

/** ซีรีย์ที่มีอยู่แล้วใน GO1 — ใช้ทดสอบกรณีซ้ำกับในระบบ */
const EXISTING_SERIAL = 'UAT-IMP-003'

const HEADERS = ['ยี่ห้อ', 'รุ่น', 'ขนาด', 'ซีรีย์', 'หมายเหตุ']

/**
 * สร้างแถวที่ควรผ่านทั้งหมด
 * @param prefix prefix ซีรีย์
 * @param count จำนวนแถว
 * @param tag ตัวอักษรกลางซีรีย์ กันซ้ำระหว่างไฟล์
 * @returns แถวข้อมูล [ยี่ห้อ, รุ่น, ขนาด, ซีรีย์, หมายเหตุ]
 */
function validRows(prefix, count, tag) {
  const rows = []
  for (let i = 1; i <= count; i += 1) {
    const serial = `${prefix}-${tag}${String(i).padStart(4, '0')}`
    // ทุก 5 เส้นเป็นยี่ห้ออื่นๆ 1 เส้น ที่เหลือวนรุ่นในแคตตาล็อก
    if (i % 5 === 0) {
      const k = (i / 5 - 1) % OTHER_SIZES.length
      rows.push(['อื่นๆ', '', OTHER_SIZES[k], serial, OTHER_NOTES[k]])
    } else {
      const m = CATALOG[i % CATALOG.length]
      rows.push([m.brand, m.model, m.size, serial, i % 7 === 0 ? 'ล็อตทดสอบนำเข้า' : ''])
    }
  }
  return rows
}

/**
 * แถวทดสอบทุกกรณี พร้อมผลที่คาดหวัง (คอลัมน์ "ผลที่คาดหวัง" ระบบไม่อ่าน เพราะไม่ใช่หัวคอลัมน์ที่รู้จัก)
 * @param prefix prefix ซีรีย์
 * @returns แถวข้อมูล [ยี่ห้อ, รุ่น, ขนาด, ซีรีย์, หมายเหตุ, ผลที่คาดหวัง]
 */
function mixedRows(prefix) {
  const s = (n) => `${prefix}-M${String(n).padStart(3, '0')}`
  return [
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', s(1), '', 'ผ่าน · รุ่นตรงแคตตาล็อก'],
    ['chengshan', 'cst-35', '11r22.5   16pr', s(2), '', 'ผ่าน · ตัวพิมพ์เล็ก/ช่องว่างเกินต้องจับคู่ได้'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16 PR', s(3), '', 'ผ่าน · ขนาดมีช่องว่างคั่น'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', s(4).toLowerCase(), '', 'ผ่าน · ซีรีย์ตัวเล็กถูกแปลงเป็นตัวใหญ่'],
    ['อื่นๆ', '', '11R22.5 18PR', s(5), 'double coin rr202', 'ผ่าน · หมายเหตุถูกแปลงเป็นตัวใหญ่'],
    ['อื่น ๆ', '', '295/80R22.5 18PR', s(6), 'WESTLAKE CR976A', 'ผ่าน · "อื่น ๆ" มีช่องว่างยังนับเป็นอื่นๆ'],
    ['BRIDGESTONE', 'R150', '11R22.5 16PR', s(7), '', 'ไม่ผ่าน · ไม่มียี่ห้อนี้ในข้อมูลยาง ระบบไม่สร้างให้'],
    ['SAILUN', 'SAC1', '295/80R22.5 18PR', s(8), '', 'ไม่ผ่าน · รุ่นกลางที่บริษัทไม่ได้รับสิทธิ์'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', '', '', 'ไม่ผ่าน · ยังไม่ได้กรอก ซีรีย์'],
    ['', 'CST-35', '11R22.5 16PR', s(10), '', 'ไม่ผ่าน · ยังไม่ได้กรอก ยี่ห้อ'],
    ['CHENGSHAN', '', '11R22.5 16PR', s(11), '', 'ไม่ผ่าน · ยังไม่ได้กรอก รุ่น'],
    ['CHENGSHAN', 'CST-35', '', s(12), '', 'ไม่ผ่าน · ยังไม่ได้กรอก ขนาด'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', s(1), '', 'ไม่ผ่าน · ซีรีย์ซ้ำกับแถวที่ 2 ในไฟล์'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', EXISTING_SERIAL, '', 'ไม่ผ่าน · ซีรีย์มีในระบบแล้ว'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', `${prefix} M015`, '', 'ไม่ผ่าน · ซีรีย์มีช่องว่าง'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', `${prefix}/M016`, '', 'ไม่ผ่าน · ซีรีย์มีสัญลักษณ์ /'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', `${prefix}ยาง17`, '', 'ไม่ผ่าน · ซีรีย์มีตัวอักษรไทย'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', `${prefix}-M018-${'X'.repeat(30)}`, '', 'ไม่ผ่าน · ซีรีย์ยาวเกิน 30 ตัว'],
    ['อื่นๆ', '', '11R22.5 16PR', s(19), '', 'ไม่ผ่าน · ยี่ห้ออื่นๆ ต้องกรอกหมายเหตุ'],
    ['อื่นๆ', '', '12R22.5', s(20), 'TRIANGLE TR691', 'ไม่ผ่าน · ไม่มีรุ่นอื่นๆ ขนาด 12R22.5 ในแคตตาล็อก'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', s(21), 'ก'.repeat(201), 'ไม่ผ่าน · หมายเหตุยาวเกิน 200 ตัวอักษร'],
    ['B'.repeat(81), 'X1', '11R22.5', s(22), '', 'ไม่ผ่าน · ยี่ห้อยาวเกิน 80 ตัวอักษร'],
    ['', '', '', '', '', 'แถวว่าง · ต้องถูกข้าม ไม่นับเป็นแถว'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', s(24), 'แถวหลังบรรทัดว่าง', 'ผ่าน · อ่านต่อหลังแถวว่างได้'],
  ]
}

/**
 * เขียน CSV (UTF-8 + BOM ให้ Excel เปิดภาษาไทยได้)
 * @param file ชื่อไฟล์
 * @param rows ตาราง รวมหัวตาราง
 * @param delimiter ตัวคั่น
 */
function writeCsv(file, rows, delimiter = ',') {
  const esc = (v) => {
    const t = String(v ?? '')
    return /["\n\r,;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t
  }
  const body = rows.map((r) => r.map(esc).join(delimiter)).join('\r\n')
  fs.writeFileSync(path.join(OUT_DIR, file), `﻿${body}\r\n`, 'utf8')
}

/**
 * เขียน xlsx — ทุกเซลล์เป็นข้อความ ยกเว้น numericSerialRows ที่ตั้งใจให้ซีรีย์เป็นตัวเลขแบบ Excel
 * @param file ชื่อไฟล์
 * @param headers หัวตาราง
 * @param rows แถวข้อมูล
 * @param options numericSerialCol = index คอลัมน์ซีรีย์ที่จะแปลงเป็น number ถ้าเป็นตัวเลขล้วน
 */
async function writeXlsx(file, headers, rows, options = {}) {
  const header = headers.map((h) => ({ value: h, fontWeight: 'bold', backgroundColor: '#DDEBFF' }))
  const data = [
    header,
    ...rows.map((r) =>
      r.map((v, i) =>
        options.numericSerialCol === i && /^\d+$/.test(v)
          ? { value: Number(v), type: Number }
          : { value: String(v ?? ''), type: String },
      ),
    ),
  ]
  await writeXlsxFile(data, {
    sheet: 'ซีรีย์ยาง',
    columns: headers.map((h) => ({ width: h === 'ผลที่คาดหวัง' || h === 'หมายเหตุ' ? 48 : 20 })),
    stickyRowsCount: 1,
  }).toFile(path.join(OUT_DIR, file))
}

/** สร้างไฟล์ทดสอบทั้งหมด */
async function main() {
  const prefix = resolvePrefix()
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // 1) ไฟล์ผ่านทั้งหมด 50 เส้น — happy path
  await writeXlsx('01-valid-50.xlsx', HEADERS, validRows(prefix, 50, 'A'))

  // 2) ทุกกรณีผ่าน/ไม่ผ่าน พร้อมคอลัมน์ผลที่คาดหวัง
  await writeXlsx('02-mixed-cases.xlsx', [...HEADERS, 'ผลที่คาดหวัง'], mixedRows(prefix))

  // 3) CSV หัวอังกฤษ สลับลำดับคอลัมน์ ตัวคั่น ; มีคอลัมน์เกิน
  const csvRows = validRows(prefix, 20, 'C').map(([b, m, sz, se, n]) => [se, n, 'คลังกลาง', sz, m, b])
  writeCsv('03-english-headers-semicolon.csv', [['Serial No.', 'Remark', 'Warehouse', 'Size', 'Model', 'Brand'], ...csvRows], ';')

  // 4) ไม่มีคอลัมน์ซีรีย์ — ต้องแจ้งว่าไฟล์ไม่มีคอลัมน์ ซีรีย์
  writeCsv('04-missing-serial-column.csv', [
    ['ยี่ห้อ', 'รุ่น', 'ขนาด', 'หมายเหตุ'],
    ['CHENGSHAN', 'CST-35', '11R22.5 16PR', ''],
  ])

  // 5) ซีรีย์ตัวเลขล้วนที่ Excel เก็บเป็น number — ต้องไม่กลายเป็น 1.2E+9 หรือ 123.0
  //    ใช้ prefix ตัวเลขจากเวลา เพื่อรันซ้ำแล้วไม่ชน
  const numBase = Number(String(Date.now()).slice(-8)) * 100
  const numericRows = Array.from({ length: 5 }, (_, i) => {
    const m = CATALOG[i % CATALOG.length]
    return [m.brand, m.model, m.size, String(numBase + i), 'ซีรีย์ตัวเลขล้วน']
  })
  await writeXlsx('05-numeric-serials.xlsx', HEADERS, numericRows, { numericSerialCol: 3 })

  // 6) ขีดจำกัด 2000 แถว (ผ่าน) และ 2001 แถว (ต้องถูกปฏิเสธ)
  await writeXlsx('06-max-2000.xlsx', HEADERS, validRows(prefix, 2000, 'L'))
  await writeXlsx('07-over-limit-2001.xlsx', HEADERS, validRows(prefix, 2001, 'X'))

  // 8) ไฟล์ว่าง (มีแค่หัวตาราง)
  writeCsv('08-header-only.csv', [HEADERS])

  console.log(`สร้างไฟล์ทดสอบใน ${path.relative(process.cwd(), OUT_DIR)} · prefix ซีรีย์ = ${prefix}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
