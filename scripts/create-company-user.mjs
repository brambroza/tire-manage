/**
 * สร้างบัญชีผู้ใช้ (แอดมินบริษัท / ช่าง) ให้ลูกค้า
 *
 * ใช้ service role key จึงต้องรันฝั่ง server เท่านั้น
 * ห้ามใส่รหัสผ่านลงไฟล์นี้ — ส่งผ่าน argument ตอนรัน
 *
 * วิธีใช้:
 *   node --env-file=.env scripts/create-company-user.mjs <รหัสบริษัท> <admin|technician> <email> <password> [ชื่อ-นามสกุล]
 *
 * ตัวอย่าง:
 *   node --env-file=.env scripts/create-company-user.mjs GO1 admin somchai@goalong.co.th 'PassWord123!' 'สมชาย ใจดี'
 *
 * ดูรายชื่อบริษัททั้งหมด:
 *   node --env-file=.env scripts/create-company-user.mjs --list
 */
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน environment')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const args = process.argv.slice(2)

if (args[0] === '--list') {
  const { data, error } = await admin
    .from('companies')
    .select('code, name, is_active')
    .order('code')
  if (error) {
    console.error('อ่านรายชื่อบริษัทไม่สำเร็จ:', error.message)
    process.exit(1)
  }
  console.table(data)
  process.exit(0)
}

const [companyCode, role, email, password, fullName] = args

if (!companyCode || !role || !email || !password) {
  console.error(
    'ใช้งาน: node --env-file=.env scripts/create-company-user.mjs <รหัสบริษัท> <admin|technician> <email> <password> [ชื่อ]',
  )
  process.exit(1)
}

if (role !== 'admin' && role !== 'technician') {
  console.error('role ต้องเป็น admin หรือ technician เท่านั้น')
  process.exit(1)
}

if (password.length < 8) {
  console.error('รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร')
  process.exit(1)
}

// หาบริษัทจากรหัส
const { data: company, error: companyError } = await admin
  .from('companies')
  .select('id, name')
  .ilike('code', companyCode)
  .maybeSingle()

if (companyError) {
  console.error('ค้นหาบริษัทไม่สำเร็จ:', companyError.message)
  process.exit(1)
}

if (!company) {
  console.error(`ไม่พบบริษัทรหัส "${companyCode}" — ดูรายชื่อได้ด้วย --list`)
  process.exit(1)
}

/**
 * ค้นหา auth user จากอีเมล
 * @param {string} target อีเมลที่ต้องการค้นหา
 */
async function findUserByEmail(target) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === target.toLowerCase())
    if (found) return found
    if (data.users.length < 200) return null
  }
  return null
}

const existing = await findUserByEmail(email)
let userId

if (existing) {
  console.log(`พบผู้ใช้เดิม (${email}) — กำลังอัปเดตรหัสผ่านและสิทธิ์`)
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password,
    email_confirm: true,
  })
  if (error) {
    console.error('อัปเดตรหัสผ่านไม่สำเร็จ:', error.message)
    process.exit(1)
  }
  userId = existing.id
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (error) {
    console.error('สร้างผู้ใช้ไม่สำเร็จ:', error.message)
    process.exit(1)
  }
  userId = data.user.id
}

const { error: profileError } = await admin.from('profiles').upsert(
  {
    id: userId,
    company_id: company.id,
    role,
    full_name: fullName || email.split('@')[0],
    is_active: true,
  },
  { onConflict: 'id' },
)

if (profileError) {
  console.error('บันทึก profile ไม่สำเร็จ:', profileError.message)
  process.exit(1)
}

const roleLabel = role === 'admin' ? 'แอดมินบริษัท' : 'ช่าง'
console.log(`✓ สร้าง ${roleLabel} ให้ ${company.name} เรียบร้อย`)
console.log(`  อีเมล: ${email}`)
console.log(`  user id: ${userId}`)
