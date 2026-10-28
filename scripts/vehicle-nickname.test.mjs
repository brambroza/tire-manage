import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchesVehicle, vehicleLabel, vehicleSearchFilter } from '../src/lib/vehicle-display.ts'
import { vehicleNicknameSchema } from '../src/lib/vehicle-schema.ts'

const bfn = { id: 'one', nickname: '32-002-BFn', plate_no: '16-5728' }
const sg = { id: 'two', nickname: '588-233-SG+', plate_no: '10-6676' }

test('finds partial nicknames regardless of letter case, including + and Thai', () => {
  assert.equal(matchesVehicle(bfn, ' bfn '), true)
  assert.equal(matchesVehicle(sg, 'SG+'), true)
  assert.equal(matchesVehicle({ nickname: 'รถส่งของสายเหนือ', plate_no: 'กข-12' }, 'สายเหนือ'), true)
  assert.equal(matchesVehicle(bfn, 'SG+'), false)
})

test('keeps registration lookup working for unnamed and legacy vehicles', () => {
  assert.equal(matchesVehicle({ nickname: null, plate_no: '16-5728' }, '165728'), true)
  assert.equal(matchesVehicle({ plate_no: '16 5728' }, '16-5728'), true)
  assert.equal(matchesVehicle(bfn, '5728'), true)
  assert.equal(matchesVehicle({ plate_no: null }, '5728'), false)
})

test('returns every duplicate nickname so the user can select the correct ID', () => {
  const duplicate = { ...bfn, id: 'three', plate_no: '10-6674' }
  assert.deepEqual([bfn, sg, duplicate].filter((v) => matchesVehicle(v, 'bfn')).map((v) => v.id), ['one', 'three'])
  assert.equal(vehicleLabel(bfn), '32-002-BFn · 16-5728')
  assert.equal(vehicleLabel(duplicate), '32-002-BFn · 10-6674')
})

test('unnamed or deleted vehicles have a readable fallback', () => {
  assert.equal(vehicleLabel({ plate_no: '16-5728', nickname: null }), '16-5728')
  assert.equal(vehicleLabel(null), '-')
  assert.equal(vehicleLabel(undefined, 'รถที่ถูกลบแล้ว'), 'รถที่ถูกลบแล้ว')
})

test('normalizes optional names and rejects names over the database limit', () => {
  assert.equal(vehicleNicknameSchema.parse(' 32-002-BFn '), '32-002-BFn')
  for (const value of ['', '   ', null, undefined]) assert.equal(vehicleNicknameSchema.parse(value), null)
  assert.equal(vehicleNicknameSchema.safeParse('ก'.repeat(100)).success, true)
  assert.equal(vehicleNicknameSchema.safeParse('ก'.repeat(101)).success, false)
  assert.equal(vehicleNicknameSchema.safeParse(123).success, false)
})

test('quotes punctuation in server search without adding PostgREST filter clauses', () => {
  const query = 'รถ (A), "พิเศษ" \\ B%_'
  const expected = JSON.stringify('%รถ (A), "พิเศษ" \\\\ B\\%\\_%')
  assert.equal(vehicleSearchFilter(query), ['plate_no', 'nickname', 'brand', 'model', 'province']
    .map((column) => `${column}.ilike.${expected}`).join(','))
  assert.match(vehicleSearchFilter('SG+'), /nickname\.ilike\."%SG\+%"/)
})
