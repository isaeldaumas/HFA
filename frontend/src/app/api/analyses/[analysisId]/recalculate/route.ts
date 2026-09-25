import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'

export async function POST(req: Request) {
  try {
    await requireBearerUser(req)
    return NextResponse.json(
      { detail: 'Esta análise pertence ao motor histórico e não pode mais ser recalculada. Reprocesse o evento com o SERA 0.3.' },
      { status: 410 },
    )
  } catch (error) {
    if (error instanceof Response) return error
    return NextResponse.json({ detail: 'Não foi possível processar a solicitação.' }, { status: 500 })
  }
}
