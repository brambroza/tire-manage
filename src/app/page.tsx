import { redirect } from 'next/navigation'
import { getSession, homePathFor } from '@/lib/auth'

/** หน้าแรก — ส่งผู้ใช้ไปยังหน้าเริ่มต้นตาม role */
export default async function RootPage() {
  const session = await getSession()
  if (!session) redirect('/login')
  redirect(homePathFor(session.profile.role))
}
