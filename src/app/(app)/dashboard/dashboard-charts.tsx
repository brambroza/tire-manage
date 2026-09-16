'use client'

import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatNumber } from '@/lib/utils'
import type { MonthPoint } from '@/components/charts'

/** สีที่ใช้เฉพาะหน้า dashboard — ผ่านการตรวจ colorblind-safe แล้ว */
const COLOR = {
  mount: '#0d57b4',   // น้ำเงิน = ใส่ยาง
  unmount: '#c2410c', // ส้ม = ถอดยาง
  mounted: '#15803d', // เขียว = ใช้งานอยู่
  inStock: '#0369a1', // ฟ้า = อยู่ในคลัง
  scrapped: '#be123c', // แดง = ตัดจำหน่าย
  ink: '#0f1c2e',
  ink2: '#33465e',
  grid: '#c9d6e6',
} as const

const TOOLTIP_STYLE = {
  borderRadius: 12,
  border: '1px solid #c9d6e6',
  boxShadow: '0 8px 24px -12px rgba(15,28,46,0.3)',
  fontSize: 15,
  color: COLOR.ink,
}

/** สัดส่วนสถานะยาง (ใช้งาน / คลัง / ตัดจำหน่าย) */
export interface StatusSlice {
  key: 'mounted' | 'inStock' | 'scrapped'
  name: string
  value: number
}

/**
 * กราฟแท่งการถอด-ใส่ยางรายเดือน — ตัวเลขบนแท่ง, แกนอ่านง่าย, สีแยกชัด
 * @param data จุดข้อมูลรายเดือน (6 เดือนล่าสุด)
 */
export function DashboardMonthlyChart({ data }: { data: MonthPoint[] }) {
  if (data.every((d) => d.mount === 0 && d.unmount === 0)) {
    return <p className="py-12 text-center text-base text-ink-500">ยังไม่มีประวัติการถอด-ใส่ยาง</p>
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 20, right: 8, left: -12, bottom: 0 }} barGap={6}>
          <CartesianGrid stroke={COLOR.grid} vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 15, fontWeight: 600, fill: COLOR.ink }}
            axisLine={{ stroke: COLOR.ink2 }}
            tickLine={false}
          />
          <YAxis tick={{ fontSize: 14, fill: COLOR.ink2 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip cursor={{ fill: '#f3f6fa' }} contentStyle={TOOLTIP_STYLE} />
          <Legend iconType="square" iconSize={14} wrapperStyle={{ fontSize: 15, fontWeight: 600, color: COLOR.ink2 }} />
          <Bar dataKey="mount" name="ใส่ยาง" fill={COLOR.mount} radius={[4, 4, 0, 0]} maxBarSize={34}>
            <LabelList dataKey="mount" position="top" style={{ fontSize: 14, fontWeight: 700, fill: COLOR.ink }} />
          </Bar>
          <Bar dataKey="unmount" name="ถอดยาง" fill={COLOR.unmount} radius={[4, 4, 0, 0]} maxBarSize={34}>
            <LabelList dataKey="unmount" position="top" style={{ fontSize: 14, fontWeight: 700, fill: COLOR.ink }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * โดนัทสถานะยาง — ใช้สีเดียวกับ Badge สถานะทั้งระบบ พร้อม legend ตัวเลข + %
 * @param data สัดส่วนแต่ละสถานะ
 */
export function DashboardStatusDonut({ data }: { data: StatusSlice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) {
    return <p className="py-12 text-center text-base text-ink-500">ยังไม่มีข้อมูลยาง</p>
  }

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[180px_1fr]">
      <div className="relative mx-auto size-45">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
            >
              {data.map((d) => (
                <Cell key={d.key} fill={COLOR[d.key]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, n) => [`${formatNumber(Number(v))} เส้น`, String(n ?? '')]}
              contentStyle={TOOLTIP_STYLE}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-3xl font-bold text-ink-900">{formatNumber(total)}</p>
          <p className="text-sm text-ink-500">เส้น</p>
        </div>
      </div>

      <ul className="grid gap-2.5">
        {data.map((d) => (
          <li key={d.key} className="grid grid-cols-[18px_1fr_auto] items-center gap-3 text-base">
            <span className="size-4.5 rounded-md" style={{ backgroundColor: COLOR[d.key] }} aria-hidden />
            <span className="text-ink-900">{d.name}</span>
            <span className="text-lg font-bold text-ink-900">
              {formatNumber(d.value)}
              <span className="ml-1 text-sm font-normal text-ink-500">
                ({Math.round((d.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
