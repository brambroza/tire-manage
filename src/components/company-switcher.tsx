'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Building2, Check } from 'lucide-react'
import { Select } from '@/components/ui'
import { selectWorkCompanyAction } from '@/app/(app)/service/company-actions'

export interface CompanyOption {
  id: string
  code: string
  name: string
}

/**
 * เลือกลูกค้าที่จะทำงานด้วย (เฉพาะช่างส่วนกลาง)
 * @param companies บริษัทที่เปิดใช้งานทั้งหมด
 * @param currentId บริษัทที่เลือกอยู่ (null = ยังไม่เลือก)
 * @param variant 'picker' = การ์ดเต็มหน้าก่อนเลือก, 'bar' = ตัวสลับเล็กบน top bar
 */
export function CompanySwitcher({
  companies,
  currentId,
  variant,
}: {
  companies: CompanyOption[]
  currentId: string | null
  variant: 'picker' | 'bar'
}) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [error, setError] = React.useState<string | null>(null)
  const [query, setQuery] = React.useState('')

  function choose(id: string) {
    if (!id || id === currentId) return
    setError(null)
    startTransition(async () => {
      const result = await selectWorkCompanyAction(id)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  if (variant === 'bar') {
    return (
      <div className="flex items-center gap-2">
        <Building2 className="size-5 shrink-0 text-brand-500" />
        <Select
          value={currentId ?? ''}
          disabled={pending}
          aria-label="เลือกลูกค้า"
          onChange={(e) => choose(e.target.value)}
          className="max-w-[14rem]"
        >
          {!currentId && <option value="">เลือกลูกค้า…</option>}
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </Select>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
    )
  }

  const q = query.trim().toLowerCase()
  const shown = q
    ? companies.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    : companies

  return (
    <div className="mx-auto max-w-xl rounded-2xl bg-white p-5 ring-1 ring-line">
      <h2 className="text-lg font-semibold text-ink-900">เลือกลูกค้าที่จะเข้าทำงาน</h2>
      <p className="mt-1 text-sm text-ink-500">เลือกบริษัทก่อน แล้วจึงบันทึกถอด-ใส่ยางของลูกค้ารายนั้น</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="ค้นหาชื่อหรือรหัสลูกค้า"
        className="mt-4 h-12 w-full rounded-xl border border-line px-4 text-base outline-none focus:border-brand-500"
      />
      {error && <p className="mt-3 text-sm text-rose-600">{error}</p>}
      <ul className="mt-3 max-h-[60vh] space-y-2 overflow-y-auto">
        {shown.length === 0 && <li className="py-6 text-center text-sm text-ink-400">ไม่พบลูกค้า</li>}
        {shown.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              disabled={pending}
              onClick={() => choose(c.id)}
              className="tap-target flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ring-1 ring-line hover:bg-brand-50 disabled:opacity-60"
            >
              <Building2 className="size-5 shrink-0 text-brand-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink-900">{c.name}</span>
                <span className="block text-xs text-ink-400">{c.code}</span>
              </span>
              {c.id === currentId && <Check className="size-5 text-brand-600" />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
