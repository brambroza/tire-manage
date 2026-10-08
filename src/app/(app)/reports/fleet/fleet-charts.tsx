'use client'

import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { formatNumber } from '@/lib/utils'
import {
  HISTOGRAM_COLORS, INSPECTION_COLORS, TREAD_COLORS,
  type InspectionBucket, type TreadBand, type TreadHistogram, type TrendPoint,
} from './fleet-report'

/** สีกลางของหน้ารายงาน — โทนเดียวกับ dashboard */
const COLOR = {
  brand: '#0d6ee0',
  recorded: '#059669',
  notRecorded: '#cbd5e1',
  alertLine: '#dc2626',
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

/** ข้อความกลางกราฟเมื่อไม่มีข้อมูล */
function ChartEmpty({ text }: { text: string }) {
  return <p className="py-12 text-center text-base text-ink-500">{text}</p>
}

/**
 * โดนัทพร้อม legend ตัวเลข + % — ใช้ร่วมกันระหว่าง "ตรวจยางล่าสุด" และ "สภาพดอกยาง"
 * @param data ชิ้นข้อมูล (ต้องมี key/label/count/pct)
 * @param colors สีตาม key
 * @param unit หน่วยที่โชว์กลางโดนัทและ tooltip
 */
function DonutWithLegend<K extends string>({
  data,
  colors,
  unit,
  emptyText,
}: {
  data: Array<{ key: K; label: string; count: number; pct: number }>
  colors: Record<K, string>
  unit: string
  emptyText: string
}) {
  const total = data.reduce((s, d) => s + d.count, 0)
  if (total === 0) return <ChartEmpty text={emptyText} />
  const slices = data.filter((d) => d.count > 0)

  return (
    <div className="grid items-center gap-5 sm:grid-cols-[180px_1fr]">
      <div className="relative mx-auto size-45">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={slices}
              dataKey="count"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={2}
              stroke="none"
            >
              {slices.map((d) => (
                <Cell key={d.key} fill={colors[d.key]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, n) => [`${formatNumber(Number(v))} ${unit}`, String(n ?? '')]}
              contentStyle={TOOLTIP_STYLE}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <p className="text-3xl font-bold text-ink-900">{formatNumber(total)}</p>
          <p className="text-sm text-ink-500">{unit}</p>
        </div>
      </div>

      <ul className="grid gap-2.5">
        {data.map((d) => (
          <li key={d.key} className="grid grid-cols-[18px_1fr_auto] items-center gap-3 text-base">
            <span className="size-4.5 rounded-md" style={{ backgroundColor: colors[d.key] }} aria-hidden />
            <span className="text-ink-900">{d.label}</span>
            <span className="text-lg font-bold text-ink-900">
              {formatNumber(d.count)}
              <span className="ml-1 text-sm font-normal text-ink-500">({d.pct}%)</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * กราฟแท่งแนวนอน: จำนวนรถต่อประเภทรถ
 * @param data รายการประเภทรถพร้อมจำนวน (เรียงมาแล้ว)
 */
export function AxleTypeBarChart({ data }: { data: Array<{ code: string; name: string; count: number }> }) {
  if (data.length === 0) return <ChartEmpty text="ยังไม่มีรถตามตัวกรอง" />
  const height = Math.max(160, data.length * 44 + 24)

  return (
    <div className="w-full" style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
          <CartesianGrid stroke={COLOR.grid} horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 14, fill: COLOR.ink2 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={120}
            tick={{ fontSize: 14, fontWeight: 600, fill: COLOR.ink }}
            axisLine={{ stroke: COLOR.ink2 }}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: '#f3f6fa' }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v) => [`${formatNumber(Number(v))} คัน`, 'จำนวนรถ']}
          />
          <Bar dataKey="count" name="จำนวนรถ" fill={COLOR.brand} radius={[0, 4, 4, 0]} maxBarSize={28}>
            <LabelList dataKey="count" position="right" style={{ fontSize: 14, fontWeight: 700, fill: COLOR.ink }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * โดนัท "ตรวจยางล่าสุดเมื่อไร"
 * @param data ช่วงเวลาที่ตรวจล่าสุด (5 กลุ่ม)
 */
export function InspectionDonut({ data }: { data: InspectionBucket[] }) {
  return <DonutWithLegend data={data} colors={INSPECTION_COLORS} unit="คัน" emptyText="ยังไม่มีรถตามตัวกรอง" />
}

/**
 * โดนัทสภาพดอกยางบนรถ (>5 / 3–5 / 0–3 มม.)
 * @param data สัดส่วนแต่ละช่วง
 */
export function TreadDonut({ data }: { data: TreadBand[] }) {
  return <DonutWithLegend data={data} colors={TREAD_COLORS} unit="เส้น" emptyText="ยังไม่มียางบนรถที่วัดดอกแล้ว" />
}

/**
 * กราฟแท่งซ้อนรายเดือน: รถที่บันทึก vs ไม่ได้บันทึก พร้อม % ที่บันทึกบนยอดแท่ง
 * @param data 12 เดือนย้อนหลัง (จาก buildTrend)
 */
export function TrendChart({ data }: { data: TrendPoint[] }) {
  if (data.every((d) => d.recorded + d.notRecorded === 0)) return <ChartEmpty text="ยังไม่มีรถตามตัวกรอง" />

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 24, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={COLOR.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 13, fontWeight: 600, fill: COLOR.ink }}
            axisLine={{ stroke: COLOR.ink2 }}
            tickLine={false}
            interval={0}
          />
          <YAxis tick={{ fontSize: 14, fill: COLOR.ink2 }} axisLine={false} tickLine={false} allowDecimals={false} unit=" คัน" width={72} />
          <Tooltip
            cursor={{ fill: '#f3f6fa' }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, n) => [`${formatNumber(Number(v))} คัน`, String(n ?? '')]}
          />
          <Legend iconType="square" iconSize={14} wrapperStyle={{ fontSize: 15, fontWeight: 600, color: COLOR.ink2 }} />
          <Bar dataKey="recorded" name="บันทึกแล้ว" stackId="v" fill={COLOR.recorded} maxBarSize={36} />
          <Bar dataKey="notRecorded" name="ยังไม่บันทึก" stackId="v" fill={COLOR.notRecorded} radius={[4, 4, 0, 0]} maxBarSize={36}>
            <LabelList
              dataKey="pct"
              position="top"
              formatter={(value) => `${value}%`}
              style={{ fontSize: 13, fontWeight: 700, fill: COLOR.ink }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * Histogram ยางบนรถตามดอกยาง (มม. เต็ม) ซ้อนตามยี่ห้อ พร้อมเส้นประแดงที่เกณฑ์เตือนของบริษัท
 * @param data ช่อง 0..12+ และชุดข้อมูลยี่ห้อ
 * @param alertTreadMm เกณฑ์ดอกยางของบริษัท (มม.)
 */
export function TreadHistogramChart({ data, alertTreadMm }: { data: TreadHistogram; alertTreadMm: number }) {
  if (data.series.length === 0) return <ChartEmpty text="ยังไม่มียางบนรถที่วัดดอกแล้ว" />
  const alertLabel = alertTreadMm >= 12 ? '12+' : String(Math.max(0, Math.floor(alertTreadMm)))

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data.bins} margin={{ top: 20, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={COLOR.grid} vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 14, fontWeight: 600, fill: COLOR.ink }}
            axisLine={{ stroke: COLOR.ink2 }}
            tickLine={false}
            interval={0}
            label={{ value: 'ดอกยาง (มม.)', position: 'insideBottomRight', offset: -2, fontSize: 13, fill: COLOR.ink2 }}
          />
          <YAxis tick={{ fontSize: 14, fill: COLOR.ink2 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: '#f3f6fa' }}
            contentStyle={TOOLTIP_STYLE}
            formatter={(v, n) => [`${formatNumber(Number(v))} เส้น`, String(n ?? '')]}
            labelFormatter={(label) => `ดอกยาง ${label} มม.`}
          />
          <Legend iconType="square" iconSize={14} wrapperStyle={{ fontSize: 15, fontWeight: 600, color: COLOR.ink2 }} />
          {data.series.map((s, index) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="t"
              fill={HISTOGRAM_COLORS[s.key]}
              maxBarSize={40}
              radius={index === data.series.length - 1 ? [4, 4, 0, 0] : undefined}
            />
          ))}
          <ReferenceLine
            x={alertLabel}
            stroke={COLOR.alertLine}
            strokeWidth={2}
            strokeDasharray="6 4"
            label={{ value: `เกณฑ์เตือน ${alertTreadMm} มม.`, position: 'top', fontSize: 13, fontWeight: 700, fill: COLOR.alertLine }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
