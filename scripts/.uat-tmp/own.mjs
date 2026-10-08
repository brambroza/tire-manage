import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GO1 = 'b7b0a1cf-8533-4ea0-849a-7de2b18cdbff'
const b = await sb.from('tire_brands').select('name, created_by_company').in('name', ['GOODYEAR', 'HANKOOK'])
console.log('brands', b.data)
const m = await sb.from('tire_models').select('name, size, created_by_company, tire_brands(name)').in('name', ['KMAX S', 'AH35'])
console.log('models', m.data)
const other = await sb.from('company_tire_models').select('company_id').in('tire_model_id', (await sb.from('tire_models').select('id').in('name', ['KMAX S','AH35'])).data.map(r=>r.id))
console.log('grants to other companies (should be empty):', other.data)
