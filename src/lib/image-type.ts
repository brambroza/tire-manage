/**
 * ตรวจ magic bytes ของไฟล์ว่าเป็น JPEG/PNG/WebP จริง ไม่เชื่อ MIME type ที่ browser ส่งมาอย่างเดียว
 * @param bytes ส่วนต้นของไฟล์อย่างน้อย 12 ไบต์
 * @returns ชนิดไฟล์ที่ตรวจพบ หรือ null ถ้าไม่ใช่รูปที่รองรับ
 */
export function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => bytes[i] === b)
  ) return 'image/png'
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  ) return 'image/webp'
  return null
}
