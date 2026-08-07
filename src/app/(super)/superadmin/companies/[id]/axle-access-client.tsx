'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check, Lock } from 'lucide-react'
import { Badge, Button, Card, CardBody, CardHeader } from '@/components/ui'
import { cn } from '@/lib/utils'
import { setCompanyAxleTypes } from '../../actions'
import type { AxleCategory, AxleKind } from '@/lib/database.types'

export interface AccessAxleType {
  id: string
  code: string
  name: string
  category: AxleCategory
  axle_kinds: AxleKind[]
  /** จำนวนรถของบริษัทนี้ที่ใช้ประเภทเพลาดังกล่าวอยู่ (ถอนสิทธิ์ไม่ได้ถ้ามากกว่า 0) */
  usage_count: number
}

const CATEGORY_LABEL: Record<AxleCategory, string> = {
  head: 'รถหัวลาก / รถบรรทุก',
  trailer: 'หางพ่วง',
}

const CATEGORY_ORDER: AxleCategory[] = ['head', 'trailer']

/**
 * สรุปผังล้อเป็นข้อความสั้น เช่น "3 เพลา · 10 ล้อ"
 * @param kinds รูปแบบแต่ละเพลาเรียงจากหน้าไปหลัง
 */
function describeLayout(kinds: AxleKind[]): string {
  const wheels = kinds.reduce((sum, kind) => sum + (kind === 'dual' ? 4 : 2), 0)
  return `${kinds.length} เพลา · ${wheels} ล้อ`
}

/**
 * กำหนดว่าบริษัทนี้เห็นประเภทเพลาแบบใดได้บ้าง (super admin กำหนดสิทธิ์รายบริษัท)
 */
export function AxleAccessClient({
  companyId,
  axleTypes,
  allowed,
}: {
  companyId: string
  axleTypes: AccessAxleType[]
  allowed: string[]
}) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<Set<string>>(new Set(allowed))
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const grouped = React.useMemo(
    () =>
      CATEGORY_ORDER.map(
        (category) =>
          [category, axleTypes.filter((type) => type.category === category)] as const,
      ).filter(([, list]) => list.length > 0),
    [axleTypes],
  )

  function toggle(type: AccessAxleType) {
    if (type.usage_count > 0) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(type.id)) next.delete(type.id)
      else next.add(type.id)
      return next
    })
    setSaved(false)
  }

  function toggleCategory(category: AxleCategory) {
    const list = axleTypes.filter((type) => type.category === category)
    const allSelected = list.every((type) => selected.has(type.id))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const type of list) {
        if (allSelected && type.usage_count > 0) continue
        if (allSelected) next.delete(type.id)
        else next.add(type.id)
      }
      return next
    })
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await setCompanyAxleTypes(companyId, [...selected])
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setSaved(true)
    router.refresh()
  }

  return (
    <Card>
      <CardHeader
        title="สิทธิ์การมองเห็นประเภทเพลา"
        description="เลือกประเภทเพลาที่บริษัทนี้จะเลือกใช้ได้ตอนเพิ่มรถและตอนบริการหน้างาน"
        action={
          <div className="flex items-center gap-3">
            {saved && (
              <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600">
                <Check className="size-4" />
                บันทึกแล้ว
              </span>
            )}
            <Button size="sm" onClick={handleSave} loading={saving}>
              บันทึกสิทธิ์ ({selected.size})
            </Button>
          </div>
        }
      />
      <CardBody className="space-y-6">
        {error && (
          <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200">
            {error}
          </div>
        )}

        {grouped.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-400">
            ยังไม่มีประเภทเพลาในระบบ — เพิ่มได้ที่เมนู “ประเภทเพลา”
          </p>
        ) : (
          grouped.map(([category, list]) => {
            const allSelected = list.every((type) => selected.has(type.id))
            return (
              <div key={category}>
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink-900">{CATEGORY_LABEL[category]}</p>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category)}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    {allSelected ? 'ยกเลิกทั้งหมวด' : 'เลือกทั้งหมวด'}
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((type) => {
                    const active = selected.has(type.id)
                    const locked = type.usage_count > 0
                    return (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => toggle(type)}
                        title={
                          locked
                            ? `มีรถของบริษัทนี้ใช้อยู่ ${type.usage_count} คัน จึงถอนสิทธิ์ไม่ได้`
                            : undefined
                        }
                        className={cn(
                          'flex items-center gap-3 rounded-xl border p-3 text-left transition-all',
                          locked ? 'cursor-not-allowed opacity-80' : 'active:scale-[0.99]',
                          active
                            ? 'border-brand-500 bg-brand-50'
                            : 'border-line bg-white hover:border-brand-300',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
                            active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300',
                          )}
                        >
                          {active && <Check className="size-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-ink-900">
                            {type.name}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-ink-400">
                            {type.code} · {describeLayout(type.axle_kinds)}
                          </span>
                        </span>
                        {locked && (
                          <Badge tone="amber" className="shrink-0 gap-1">
                            <Lock className="size-3" />
                            ใช้อยู่ {type.usage_count}
                          </Badge>
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })
        )}
      </CardBody>
    </Card>
  )
}
