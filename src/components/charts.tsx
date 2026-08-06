'use client'

import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend,
} from 'recharts'
import { formatNumber } from '@/lib/utils'

const PALETTE = ['#1f8cf5', '#4aabff', '#85c9ff', '#b9dfff', '#0d57b4']

export interface Slice {
  name: string
  value: number
}

/** โดนัทสรุปสัดส่วนสถานะยาง */
export function StatusDonut({ data, centerLabel }: { data: Slice[]; centerLabel?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0)

  if (total === 0) {
    return <p className="py-12 text-center text-sm text-ink-400">ยังไม่มีข้อมูลยาง</p>
  }

  return (
    <div className="relative h-64 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="58%"
            outerRadius="86%"
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Pie>
          <Tooltip
            formatter={(v, n) => [`${formatNumber(Number(v))} เส้น`, String(n ?? '')]}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e3edf9',
              boxShadow: '0 8px 24px -12px rgba(15,28,46,0.3)',
              fontSize: 13,
            }}
          />
          <Legend
            verticalAlign="middle"
            align="right"
            layout="vertical"
            iconType="circle"
            iconSize={8}
            formatter={(value, entry) => (
              <span style={{ color: '#2c405b', fontSize: 13 }}>
                {value} <span style={{ color: '#8397ad' }}>
                  {formatNumber((entry?.payload as unknown as Slice)?.value ?? 0)}
                </span>
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute left-[30%] top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
        <p className="text-2xl font-semibold text-ink-900">{formatNumber(total)}</p>
        <p className="text-xs text-ink-400">{centerLabel ?? 'เส้น'}</p>
      </div>
    </div>
  )
}

export interface MonthPoint {
  month: string
  mount: number
  unmount: number
}

/** กราฟแท่งจำนวนครั้งถอด-ใส่ยางรายเดือน */
export function MonthlyEventsChart({ data }: { data: MonthPoint[] }) {
  if (data.every((d) => d.mount === 0 && d.unmount === 0)) {
    return <p className="py-12 text-center text-sm text-ink-400">ยังไม่มีประวัติการถอด-ใส่ยาง</p>
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={4}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e3edf9" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#8397ad' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 12, fill: '#8397ad' }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: '#f0f8ff' }}
            contentStyle={{
              borderRadius: 12,
              border: '1px solid #e3edf9',
              boxShadow: '0 8px 24px -12px rgba(15,28,46,0.3)',
              fontSize: 13,
            }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 13, color: '#2c405b' }} />
          <Bar dataKey="mount" name="ใส่ยาง" fill="#1f8cf5" radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Bar dataKey="unmount" name="ถอดยาง" fill="#b9dfff" radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
