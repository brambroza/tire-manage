import { createClient } from '@supabase/supabase-js'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).host
console.log('host', host.replace(/^([a-z0-9]{4})[a-z0-9]*/, '$1***'))
const c = await sb.from('companies').select('id, code, name, is_active').order('code')
console.log('companies', c.error?.message ?? c.data)
const p = await sb.from('companies').select('plan, plan_expires_at, branches').limit(1)
console.log('012 columns', p.error ? 'MISSING: ' + p.error.message : 'present')
const v = await sb.from('vehicles').select('branch').limit(1)
console.log('vehicles.branch', v.error ? 'MISSING: ' + v.error.message : 'present')
const t = await sb.from('companies').select('alert_lifetime_km, alert_change_count').limit(1)
console.log('009/011 columns', t.error ? 'MISSING: ' + t.error.message : 'present')
const u = await sb.from('profiles').select('role, full_name, company_id, is_active')
console.log('profiles', u.error?.message ?? u.data)
