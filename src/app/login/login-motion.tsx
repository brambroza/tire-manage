'use client'

import * as React from 'react'
import gsap from 'gsap'

/**
 * ครอบเนื้อหาหน้า login แล้วเล่น intro animation ด้วย GSAP
 * - element ที่มี `data-anim` จะ fade + เลื่อนขึ้นแบบ stagger ตามลำดับใน DOM
 * - element ที่มี `data-float` จะลอยวน ๆ เบา ๆ (gradient orb)
 * - เคารพ prefers-reduced-motion ผ่าน gsap.matchMedia
 */
export function LoginScene({ children }: { children: React.ReactNode }) {
  const root = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const mm = gsap.matchMedia()

    mm.add(
      {
        motion: '(prefers-reduced-motion: no-preference)',
        reduced: '(prefers-reduced-motion: reduce)',
      },
      (ctx) => {
        const { reduced } = ctx.conditions as { motion: boolean; reduced: boolean }
        if (reduced) return

        const items = root.current?.querySelectorAll('[data-anim]')
        if (!items?.length) return

        gsap.fromTo(
          items,
          { opacity: 0, y: 14 },
          { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out', stagger: 0.07 },
        )

        gsap.to('[data-float]', {
          xPercent: 'random(-8, 8)',
          yPercent: 'random(-8, 8)',
          duration: 9,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
          repeatRefresh: true,
        })
      },
      root,
    )

    return () => mm.revert()
  }, [])

  return (
    <div ref={root} className="min-h-dvh">
      {children}
    </div>
  )
}

/** โลโก้ยางหมุนช้า ๆ เป็น background mark ของ brand panel */
export function TireMark({ className }: { className?: string }) {
  const ref = React.useRef<SVGSVGElement>(null)

  React.useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const tween = gsap.to(ref.current, {
      rotate: 360,
      duration: 60,
      ease: 'none',
      repeat: -1,
      transformOrigin: '50% 50%',
    })
    return () => {
      tween.kill()
    }
  }, [])

  return (
    <svg ref={ref} viewBox="0 0 200 200" className={className} fill="none" aria-hidden>
      <circle cx="100" cy="100" r="92" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="60" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="34" stroke="currentColor" strokeWidth="1.5" />
      {Array.from({ length: 24 }, (_, i) => (
        <line
          key={i}
          x1="100"
          y1="8"
          x2="100"
          y2="40"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          transform={`rotate(${i * 15} 100 100)`}
        />
      ))}
    </svg>
  )
}
