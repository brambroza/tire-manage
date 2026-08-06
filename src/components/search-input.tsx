'use client'

import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ช่องค้นหาที่ผูกกับ query string (?q=) แบบ debounce
 * @param placeholder ข้อความ placeholder
 * @param paramName ชื่อ query param (default: q)
 */
export function SearchInput({
  placeholder = 'ค้นหา...',
  paramName = 'q',
  className,
}: {
  placeholder?: string
  paramName?: string
  className?: string
}) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [value, setValue] = React.useState(params.get(paramName) ?? '')
  const [pending, startTransition] = React.useTransition()

  React.useEffect(() => {
    const timer = setTimeout(() => {
      const next = new URLSearchParams(params.toString())
      if (value.trim()) next.set(paramName, value.trim())
      else next.delete(paramName)
      const qs = next.toString()
      if (qs === params.toString()) return
      startTransition(() => router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false }))
    }, 300)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-ink-400" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        inputMode="search"
        className={cn(
          'h-12 w-full rounded-xl border border-line bg-white pl-11 pr-10 text-base',
          'placeholder:text-ink-400 hover:border-brand-200 focus:border-brand-400',
          'focus:outline-none focus:ring-4 focus:ring-brand-100',
          pending && 'opacity-70',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => setValue('')}
          aria-label="ล้างคำค้นหา"
          className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 hover:bg-brand-50"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  )
}
