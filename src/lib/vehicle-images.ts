/**
 * รูปผังล้อสำเร็จรูปที่อยู่ใน public/assets/images
 * ใช้ให้ super admin เลือกผูกกับประเภทเพลา แล้วช่างเห็นรูปนี้ตอนเลือกตำแหน่งล้อ
 */
export interface VehicleImageOption {
  /** path ที่ใช้ใน <img src> */
  url: string
  /** ชื่อที่แสดงในหน้าตั้งค่า */
  label: string
}

export const VEHICLE_IMAGES: VehicleImageOption[] = [
  { url: '/assets/images/6w.jpg', label: 'รถ 6 ล้อ' },
  { url: '/assets/images/10w.jpg', label: 'รถ 10 ล้อ' },
  { url: '/assets/images/18w.jpg', label: 'รถพ่วง 18 ล้อ' },
  { url: '/assets/images/22w.jpg', label: 'รถพ่วง 22 ล้อ' },
  { url: '/assets/images/24w.jpg', label: 'รถพ่วง 24 ล้อ' },
]

/**
 * ชื่อรูปแบบอ่านง่ายจาก url ที่บันทึกไว้
 * @param url path ของรูป (null = ยังไม่ได้ตั้งค่า)
 */
export function vehicleImageLabel(url: string | null): string {
  if (!url) return 'ยังไม่ได้ตั้งรูป'
  return VEHICLE_IMAGES.find((image) => image.url === url)?.label ?? url
}
