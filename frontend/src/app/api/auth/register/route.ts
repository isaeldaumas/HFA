import { handleRegisterRequest } from '@/lib/server/register-handler'

export async function POST(req: Request) {
  return handleRegisterRequest(req)
}
