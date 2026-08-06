/**
 * สร้างบัญชี Super Admin (Dreammaker) ให้ระบบ Dream Tire
 *
 * ใช้ service role key จึงต้องรันฝั่ง server เท่านั้น
 * ห้ามใส่รหัสผ่านลงไฟล์นี้ — ส่งผ่าน argument ตอนรัน
 *
 * วิธีใช้:
 *   node --env-file=.env scripts/create-super-admin.mjs <email> <password> [ชื่อ-นามสกุล]
 *
 * ถ้ามีอีเมลนี้อยู่แล้ว สคริปต์จะอัปเดตรหัสผ่านและตั้ง role เป็น super_admin ให้แทน
 */
import { createClient } from '@supabase/supabase-js'

const [email, password, fullName = 'Dreammaker Admin'] = process.argv.slice(2)

if (!email || !password) {
  console.error('ใช้งาน: node --env-file=.env scripts/create-super-admin.mjs <email> <password> [ชื่อ]')
  process.exit(1)
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('ไม่พบ NEXT_PUBLIC_SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ใน environment')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

/**
 * ค้นหา auth user จากอีเมล
 * @param {string} target อีเมลที่ต้องการค้นหา
 * @returns {Promise<{id: string, email: string} | null>}
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
  console.log(`พบผู้ใช้เดิม (${email}) — กำลังอัปเดตรหัสผ่าน`)
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
  console.log(`สร้าง auth user เรียบร้อย: ${userId}`)
}

// super_admin ต้องมี company_id = null ตาม constraint ใน schema
const { error: profileError } = await admin
  .from('profiles')
  .upsert(
    { id: userId, company_id: null, role: 'super_admin', full_name: fullName, is_active: true },
    { onConflict: 'id' },
  )

if (profileError) {
  console.error('บันทึก profile ไม่สำเร็จ:', profileError.message)
  console.error('ตรวจสอบว่ารัน supabase/schema.sql ในโปรเจกต์นี้แล้วหรือยัง')
  process.exit(1)
}

console.log(`✓ ตั้งค่า ${email} เป็น super_admin เรียบร้อย (user id: ${userId})`)
