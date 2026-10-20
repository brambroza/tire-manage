import { createAdminClient } from '@/lib/supabase/server'
import { fail, type ActionResult } from '@/lib/action-result'

/** bucket ใน Supabase Storage ที่เก็บรูปยาง (สร้างโดย migration 002) */
export const TIRE_IMAGE_BUCKET = 'tire-images'

/** ชนิดไฟล์รูปที่รับได้ และขนาดสูงสุด 3 MB */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif']
const MAX_IMAGE_BYTES = 3 * 1024 * 1024

/**
 * ตรวจไฟล์แล้วอัปโหลดรูปยางขึ้น Storage — ไม่ตรวจสิทธิ์เอง ผู้เรียกต้องตรวจ session มาก่อน
 * ใช้ service role เพื่อไม่ต้องเปิดสิทธิ์เขียน storage ให้ผู้ใช้ทั่วไป
 *
 * @param file ค่าจาก formData.get('file')
 * @param folder โฟลเดอร์ปลายทางใน bucket เช่น "models" (แคตตาล็อกกลาง) หรือ "models/<companyId>" (ของบริษัท)
 * @returns public URL ของรูปที่อัปโหลด
 */
export async function storeTireImage(
  file: FormDataEntryValue | null,
  folder: string,
): Promise<ActionResult<{ url: string }>> {
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'ไม่พบไฟล์รูปที่อัปโหลด' }
  }
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    return { ok: false, error: 'รองรับเฉพาะไฟล์ JPG, PNG, WebP หรือ AVIF' }
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'ไฟล์ใหญ่เกิน 3 MB กรุณาย่อรูปก่อนอัปโหลด' }
  }

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงอัปโหลดรูปไม่ได้' }
  }

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const path = `${folder.replace(/\/+$/, '')}/${crypto.randomUUID()}.${ext}`

  const { error } = await admin.storage
    .from(TIRE_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })

  if (error) {
    return {
      ok: false,
      error: error.message.includes('Bucket not found')
        ? 'ยังไม่ได้สร้าง bucket "tire-images" — กรุณารัน migration 002 ก่อน'
        : `อัปโหลดรูปไม่สำเร็จ: ${error.message}`,
    }
  }

  const { data } = admin.storage.from(TIRE_IMAGE_BUCKET).getPublicUrl(path)
  return { ok: true, data: { url: data.publicUrl } }
}

/**
 * ลบรูปยางออกจาก Storage จาก public URL — ไม่ตรวจสิทธิ์เอง
 * @param url public URL ของรูปที่ต้องการลบ
 * @param allowedPrefix ถ้าระบุ จะลบได้เฉพาะไฟล์ใต้โฟลเดอร์นี้ (กันบริษัทลบรูปของคนอื่น) เช่น "models/<companyId>/"
 */
export async function removeTireImage(url: string, allowedPrefix?: string): Promise<ActionResult> {
  const marker = `/${TIRE_IMAGE_BUCKET}/`
  const index = url.indexOf(marker)
  if (index === -1) return { ok: false, error: 'ลิงก์รูปไม่ถูกต้อง' }

  const path = url.slice(index + marker.length)
  if (allowedPrefix && !path.startsWith(allowedPrefix)) {
    return { ok: false, error: 'ลบได้เฉพาะรูปที่บริษัทของคุณอัปโหลดเอง' }
  }

  try {
    const admin = createAdminClient()
    const { error } = await admin.storage.from(TIRE_IMAGE_BUCKET).remove([path])
    if (error) return fail(error)
    return { ok: true }
  } catch {
    return { ok: false, error: 'ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จึงลบรูปไม่ได้' }
  }
}
