import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'

export async function POST(req: Request) {
  try {
    await requireBearerUser(req)
    return NextResponse.json(
      { detail: 'Recálculo do motor anterior foi desativado. Reprocesse o evento com o motor SERA 0.3.' },
      { status: 410 },
    )
  } catch (error) {
    if (error instanceof Response) return error
    return NextResponse.json({ detail: 'Não foi possível processar a solicitação.' }, { status: 500 })
  }
}
