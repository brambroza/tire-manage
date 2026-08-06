'use client'

import * as React from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Modal แบบ centered sheet — บน iPad จะเป็นการ์ดกลางจอ, บนจอเล็กเลื่อนขึ้นจากล่าง
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  description?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'md' | 'lg' | 'xl'
}) {
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  const width = { md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' }[size]

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-ink-900/25 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'animate-fade-up relative flex w-full flex-col overflow-hidden bg-surface',
          // จอแคบ (iPad แนวตั้ง/มือถือ): แผ่นเลื่อนขึ้นจากด้านล่างเกือบเต็มจอ กดง่ายด้วยนิ้วโป้ง
          'max-h-[92dvh] rounded-t-3xl shadow-[var(--shadow-lift)] sm:max-h-[88dvh] sm:rounded-2xl',
          width,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            className="tap-target -mr-1 flex size-11 items-center justify-center rounded-xl text-ink-400 transition-colors hover:bg-brand-50 hover:text-ink-700"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer && (
          <div className="safe-bottom flex items-center justify-end gap-3 border-t border-line bg-surface-alt px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/** กล่องยืนยันการลบ / การกระทำที่ย้อนกลับไม่ได้ */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  loading,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: React.ReactNode
  confirmLabel?: string
  loading?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="h-12 rounded-xl border border-line bg-white px-5 text-[15px] font-medium text-ink-700 hover:bg-brand-50"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className="h-12 rounded-xl bg-rose-600 px-5 text-[15px] font-medium text-white hover:bg-rose-700 disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-[15px] leading-relaxed text-ink-700">{message}</p>
    </Modal>
  )
}
