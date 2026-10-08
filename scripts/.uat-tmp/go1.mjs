import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GO1 = 'b7b0a1cf-8533-4ea0-849a-7de2b18cdbff'
const co = await sb.from('companies').select('plan, plan_expires_at, branches, alert_tread_mm').eq('id', GO1).single()
console.log('company', co.data)
const v = await sb.from('vehicles').select('plate_no, province, axle_type, current_mileage, branch, is_active').eq('company_id', GO1)
console.log('vehicles', v.data)
const t = await sb.from('tires').select('serial_no, status, brand_name, model_name, size, vehicle_id, position_code').eq('company_id', GO1).order('serial_no')
console.log('tires', t.data?.length, t.data?.slice(0, 15))
const m = await sb.from('company_tire_models').select('tire_models(name, size, is_active, tire_brands(name))').eq('company_id', GO1)
console.log('allowed models', m.data?.map(r => `${r.tire_models?.tire_brands?.name} | ${r.tire_models?.name} | ${r.tire_models?.size}`))
const ax = await sb.from('company_axle_types').select('axle_types(code, name, axle_kinds)').eq('company_id', GO1)
console.log('axle types', ax.data?.map(r => r.axle_types))
