import { cn } from '@/lib/utils'
import { tireBrandModelLabel, tireSizeLabel } from '@/lib/tire-display'

/** แสดงสเปกยางด้วยลำดับคงที่: ขนาดเป็นข้อมูลหลัก ยี่ห้อ/รุ่นเป็นข้อมูลรอง */
export function TireSpec({
  size,
  brandName,
  modelName,
  className,
  sizeClassName,
  detailClassName,
}: {
  size?: string | null
  brandName?: string | null
  modelName?: string | null
  className?: string
  sizeClassName?: string
  detailClassName?: string
}) {
  return (
    <span className={cn('block min-w-0', className)}>
      <span className={cn('block truncate text-[15px] font-semibold text-ink-900', sizeClassName)}>
        {tireSizeLabel(size) } - {tireSizeLabel(modelName)}
      </span>
      <span className={cn('mt-0.5 block truncate text-xs font-normal text-ink-400', detailClassName)}>
        {tireBrandModelLabel(brandName, '')}
      </span>
    </span>
  )
}
