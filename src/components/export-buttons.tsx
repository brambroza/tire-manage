'use client'

import * as React from 'react'
import { Spinner } from '@/components/ui'
import { cn } from '@/lib/utils'

/** โลโก้ Excel (แผ่นงานสีเขียวพร้อมตัว X) วาดด้วย SVG เพื่อไม่ต้องโหลดรูปภายนอก */
export function ExcelLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path d="M17 3h9a2 2 0 0 1 2 2v22a2 2 0 0 1-2 2h-9V3Z" fill="#21A366" />
      <path d="M17 3h-6a2 2 0 0 0-2 2v22a2 2 0 0 0 2 2h6V3Z" fill="#107C41" />
      <path d="M17 9.5h11v4.5H17zM17 16.5h11V21H17z" fill="#33C481" opacity=".55" />
      <rect x="2" y="9" width="16" height="14" rx="1.8" fill="#185C37" />
      <path
        d="M6.2 12.5h2.3l1.6 2.9 1.7-2.9h2.2l-2.8 4.3 2.9 4.7h-2.3l-1.8-3.1-1.8 3.1H5.9l2.9-4.6-2.6-4.4Z"
        fill="#fff"
      />
    </svg>
  )
}

/** โลโก้ PDF (เอกสารสีแดงพร้อมป้าย PDF) วาดด้วย SVG */
export function PdfLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path d="M8 2h11l7 7v19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" fill="#F4F6F8" stroke="#D0D7DE" />
      <path d="M19 2v5a2 2 0 0 0 2 2h5l-7-7Z" fill="#D0D7DE" />
      <rect x="3" y="15" width="22" height="11" rx="2" fill="#E5252A" />
      <text
        x="14"
        y="23.4"
        textAnchor="middle"
        fontFamily="Arial, Helvetica, sans-serif"
        fontSize="8"
        fontWeight="700"
        fill="#fff"
      >
        PDF
      </text>
    </svg>
  )
}

/** ปุ่มไอคอนส่งออกไฟล์ — โชว์โลโก้แทนข้อความ, tooltip และ aria-label บอกชนิดไฟล์ */
function ExportIconButton({
  label,
  loading,
  disabled,
  onClick,
  children,
}: {
  label: string
  loading: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      aria-label={label}
      title={label}
      className={cn(
        'flex size-12 items-center justify-center rounded-xl border border-line bg-white transition-all',
        'hover:border-brand-200 hover:bg-brand-50 active:scale-[0.985]',
        'disabled:cursor-not-allowed disabled:opacity-50',
      )}
    >
      {loading ? <Spinner className="size-5 text-ink-500" /> : children}
    </button>
  )
}

/**
 * คู่ปุ่มส่งออก Excel / PDF แบบโลโก้ ใช้ร่วมกันทุกหน้าที่มีการส่งออกรายงาน
 * @param exporting รูปแบบที่กำลังสร้างอยู่ (null = ว่าง) ใช้โชว์ spinner บนปุ่มนั้นและล็อกอีกปุ่ม
 * @param disabled ปิดทั้งสองปุ่ม เช่น เมื่อไม่มีข้อมูล
 * @param onExport เรียกเมื่อกดปุ่ม พร้อมรูปแบบที่เลือก
 */
export function ExportButtons({
  exporting,
  disabled = false,
  onExport,
  className,
}: {
  exporting: 'excel' | 'pdf' | null
  disabled?: boolean
  onExport: (format: 'excel' | 'pdf') => void
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <ExportIconButton
        label="ส่งออก Excel"
        loading={exporting === 'excel'}
        disabled={disabled || exporting !== null}
        onClick={() => onExport('excel')}
      >
        <ExcelLogo className="size-7" />
      </ExportIconButton>
      <ExportIconButton
        label="ส่งออก PDF"
        loading={exporting === 'pdf'}
        disabled={disabled || exporting !== null}
        onClick={() => onExport('pdf')}
      >
        <PdfLogo className="size-7" />
      </ExportIconButton>
    </div>
  )
}
