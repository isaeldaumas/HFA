import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'

function jsonError(message: string, status: number) {
  return NextResponse.json({ detail: message }, { status })
}

const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'cancelled']
const VALID_EFFECTIVENESS = ['NOT_ASSESSED', 'PENDING_VERIFICATION', 'EFFECTIVE', 'PARTIALLY_EFFECTIVE', 'INEFFECTIVE']
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical']
const VALID_CATEGORIES = ['TREINAMENTO', 'PROCEDIMENTO', 'EQUIPAMENTO', 'SUPERVISAO', 'COMUNICACAO', 'OUTRO']

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireBearerUser(req)
    if (!['admin', 'analyst'].includes(String(user.role).toLowerCase())) {
      return jsonError('Permissão insuficiente para atualizar ações.', 403)
    }
    assertServiceRoleEnv()
    const admin = getSupabaseAdmin()
    const { id } = await params

    const body = await req.json().catch(() => ({}))
    const { status, responsible, due_date, effectiveness_status, effectiveness_notes, effectiveness_review_due_date, priority, category, owner_user_id } = body as {
      status?: string
      responsible?: string | null
      due_date?: string | null
      effectiveness_status?: string
      effectiveness_notes?: string | null
      effectiveness_review_due_date?: string | null
      priority?: string
      category?: string | null
      owner_user_id?: string | null
    }

    const { data: current, error: currentError } = await admin
      .from('corrective_actions')
      .select('id, status, effectiveness_status')
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .maybeSingle()
    if (currentError) return jsonError(currentError.message, 500)
    if (!current) return jsonError('Ação não encontrada', 404)

    const updates: Record<string, unknown> = {}

    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return jsonError('status inválido', 400)
      }
      updates.status = status
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString()
        if (current.effectiveness_status === 'NOT_ASSESSED') updates.effectiveness_status = 'PENDING_VERIFICATION'
      } else if (current.status === 'completed') {
        updates.completed_at = null
        updates.effectiveness_status = 'NOT_ASSESSED'
        updates.effectiveness_reviewed_at = null
      }
    }

    if (responsible !== undefined) {
      updates.responsible = responsible?.trim() || null
    }

    if (due_date !== undefined) {
      updates.due_date = due_date || null
    }

    if (priority !== undefined) {
      if (!VALID_PRIORITIES.includes(priority)) return jsonError('priority inválida', 400)
      updates.priority = priority
    }

    if (category !== undefined) {
      if (category !== null && !VALID_CATEGORIES.includes(category)) return jsonError('category inválida', 400)
      updates.category = category || null
    }

    if (owner_user_id !== undefined) {
      if (owner_user_id) {
        const owner = await admin.from('users').select('id').eq('id', owner_user_id).eq('tenant_id', user.tenantId).eq('is_active', true).maybeSingle()
        if (owner.error) return jsonError('Não foi possível validar o responsável.', 500)
        if (!owner.data) return jsonError('Responsável não pertence à organização ou está inativo.', 400)
      }
      updates.owner_user_id = owner_user_id || null
    }

    if (effectiveness_status !== undefined) {
      if (!VALID_EFFECTIVENESS.includes(effectiveness_status)) return jsonError('effectiveness_status inválido', 400)
      const effectiveActionStatus = status ?? current.status
      if (effectiveActionStatus !== 'completed') {
        return jsonError('A eficácia só pode ser avaliada após a conclusão da ação.', 400)
      }
      updates.effectiveness_status = effectiveness_status
      updates.effectiveness_reviewed_at = ['EFFECTIVE', 'PARTIALLY_EFFECTIVE', 'INEFFECTIVE'].includes(effectiveness_status)
        ? new Date().toISOString()
        : null
    }

    if (effectiveness_notes !== undefined) updates.effectiveness_notes = effectiveness_notes?.trim() || null
    if (effectiveness_review_due_date !== undefined) updates.effectiveness_review_due_date = effectiveness_review_due_date || null

    if (Object.keys(updates).length === 0) {
      return jsonError('Nenhum campo para atualizar', 400)
    }

    const { data, error } = await admin
      .from('corrective_actions')
      .update(updates)
      .eq('id', id)
      .eq('tenant_id', user.tenantId)
      .select('id, status, responsible, due_date, completed_at, effectiveness_status, effectiveness_notes, effectiveness_review_due_date, effectiveness_reviewed_at, priority, category, owner_user_id')
      .single()

    if (error) return jsonError(error.message, 500)
    if (!data) return jsonError('Ação não encontrada', 404)

    return NextResponse.json(data)
  } catch (e) {
    if (e instanceof Response) return e
    return jsonError(String(e), 500)
  }
}
