import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GO1 = 'b7b0a1cf-8533-4ea0-849a-7de2b18cdbff'
const t = await sb.from('tires').select('serial_no, status, brand_name, model_name, size, position_code, note, tread_mm, vehicles(plate_no)').eq('company_id', GO1).like('serial_no', 'UAT-%').order('serial_no')
console.log(JSON.stringify(t.data, null, 1))
const e = await sb.from('tire_events').select('event_type, event_date, odometer, note, tires(serial_no), vehicles(plate_no)').eq('company_id', GO1).order('created_at', { ascending: false }).limit(4)
console.log(JSON.stringify(e.data, null, 1))
const v = await sb.from('vehicles').select('plate_no, branch, current_mileage').eq('company_id', GO1).eq('plate_no', '52-7638')
console.log(v.data)
