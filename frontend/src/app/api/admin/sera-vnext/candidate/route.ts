import { handleSeraVNextCandidateRequest } from './handler'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  return handleSeraVNextCandidateRequest(req)
}
