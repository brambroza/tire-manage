// ทดสอบผังล้อประเภทรถบัส: node --test scripts/axle-layouts.test.mjs (Node 22.6+ แปลง .ts ให้เอง)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getLayout, DEFAULT_AXLE_TYPES } from '../src/lib/axle-layouts.ts'

const codes = (code) => getLayout(code).positions.map((p) => p.code)

test('BUS_6W = 2 เพลา 6 ล้อ หน้าเดี่ยว หลังคู่', () => {
  assert.deepEqual(codes('BUS_6W'), ['A1L', 'A1R', 'A2LO', 'A2LI', 'A2RI', 'A2RO'])
})

test('BUS_8W = 3 เพลา 8 ล้อ หน้าเดี่ยว กลางคู่ หลังเดี่ยว', () => {
  assert.deepEqual(codes('BUS_8W'), ['A1L', 'A1R', 'A2LO', 'A2LI', 'A2RI', 'A2RO', 'A3L', 'A3R'])
})

test('BUS_10W = 3 เพลา 10 ล้อ หน้าเดี่ยว กลางคู่ หลังคู่', () => {
  assert.equal(getLayout('BUS_10W').wheelCount, 10)
  assert.deepEqual(codes('BUS_10W'), codes('10W'))
})

test('fallback ไม่มี code ซ้ำ และรหัสไม่พบยัง fallback เป็น 10W', () => {
  const all = DEFAULT_AXLE_TYPES.map((t) => t.code)
  assert.equal(new Set(all).size, all.length)
  assert.equal(getLayout('UNKNOWN').code, '10W')
})
