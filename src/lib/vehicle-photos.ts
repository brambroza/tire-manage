import { createAdminClient } from '@/lib/supabase/server'
import { fail, type ActionResult } from '@/lib/action-result'
import { detectImageType } from '@/lib/image-type'

/** bucket แบบ private ที่เก็บรูปรถ (สร้างโดย migration 019) */
export const VEHICLE_PHOTO_BUCKET = 'vehicle-images'

/** ชนิดไฟล์และขนาดสูงสุดที่รับ — ฝั่ง browser ย่อรูปเป็น JPEG ก่อนส่งอยู่แล้ว */
export const VEHICLE_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const VEHICLE_PHOTO_MAX_BYTES = 3 * 1024 * 1024

/** อายุของลิงก์ดูรูป (วินาที) — สั้นพอที่ลิงก์หลุดไปแล้วใช้ต่อไม่ได้นาน */
const SIGNED_URL_TTL_SECONDS = 60 * 60

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/**
 * อัปโหลดรูปรถขึ้น Storage — ไม่ตรวจสิทธิ์เอง ผู้เรียกต้องตรวจว่ามีสิทธิ์แก้รถคันนี้ก่อน
 * @param file ค่าจาก formData.get('file')
 * @param companyId บริษัทเจ้าของรถ (อ่านจากฐานข้อมูล ห้ามรับจาก browser)
 * @param vehicleId รหัสรถ
 * @returns object path ที่อัปโหลดแล้ว
 */
export async function storeVehiclePhoto(
  file: FormDataEntryValue | null,
  companyId: string,
  vehicleId: string,
): Promise<ActionResult<{ path: string }>> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'ไม่พบไฟล์รูปที่อัปโหลด' }
  }
  if (file.size > VEHICLE_PHOTO_MAX_BYTES) {
    return { ok: false, error: 'ไฟล์ใหญ่เกิน 3 MB กรุณาย่อรูปก่อนอัปโหลด' }
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = detectImageType(bytes)
  if (!type) return { ok: false, error: 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WebP' }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงอัปโหลดรูปไม่ได้' }
  }

  const path = `${companyId}/${vehicleId}/${crypto.randomUUID()}.${EXT_BY_TYPE[type]}`
  const { error } = await admin.storage
    .from(VEHICLE_PHOTO_BUCKET)
    .upload(path, bytes, { contentType: type, upsert: false })

  if (error) {
    return {
      ok: false,
      error: error.message.includes('Bucket not found')
        ? 'ยังไม่ได้สร้าง bucket "vehicle-images" — กรุณารัน migration 019 ก่อน'
        : `อัปโหลดรูปไม่สำเร็จ: ${error.message}`,
    }
  }
  return { ok: true, data: { path } }
}

/**
 * ลบไฟล์รูปรถออกจาก Storage — ลบเฉพาะไฟล์ใต้โฟลเดอร์ของรถคันนั้น
 * @param path object path ที่เก็บใน vehicles.image_path
 * @param companyId บริษัทเจ้าของรถ
 * @param vehicleId รหัสรถ
 */
export async function removeVehiclePhotoFile(
  path: string,
  companyId: string,
  vehicleId: string,
): Promise<ActionResult> {
  if (!path.startsWith(`${companyId}/${vehicleId}/`)) {
    return { ok: false, error: 'ลบได้เฉพาะรูปของรถคันนี้' }
  }
  try {
    const admin = createAdminClient()
    const { error } = await admin.storage.from(VEHICLE_PHOTO_BUCKET).remove([path])
    if (error) return fail(error)
    return { ok: true }
  } catch {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงลบรูปไม่ได้' }
  }
}

/**
 * สร้างลิงก์ดูรูปอายุสั้นให้รถหลายคันในครั้งเดียว — เรียกจาก server component หลังดึงรถผ่าน RLS แล้วเท่านั้น
 * ถ้ายังไม่ได้ตั้งค่า service role หรือ bucket ยังไม่มี จะคืน map ว่าง (หน้าแสดงไอคอนแทนรูป)
 * @param paths object path ของรูป (ค่า null จะถูกข้าม)
 * @returns map จาก path เป็น signed URL
 */
export async function signVehiclePhotoUrls(
  paths: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((p): p is string => Boolean(p)))]
  const urls = new Map<string, string>()
  if (unique.length === 0) return urls
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .createSignedUrls(unique, SIGNED_URL_TTL_SECONDS)
    if (error || !data) return urls
    for (const item of data) {
      if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl)
    }
  } catch {
    // ไม่มี service role key — แสดงหน้าโดยไม่มีรูป
  }
  return urls
}
