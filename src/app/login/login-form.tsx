'use client'

import * as React from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AlertCircle, ArrowRight, Eye, EyeOff } from 'lucide-react'
import gsap from 'gsap'
import { createClient } from '@/lib/supabase/client'
import { Button, Field, Input } from '@/components/ui'

/** ฟอร์ม login ด้วยอีเมล/รหัสผ่านของ Supabase Auth */
export function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const formRef = React.useRef<HTMLFormElement>(null)
  const errorRef = React.useRef<HTMLDivElement>(null)
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  /** intro: field ค่อย ๆ ไล่ขึ้นมาทีละอัน */
  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const rows = formRef.current?.querySelectorAll('[data-row]')
    if (!rows?.length) return
    const tween = gsap.fromTo(
      rows,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.55, ease: 'power3.out', stagger: 0.08, delay: 0.2 },
    )
    return () => {
      tween.revert()
    }
  }, [])

  /** error: เด้งเข้ามาแล้วสั่นเบา ๆ ให้สังเกตเห็น */
  React.useEffect(() => {
    if (!error || !errorRef.current) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const tl = gsap.timeline()
    tl.fromTo(
      errorRef.current,
      { opacity: 0, y: -6 },
      { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out' },
    ).fromTo(
      errorRef.current,
      { x: -6 },
      { x: 0, duration: 0.5, ease: 'elastic.out(1, 0.35)' },
      '-=0.1',
    )
    return () => {
      tl.revert()
    }
  }, [error])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (signInError) {
      setError(
        signInError.message.includes('Invalid login')
          ? 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
          : signInError.message,
      )
      setLoading(false)
      return
    }

    router.replace(params.get('next') || '/')
    router.refresh()
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-9 space-y-5">
      {error && (
        <div
          ref={errorRef}
          role="alert"
          className="flex items-start gap-2.5 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-inset ring-rose-200"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div data-row>
        <Field label="อีเมล" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.co.th"
            autoComplete="email"
            inputMode="email"
            required
          />
        </Field>
      </div>

      <div data-row>
        <Field label="รหัสผ่าน" required>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              className="pr-12"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
              className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-ink-400 transition-colors hover:bg-brand-50 hover:text-ink-700"
            >
              {showPassword ? <EyeOff className="size-4.5" /> : <Eye className="size-4.5" />}
            </button>
          </div>
        </Field>
      </div>

      <div data-row className="pt-1">
        <Button type="submit" size="lg" loading={loading} className="group w-full">
          เข้าสู่ระบบ
          {!loading && (
            <ArrowRight className="size-4.5 transition-transform group-hover:translate-x-0.5" />
          )}
        </Button>
      </div>

      <p data-row className="pt-1 text-center text-xs text-ink-400">
        ลืมรหัสผ่าน? ติดต่อผู้ดูแลระบบของบริษัท
      </p>
    </form>
  )
}
