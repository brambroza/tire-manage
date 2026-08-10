'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { Button, Card, CardBody, CardHeader } from '@/components/ui'
import { TireSpec } from '@/components/tire-spec'
import { cn } from '@/lib/utils'
import { setCompanyTireModels } from '../../actions'

export interface AccessModel {
  id: string
  brand: string
  model: string
  size: string | null
  pattern_code: string | null
}

/**
 * กำหนดว่าบริษัทนี้เห็นยางรุ่นใดได้บ้าง (ตามสเปค: super admin กำหนดสิทธิ์รายบริษัท)
 */
export function TireAccessClient({
  companyId,
  models,
  allowed,
}: {
  companyId: string
  models: AccessModel[]
  allowed: string[]
}) {
  const router = useRouter()
  const [selected, setSelected] = React.useState<Set<string>>(new Set(allowed))
  const [saving, setSaving] = React.useState(false)
  const [saved, setSaved] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const grouped = React.useMemo(() => {
    const map = new Map<string, AccessModel[]>()
    for (const m of models) {
      const list = map.get(m.brand) ?? []
      list.push(m)
      map.set(m.brand, list)
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
  }, [models])

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSaved(false)
  }

  function toggleBrand(brand: string) {
    const ids = models.filter((m) => m.brand === brand).map((m) => m.id)
    const allSelected = ids.every((id) => selected.has(id))
    setSelected((prev) => {
      const next = new Set(prev)
      ids.forEach((id) => (allSelected ? next.delete(id) : next.add(id)))
      return next
    })
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const result = await setCompanyTireModels(companyId, [...selected])
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
        title="สิทธิ์การมองเห็นยาง"
        description="เลือกรุ่นยางที่บริษัทนี้จะเห็นในระบบ "
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
            ยังไม่มีรุ่นยางในแคตตาล็อกกลาง — เพิ่มได้ที่เมนู “ข้อมูลยาง”
          </p>
        ) : (
          grouped.map(([brand, list]) => {
            const allSelected = list.every((m) => selected.has(m.id))
            return (
              <div key={brand}>
                <div className="mb-2.5 flex items-center justify-between">
                  <p className="text-sm font-semibold text-ink-900">{brand}</p>
                  <button
                    type="button"
                    onClick={() => toggleBrand(brand)}
                    className="text-sm text-brand-600 hover:underline"
                  >
                    {allSelected ? 'ยกเลิกทั้งยี่ห้อ' : 'เลือกทั้งยี่ห้อ'}
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {list.map((m) => {
                    const active = selected.has(m.id)
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggle(m.id)}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border p-3 text-left transition-all active:scale-[0.99]',
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
                          <TireSpec size={m.size} brandName={m.brand} modelName={m.model} />
                          {m.pattern_code ? (
                            <span className="mt-0.5 block truncate text-xs text-ink-400">
                              รหัสดอกยาง {m.pattern_code}
                            </span>
                          ) : null}
                        </span>
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
