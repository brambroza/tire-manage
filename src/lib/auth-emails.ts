import { createAdminClient } from '@/lib/supabase/server'

/**
 * ดึงอีเมลเข้าสู่ระบบจาก auth.users ของผู้ใช้ตาม id ที่ระบุ
 * อีเมลไม่ได้เก็บใน profiles จึงต้องใช้ service-role client
 * ถ้าไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY จะคืน map ว่าง (ตารางจะไม่แสดงคอลัมน์อีเมล)
 */
export async function fetchEmailsByUserId(userIds: string[]): Promise<Map<string, string>> {
  const emails = new Map<string, string>()
  if (userIds.length === 0) return emails

  try {
    const admin = createAdminClient()
    const wanted = new Set(userIds)
    const perPage = 1000
    for (let page = 1; emails.size < wanted.size; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
      if (error || !data) break
      for (const u of data.users) {
        if (wanted.has(u.id) && u.email) emails.set(u.id, u.email)
      }
      if (data.users.length < perPage) break
    }
  } catch {
    // ไม่มี service role key — ข้ามการแสดงอีเมล
  }
  return emails
}
