// ทดสอบการตรวจชนิดไฟล์รูปรถจาก magic bytes: node --test scripts/vehicle-photo.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { detectImageType } from '../src/lib/image-type.ts'

const bytes = (...values) => new Uint8Array(values)
const ascii = (text) => [...text].map((c) => c.charCodeAt(0))

test('รู้จัก JPEG, PNG, WebP', () => {
  assert.equal(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg')
  assert.equal(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)), 'image/png')
  assert.equal(detectImageType(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'))), 'image/webp')
})

test('ปฏิเสธไฟล์ที่ไม่ใช่รูปแม้ตั้งชื่อเป็น .jpg', () => {
  assert.equal(detectImageType(bytes(...ascii('<svg xmlns='))), null)
  assert.equal(detectImageType(bytes(...ascii('%PDF-1.7'))), null)
  assert.equal(detectImageType(bytes(...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WAVE'))), null)
  assert.equal(detectImageType(bytes()), null)
})
