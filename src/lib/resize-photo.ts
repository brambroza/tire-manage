/** ด้านยาวสุดของรูปหลังย่อ (px) — พอสำหรับดูรถและป้ายทะเบียน ไฟล์ไม่เกินราว 500 KB */
export const PHOTO_MAX_EDGE = 1600
const PHOTO_QUALITY = 0.85

/**
 * ย่อรูปจากกล้อง/คลังภาพใน browser แล้วแปลงเป็น JPEG ก่อนอัปโหลด
 * ลดขนาดไฟล์จากมือถือ (มัก 3-10 MB) ให้ผ่านเพดาน 3 MB ของ server และหมุนรูปตาม EXIF ให้ถูกทิศ
 * @param file ไฟล์รูปที่ผู้ใช้เลือก
 * @returns ไฟล์ JPEG ที่ย่อแล้ว
 * @throws Error เมื่อ browser อ่านไฟล์รูปนี้ไม่ได้ (เช่น HEIC บางเครื่อง)
 */
export async function resizePhoto(file: File): Promise<File> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error('อ่านไฟล์รูปนี้ไม่ได้ กรุณาเลือกรูป JPG หรือ PNG')
  }
  const scale = Math.min(1, PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('เบราว์เซอร์นี้ย่อรูปไม่ได้')
  }
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', PHOTO_QUALITY),
  )
  if (!blob) throw new Error('แปลงรูปไม่สำเร็จ กรุณาลองใหม่')
  const baseName = file.name.replace(/\.[^.]+$/, '') || 'vehicle'
  return new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
}
