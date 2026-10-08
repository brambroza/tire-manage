import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GO1 = 'b7b0a1cf-8533-4ea0-849a-7de2b18cdbff'
const m = await sb.from('company_tire_models').select('tire_models(name, size, is_active, created_by_company, tire_brands(name, is_active))').eq('company_id', GO1)
for (const r of m.data) console.log(r.tire_models.tire_brands.name, r.tire_models.tire_brands.is_active, '|', r.tire_models.name, r.tire_models.size, r.tire_models.is_active)
