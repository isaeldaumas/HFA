import { handleAdminPasswordResetRequest } from '@/lib/server/password-reset-handler'

export async function POST(req: Request) {
  return handleAdminPasswordResetRequest(req)
}
