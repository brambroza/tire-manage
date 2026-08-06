import Image from 'next/image'
import { CircleDot } from 'lucide-react'
import { cn } from '@/lib/utils'

const SIZE = {
  sm: { box: 'size-10', px: 40, icon: 'size-4.5' },
  md: { box: 'size-14', px: 56, icon: 'size-6' },
  lg: { box: 'size-20', px: 80, icon: 'size-8' },
  xl: { box: 'size-32', px: 128, icon: 'size-10' },
} as const

/**
 * รูปยางแบบย่อ — ถ้าไม่มีรูปจะแสดงไอคอนแทนเพื่อให้ layout ไม่กระโดด
 *
 * @param src public URL ของรูป (จาก tire_models.image_url)
 * @param alt ข้อความอธิบายรูป เช่น ยี่ห้อ+รุ่น
 * @param size ขนาดกล่องรูป
 */
export function TireThumb({
  src,
  alt,
  size = 'sm',
  className,
}: {
  src?: string | null
  alt?: string
  size?: keyof typeof SIZE
  className?: string
}) {
  const spec = SIZE[size]

  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-brand-50/60',
        spec.box,
        className,
      )}
    >
      {src ? (
        <Image
          src={src}
          alt={alt || 'รูปยาง'}
          width={spec.px}
          height={spec.px}
          className="size-full object-cover"
          unoptimized
        />
      ) : (
        <CircleDot className={cn('text-brand-300', spec.icon)} aria-hidden />
      )}
    </span>
  )
}
