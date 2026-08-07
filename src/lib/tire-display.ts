export interface TireSpecData {
  size?: string | null
  brandName?: string | null
  modelName?: string | null
}

function clean(value?: string | null): string {
  return value?.trim() ?? ''
}

/** ชื่อยี่ห้อและรุ่นสำหรับใช้เป็นข้อมูลรองใต้ขนาดยาง */
export function tireBrandModelLabel(
  brandName?: string | null,
  modelName?: string | null,
  fallback = 'ไม่ระบุยี่ห้อ / รุ่น',
): string {
  return [clean(brandName), clean(modelName)].filter(Boolean).join(' ') || fallback
}

/** ขนาดยางสำหรับใช้เป็นข้อมูลหลัก */
export function tireSizeLabel(size?: string | null, fallback = 'ไม่ระบุขนาด'): string {
  return clean(size) || fallback
}

/** ข้อความบรรทัดเดียวสำหรับ select และไฟล์ส่งออก โดยเรียงขนาดก่อนยี่ห้อ/รุ่น */
export function tireSpecLabel(
  { size, brandName, modelName }: TireSpecData,
  {
    sizeFallback = 'ไม่ระบุขนาด',
    brandModelFallback = 'ไม่ระบุยี่ห้อ / รุ่น',
    separator = ' · ',
  }: {
    sizeFallback?: string
    brandModelFallback?: string
    separator?: string
  } = {},
): string {
  return [
    tireSizeLabel(size, sizeFallback),
    tireBrandModelLabel(brandName, modelName, brandModelFallback),
  ].filter(Boolean).join(separator)
}
