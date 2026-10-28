import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from 'zod'
import { matchesVehicle, vehicleLabel } from '../src/lib/vehicle-display.ts'
import {
  VEHICLE_IDENTITY_MESSAGE, VEHICLE_PROVINCE_MESSAGE, VEHICLE_NICKNAME_TAKEN_MESSAGE, VEHICLE_PLATE_TAKEN_MESSAGE,
  normalizeVehicleIdentity, refineVehicleIdentity, vehicleIdentityFields, vehicleIdentityIssues,
  vehicleUniqueViolation,
} from '../src/lib/vehicle-schema.ts'
import { PLATE_PATTERN_MESSAGE } from '../src/lib/utils.ts'

/** Same shape the admin form and the technician wizard send. */
const newVehicle = z.object(vehicleIdentityFields)
  .superRefine(refineVehicleIdentity(true))
  .transform(normalizeVehicleIdentity)
const editVehicle = z.object(vehicleIdentityFields)
  .superRefine(refineVehicleIdentity(false))
  .transform(normalizeVehicleIdentity)

const fieldErrors = (result) =>
  Object.fromEntries(result.error.issues.map((issue) => [issue.path.join('.'), issue.message]))

test('rejects a vehicle with neither plate nor nickname, including blank strings', () => {
  for (const input of [
    { plate_no: '', nickname: '', province: 'กรุงเทพมหานคร' },
    { plate_no: '   ', nickname: '  ', province: 'กรุงเทพมหานคร' },
    { plate_no: null, nickname: undefined, province: null },
  ]) {
    const result = newVehicle.safeParse(input)
    assert.equal(result.success, false)
    assert.equal(fieldErrors(result).plate_no, VEHICLE_IDENTITY_MESSAGE)
  }
})

test('nickname-only vehicles drop the province so the form default never reaches the database', () => {
  const result = newVehicle.safeParse({ plate_no: '', nickname: ' 32-002-BFn ', province: 'กรุงเทพมหานคร' })
  assert.equal(result.success, true)
  assert.deepEqual(result.data, { plate_no: null, nickname: '32-002-BFn', province: null })
})

test('plate-only vehicles need a province and a standard plate format when new', () => {
  const ok = newVehicle.safeParse({ plate_no: '70-1234', nickname: '', province: 'ลพบุรี' })
  assert.deepEqual(ok.data, { plate_no: '70-1234', nickname: null, province: 'ลพบุรี' })

  const noProvince = newVehicle.safeParse({ plate_no: '70-1234', nickname: '', province: '' })
  assert.equal(fieldErrors(noProvince).province, VEHICLE_PROVINCE_MESSAGE)

  const badFormat = newVehicle.safeParse({ plate_no: 'ABC-99999', nickname: 'x', province: 'ลพบุรี' })
  assert.equal(fieldErrors(badFormat).plate_no, PLATE_PATTERN_MESSAGE)
})

test('editing keeps legacy plates that predate the format rule', () => {
  const result = editVehicle.safeParse({ plate_no: 'ABC-99999', nickname: null, province: 'ลพบุรี' })
  assert.equal(result.success, true)
  assert.deepEqual(vehicleIdentityIssues({ plate_no: 'ABC-99999', nickname: null, province: 'ลพบุรี' }, false), [])
})

test('plate-less vehicles still render and match by nickname', () => {
  const vehicle = { plate_no: null, nickname: 'รถส่งของสายเหนือ', province: null }
  assert.equal(vehicleLabel(vehicle), 'รถส่งของสายเหนือ')
  assert.equal(matchesVehicle(vehicle, 'สายเหนือ'), true)
  assert.equal(matchesVehicle(vehicle, '70-1234'), false)
})

test('maps unique violations to the field that caused them', () => {
  assert.equal(vehicleUniqueViolation(null), null)
  assert.equal(vehicleUniqueViolation({ code: '23503', message: 'fk' }), null)
  assert.deepEqual(
    vehicleUniqueViolation({ code: '23505', message: 'duplicate key value violates unique constraint "vehicles_nickname_only_unique"' }),
    { error: VEHICLE_NICKNAME_TAKEN_MESSAGE, fieldErrors: { nickname: VEHICLE_NICKNAME_TAKEN_MESSAGE } },
  )
  assert.deepEqual(
    vehicleUniqueViolation({ code: '23505', message: 'duplicate key value violates unique constraint "vehicles_company_id_plate_no_province_key"' }),
    { error: VEHICLE_PLATE_TAKEN_MESSAGE, fieldErrors: { plate_no: VEHICLE_PLATE_TAKEN_MESSAGE } },
  )
})
