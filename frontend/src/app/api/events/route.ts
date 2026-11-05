import { NextResponse } from 'next/server'
import { requireBearerUser } from '@/lib/server/api-auth'
import { getSupabaseAdmin, assertServiceRoleEnv } from '@/lib/server/supabase-admin'
import { withOptionalUserAiSettings } from '@/lib/server/user-ai-settings'
import { debitCreditForEvent, ensurePublicUserRow, refundCreditForFailedAnalysis } from '@/lib/server/tenant-user'
import { getOrCreateRequestId, buildErrorResponse } from '@/lib/observability/request-id'
import { writeAuditLog } from '@/lib/observability/audit'
import { canonicalAnalyzeResponse, createCanonicalEventAnalysis } from '@/lib/sera-vnext-product/canonical-event-analysis'
import { inferOccurrenceDateFromNarrative } from '@/lib/sera-vnext/occurrence-date'
import { enrichSeraNarrativeSemantically } from '@/lib/sera-vnext/ai/semantic-enrichment'
import { findTenantDuplicateCandidates, publicDuplicateMatches } from '@/lib/server/event-duplicates'
import {
  MAX_BATCH_FILE_COUNT,
  MAX_SINGLE_FILE_BYTES,
  MAX_TOTAL_BATCH_BYTES,
  StoredDocumentDescriptor,
} from '@/lib/gemini-multifile-types'
import {
  sanitizeFileName,
  validateFileSecurity,
} from '@/lib/gemini-multifile-security'

export const maxDuration = 300

type SourceMeta = {
  sourceType?: 'text' | 'pdf' | 'docx'
  sourceFileName?: string
  sourceWordCount?: number
}

function logEventsError(error: unknown, stage: string, extra: Record<string, unknown> = {}) {
  const e = error instanceof Error ? error : new Error(String(error))
  console.error('[/api/events Error]', { stage, message: e.message, stack: e.stack, cause: e.cause, ...extra })
}

/**
 * Persiste todos os arquivos do lote no Supabase Storage e na tabela public.event_documents.
 * Sanitiza caminhos contra path traversal e garante proveniencia criptografica individual.
 */
async function persistUploadedSourceFiles(params: {
  admin: ReturnType<typeof getSupabaseAdmin>
  tenantId: string
  submittedById: string
  eventId: string
  files: File[]
  analysisId?: string
}): Promise<StoredDocumentDescriptor[]> {
  const { admin, tenantId, submittedById, eventId, files, analysisId } = params
  const descriptors: StoredDocumentDescriptor[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    try {
      if (file.size > MAX_SINGLE_FILE_BYTES) {
        console.warn(`[persistUploadedSourceFiles] Arquivo excede 10MB: ${file.name}`)
        continue
      }
      const buf = Buffer.from(await file.arrayBuffer())
      const security = validateFileSecurity({
        name: file.name,
        size: file.size,
        buffer: buf,
        declaredMime: file.type,
      })

      if (!security.valid && security.status === 'mime_spoofing') {
        console.warn(`[persistUploadedSourceFiles] Possivel spoofing rejeitado: ${file.name}`)
        continue
      }

      const safeName = security.sanitizedName
      const shortHash = security.sha256.slice(0, 10)
      const pathPrefix = analysisId
        ? `${submittedById}/${analysisId}`
        : `events/${submittedById}/${eventId}`
      const storagePath = `${pathPrefix}/${i + 1}_${shortHash}_${safeName}`

      const { error: uploadError } = await admin.storage
        .from('analysis-documents')
        .upload(storagePath, buf, {
          contentType: security.canonicalMime || file.type || 'application/octet-stream',
          upsert: true,
        })

      if (uploadError) {
        console.warn(`[persistUploadedSourceFiles] Erro no storage para ${file.name}:`, uploadError.message)
        continue
      }

      // Insercao na tabela event_documents (preservando o schema oficial do Supabase)
      const { error: insertError } = await admin.from('event_documents').insert({
        tenant_id: tenantId,
        event_id: eventId,
        uploaded_by: submittedById,
        file_name: file.name,
        storage_path: storagePath,
        mime_type: security.canonicalMime || file.type || null,
        size_bytes: file.size,
      })

      if (insertError) {
        console.warn(`[persistUploadedSourceFiles] Erro ao inserir event_documents:`, insertError.message)
      }

      descriptors.push({
        fileName: file.name,
        sanitizedName: safeName,
        storagePath,
        mimeType: security.canonicalMime || file.type || null,
        sizeBytes: file.size,
        sha256: security.sha256,
        status: security.status,
        wordCount: 0,
      })
    } catch (err) {
      console.error(`[persistUploadedSourceFiles] Falha ao processar ${file.name}:`, err)
    }
  }

  return descriptors
}

export async function GET(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  try {
    const user = await requireBearerUser(req)
    const scope = new URL(req.url).searchParams.get('scope') ?? 'active'
    const admin = getSupabaseAdmin()
    let query = admin
      .from('events')
      .select('*, analyses(perception_code, objective_code, action_code)')
      .eq('tenant_id', user.tenantId)
      .order('created_at', { ascending: false })
    if (scope === 'deleted') query = query.not('deleted_at', 'is', null).neq('deletion_status', 'PURGED')
    else query = query.is('deleted_at', null).neq('deletion_status', 'PURGED')

    const { data, error } = await query
    if (error) return jsonError('Não foi possível listar os eventos.', 500)

    const eventIds = (data ?? []).map((event) => event.id).filter((id): id is string => typeof id === 'string')
    const duplicateRes = await admin.from('event_duplicate_links')
      .select('duplicate_event_id, canonical_event_id').eq('tenant_id', user.tenantId)
    if (duplicateRes.error) return jsonError('Não foi possível listar os eventos.', 500)
    const canonicalForDuplicate = new Map((duplicateRes.data ?? []).map((item) => [item.duplicate_event_id, item.canonical_event_id]))
    const [exclusions, vnext] = eventIds.length === 0
      ? [{ data: [], error: null }, { data: [], error: null }] as const
      : await Promise.all([
          admin
            .from('risk_profile_exclusions')
            .select('id, source_id, reason, excluded_at')
            .eq('tenant_id', user.tenantId)
            .eq('source_type', 'legacy_event')
            .in('source_id', eventIds)
            .is('restored_at', null),
          admin
            .from('sera_vnext_analyses')
            .select('id, source_reference, updated_at, perception_candidate_code, objective_candidate_code, action_candidate_code, review_status, status')
            .eq('tenant_id', user.tenantId)
            .in('source_reference', eventIds)
            .is('deleted_at', null)
            .order('updated_at', { ascending: false }),
        ])
    if (exclusions.error || vnext.error) return jsonError('Não foi possível listar os eventos.', 500)

    const exclusionBySourceId = new Map((exclusions.data ?? []).map((row) => [row.source_id as string, row]))
    const vnextByEvent = new Map<string, Record<string, unknown>>()
    for (const row of vnext.data ?? []) {
      const eventId = typeof row.source_reference === 'string' ? row.source_reference : ''
      if (eventId && !vnextByEvent.has(eventId)) vnextByEvent.set(eventId, row as Record<string, unknown>)
    }

    const rows = (data ?? []).map((ev) => {
      const legacyAnalyses = ev.analyses
      const legacy = Array.isArray(legacyAnalyses) ? (legacyAnalyses[0] ?? null) : (legacyAnalyses ?? null)
      const current = vnextByEvent.get(ev.id as string) ?? null
      const exclusion = exclusionBySourceId.get(ev.id as string)
      return {
        ...ev,
        perception_code: (current?.perception_candidate_code as string | null | undefined) ?? null,
        objective_code: (current?.objective_candidate_code as string | null | undefined) ?? null,
        action_code: (current?.action_candidate_code as string | null | undefined) ?? null,
        analysis_engine: current ? 'SERA_ENGINE_0_3' : legacy ? 'LEGACY_HISTORICAL' : null,
        analysis_review_status: current?.review_status ?? null,
        analysis_status: current?.status ?? null,
        is_excluded_from_risk_profile: !!exclusion || canonicalForDuplicate.has(ev.id as string),
        duplicate_of_event_id: canonicalForDuplicate.get(ev.id as string) ?? null,
        risk_profile_exclusion_id: exclusion?.id ?? null,
        risk_profile_exclusion_reason: (exclusion?.reason as string | null | undefined) ?? null,
        risk_profile_exclusion_at: (exclusion?.excluded_at as string | null | undefined) ?? null,
        deleted_at: ev.deleted_at ?? null,
        deletion_status: ev.deletion_status ?? null,
        recoverable_until: ev.recoverable_until ?? null,
        analyses: undefined,
      }
    })
    return NextResponse.json(rows, { headers: { 'x-request-id': requestId } })
  } catch (e) {
    if (e instanceof Response) return e
    logEventsError(e, 'get-events', { requestId })
    return jsonError('Não foi possível listar os eventos.', 500)
  }
}

export async function POST(req: Request) {
  const requestId = getOrCreateRequestId(req)
  const jsonError = (message: string, status: number) => buildErrorResponse(message, status, requestId)
  let stage = 'start'
  let context: Record<string, unknown> = { requestId }
  try {
    stage = 'auth'
    const user = await requireBearerUser(req)
    context = { requestId, userId: user.userId, tenantId: user.tenantId }
    try {
      stage = 'assert-service-role-env'
      assertServiceRoleEnv()
    } catch {
      return jsonError('Serviço temporariamente indisponível.', 503)
    }

    const admin = getSupabaseAdmin()
    const ct = req.headers.get('content-type') || ''
    let title: string
    let duplicateOverrideReason = ''
    let raw_input: string
    let operation_type: string | null = null
    let aircraft_type: string | null = null
    let occurred_at: string | null = null
    let locale: 'pt-BR' | 'en' = 'pt-BR'
    let analysisMode: 'register_only' | 'hfa' = 'hfa'
    let confidentialityLevel: 'STANDARD' | 'CONFIDENTIAL' = 'STANDARD'
    let input_type: 'text' | 'pdf' | 'docx' = 'text'
    const sourceMeta: SourceMeta = { sourceType: 'text' }
    let sourceFile: File | null = null
    const sourceFiles: File[] = []

    if (ct.includes('multipart/form-data')) {
      const form = await req.formData()
      title = String(form.get('title') || '')
      duplicateOverrideReason = String(form.get('duplicate_override_reason') || '')
      raw_input = String(form.get('raw_input') || '')
      operation_type = form.get('operation_type') ? String(form.get('operation_type')) : null
      aircraft_type = form.get('aircraft_type') ? String(form.get('aircraft_type')) : null
      occurred_at = form.get('occurred_at') ? String(form.get('occurred_at')) : null
      locale = form.get('locale') === 'en' ? 'en' : 'pt-BR'
      analysisMode = form.get('analysis_mode') === 'register_only' ? 'register_only' : 'hfa'
      confidentialityLevel = form.get('confidentiality_level') === 'CONFIDENTIAL' ? 'CONFIDENTIAL' : 'STANDARD'
      const it = form.get('input_type')
      if (it === 'pdf' || it === 'docx' || it === 'text') input_type = it
      const st = form.get('source_type')
      if (st === 'pdf' || st === 'docx') { sourceMeta.sourceType = st; input_type = st }
      const fn = form.get('source_file_name')
      if (fn) sourceMeta.sourceFileName = String(fn)
      const wc = form.get('source_word_count')
      if (wc) sourceMeta.sourceWordCount = Number(wc)

      // Suporte a multiplos arquivos (padrao novo 'files' e retrocompatibilidade com 'file')
      for (const item of form.getAll('files')) {
        if (item instanceof File && item.size > 0) sourceFiles.push(item)
      }
      for (const item of form.getAll('file')) {
        if (item instanceof File && item.size > 0 && !sourceFiles.includes(item)) {
          sourceFiles.push(item)
        }
      }

      if (sourceFiles.length > MAX_BATCH_FILE_COUNT) {
        return jsonError(`Limite de arquivos excedido: máximo de ${MAX_BATCH_FILE_COUNT} arquivos por evento.`, 400)
      }
      const totalBatchBytes = sourceFiles.reduce((acc, f) => acc + f.size, 0)
      if (totalBatchBytes > MAX_TOTAL_BATCH_BYTES) {
        return jsonError('Tamanho total dos arquivos ultrapassa 30MB.', 400)
      }

      if (sourceFiles.length > 0) {
        sourceFile = sourceFiles[0]
        if (!sourceMeta.sourceFileName) sourceMeta.sourceFileName = sourceFile.name
        const hasPdf = sourceFiles.some((f) => f.name.toLowerCase().endsWith('.pdf'))
        const hasDocx = sourceFiles.some((f) => f.name.toLowerCase().endsWith('.docx'))
        if (hasPdf) input_type = 'pdf'
        else if (hasDocx) input_type = 'docx'
        else input_type = 'text'
      }
    } else {
      const body = (await req.json()) as Record<string, unknown>
      title = String(body.title || '')
      duplicateOverrideReason = typeof body.duplicate_override_reason === 'string' ? body.duplicate_override_reason : ''
      raw_input = String(body.raw_input || '')
      operation_type = body.operation_type != null ? String(body.operation_type) : null
      aircraft_type = body.aircraft_type != null ? String(body.aircraft_type) : null
      occurred_at = body.occurred_at != null ? String(body.occurred_at) : null
      locale = body.locale === 'en' ? 'en' : 'pt-BR'
      analysisMode = body.analysis_mode === 'register_only' ? 'register_only' : 'hfa'
      confidentialityLevel = body.confidentiality_level === 'CONFIDENTIAL' ? 'CONFIDENTIAL' : 'STANDARD'
      const it = body.input_type
      if (it === 'pdf' || it === 'docx' || it === 'text') input_type = it
      const st = body.source_type
      if (st === 'pdf' || st === 'docx') { sourceMeta.sourceType = st; input_type = st }
      if (body.source_file_name) sourceMeta.sourceFileName = String(body.source_file_name)
      if (body.source_word_count != null) sourceMeta.sourceWordCount = Number(body.source_word_count)
    }

    if (!title.trim() || !raw_input.trim()) return jsonError('Título e relato são obrigatórios', 400)

    // Check before any debit, record creation, SERA run or attachment upload.
    // The client must explicitly acknowledge an independent occurrence.
    stage = 'duplicate-check'
    const matches = await findTenantDuplicateCandidates({
      admin, tenantId: user.tenantId,
      input: { id: '__NEW_EVENT__', title, raw_input, occurred_at, aircraft_type, operation_type },
      excludeConfirmedDuplicates: true,
    })
    if (matches.length && duplicateOverrideReason.trim().length < 20) {
      return NextResponse.json({
        code: 'POSSIBLE_EVENT_DUPLICATE',
        detail: 'Possível duplicidade: já existe um registro equivalente nesta empresa. Confira antes de criar outro evento.',
        duplicates: publicDuplicateMatches(matches),
      }, { status: 409, headers: { 'x-request-id': requestId, 'Cache-Control': 'no-store' } })
    }
    if (matches.length && duplicateOverrideReason.trim().length >= 20) {
      await writeAuditLog({ tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'event.duplicate_warning_overridden', entityType: 'event', entityId: matches[0].id,
        route: '/api/events', method: 'POST', status: 'partial',
        metadata: { matchedEventIds: matches.map((item) => item.id), reason: duplicateOverrideReason.trim() },
      })
    }

    stage = 'ensure-public-user-row'
    const submittedById = await ensurePublicUserRow(admin, user.tenantId, user.userId, user.email, user.role)

    stage = 'fetch-tenant'
    const { data: tenant, error: terr } = await admin
      .from('tenants')
      .select('plan, credits_balance, trial_expires_at')
      .eq('id', user.tenantId)
      .single()
    if (terr || !tenant) return jsonError('Tenant não encontrado', 400)

    const isEnterprise = tenant.plan === 'enterprise'
    if (analysisMode === 'hfa') {
      const trialExpiresAt = tenant.trial_expires_at ? Date.parse(String(tenant.trial_expires_at)) : Number.NaN
      if (tenant.plan === 'trial' && Number.isFinite(trialExpiresAt) && trialExpiresAt <= Date.now()) {
        return jsonError('O piloto gratuito de 60 dias foi concluído. O registro de eventos continua disponível, mas novas análises HFA exigem continuidade do plano.', 402)
      }
      if (!isEnterprise && (tenant.credits_balance ?? 0) < 1) return jsonError('Créditos insuficientes para iniciar a análise HFA.', 402)
    }

    return await withOptionalUserAiSettings(admin, user.userId, analysisMode === 'hfa', async () => {
    // Never insert an HFA event before the required semantic AI pass succeeds.
    // A provider billing error (e.g. DeepSeek HTTP 402) otherwise creates a
    // second 'failed' occurrence after duplicate override with no analysis.
    let preparedSemantic: Awaited<ReturnType<typeof enrichSeraNarrativeSemantically>> | undefined
    if (analysisMode === 'hfa') {
      try {
        stage = 'preflight-ai'
        preparedSemantic = await enrichSeraNarrativeSemantically({ narrative: raw_input, locale })
      } catch (aiError) {
        logEventsError(aiError, 'preflight-ai', context)
        const text = aiError instanceof Error ? aiError.message : String(aiError)
        const billingFailure = /(?:402|insufficient.balance|quota.exceeded|payment.required)/i.test(text)
        return jsonError(billingFailure
          ? 'O provedor de IA configurado está sem saldo. Nenhum novo evento foi criado. Atualize o saldo ou escolha um provedor disponível em Configurações IA antes de tentar novamente.'
          : 'Não foi possível acessar o provedor de IA. Nenhum novo evento foi criado nem foi cobrada uma análise. Verifique Configurações IA e tente novamente.', 503)
      }
    }

    stage = 'insert-event'
    const { data: eventRow, error: eerr } = await admin
      .from('events')
      .insert({
        tenant_id: user.tenantId,
        submitted_by: submittedById,
        title,
        raw_input,
        input_type,
        operation_type,
        aircraft_type,
        occurred_at: occurred_at || inferOccurrenceDateFromNarrative(raw_input) || null,
        status: 'received',
        event_kind: analysisMode === 'register_only' ? 'SAFETY_REPORT' : 'HFA_ANALYSIS',
        triage_status: analysisMode === 'register_only' ? 'UNTRIAGED' : 'HFA_SELECTED',
        investigation_path: analysisMode === 'register_only' ? 'NONE' : 'HFA',
        source_system: 'HFA',
        confidentiality_level: confidentialityLevel,
        triaged_at: analysisMode === 'register_only' ? null : new Date().toISOString(),
        triaged_by: analysisMode === 'register_only' ? null : submittedById,
      })
      .select('id')
      .single()
    if (eerr || !eventRow) return jsonError('Não foi possível criar o evento.', 500)

    const eventId = eventRow.id as string
    context = { ...context, eventId }
    await writeAuditLog({
      tenantId: user.tenantId, userId: user.userId, requestId,
      eventType: 'event_created', entityType: 'event', entityId: eventId,
      route: '/api/events', method: 'POST',
      metadata: { source_type: sourceMeta.sourceType ?? input_type, analysis_mode: analysisMode, engine_role: analysisMode === 'hfa' ? 'PRIMARY' : 'NONE' },
    })

    if (analysisMode === 'register_only') {
      if (sourceFiles.length > 0) {
        try {
          await persistUploadedSourceFiles({
            admin,
            tenantId: user.tenantId,
            submittedById,
            eventId,
            files: sourceFiles,
          })
        } catch (documentError) {
          logEventsError(documentError, 'store-safety-event-document', { requestId, eventId })
        }
      }
      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'safety_event_reported', entityType: 'event', entityId: eventId,
        route: '/api/events', method: 'POST', status: 'success',
        metadata: { triage_status: 'UNTRIAGED', investigation_path: 'NONE', credits_used: 0 },
      })
      return NextResponse.json({ event_id: eventId, status: 'received', analysis_started: false, credits_used: 0 }, { status: 201, headers: { 'x-request-id': requestId } })
    }

    let creditDebited = false
    let success = false
    try {
      stage = 'debit-credit'
      await debitCreditForEvent({
        admin,
        tenantId: user.tenantId,
        submittedById,
        eventId,
        title,
        isEnterprise,
        currentBalance: tenant.credits_balance ?? 0,
      })
      creditDebited = true

      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'analysis_started', entityType: 'event', entityId: eventId,
        route: '/api/events', method: 'POST', metadata: { source: 'new_event', engine_role: 'PRIMARY' },
      })

      stage = 'run-primary-sera-engine'
      const result = await createCanonicalEventAnalysis({
        eventId,
        title,
        narrative: raw_input,
        preparedSemantic,
        mode: 'INITIAL',
        locale,
        context: { tenantId: user.tenantId, userId: submittedById, role: user.role, email: user.email ?? '', requestId },
      })

      if (sourceFiles.length > 0) {
        try {
          const descriptors = await persistUploadedSourceFiles({
            admin,
            tenantId: user.tenantId,
            submittedById,
            eventId,
            files: sourceFiles,
            analysisId: result.analysis.id,
          })

          if (descriptors.length > 0) {
            await admin
              .from('sera_vnext_analyses')
              .update({
                metadata: {
                  ...result.analysis.metadata,
                  sourceFileUrl: descriptors[0]?.storagePath || null,
                  sourceFileName: descriptors[0]?.fileName || null,
                  sourceType: sourceMeta.sourceType ?? input_type,
                  sourceFiles: descriptors,
                },
              })
              .eq('id', result.analysis.id)
              .eq('tenant_id', user.tenantId)
          }
        } catch (multiFileErr) {
          logEventsError(multiFileErr, 'store-hfa-analysis-documents', { requestId, eventId })
        }
      }

      const needsClarification = result.analysis.engine_output.evidenceSufficiency.status === 'NEEDS_CLARIFICATION'
      const eventUpdate = await admin
        .from('events')
        .update({ status: needsClarification ? 'received' : 'completed', credits_used: 1 })
        .eq('id', eventId)
        .eq('tenant_id', user.tenantId)
        .is('deleted_at', null)
      if (eventUpdate.error) throw new Error('PRIMARY_SERA_EVENT_STATUS_UPDATE_FAILED')

      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'canonical_engine.used', entityType: 'analysis', entityId: result.analysis.id,
        route: '/api/events', method: 'POST', status: needsClarification ? 'partial' : 'success',
        metadata: {
          engine_role: 'PRIMARY',
          source_flow: result.analysis.source_flow,
          engine_runtime_version: result.analysis.engine_runtime_version,
          event_id: eventId,
          human_review_required: true,
          evidence_sufficiency_status: result.analysis.engine_output.evidenceSufficiency.status,
        },
      })
      success = true
      return NextResponse.json(
        { ...canonicalAnalyzeResponse(result, eventId), status: needsClarification ? 'received' : 'completed' },
        { headers: { 'x-request-id': requestId } },
      )
    } catch (err) {
      await admin.from('events').update({ status: 'failed' }).eq('id', eventId).eq('tenant_id', user.tenantId)
      logEventsError(err, stage, context)
      await writeAuditLog({
        tenantId: user.tenantId, userId: user.userId, requestId,
        eventType: 'analysis_failed', entityType: 'event', entityId: eventId,
        route: '/api/events', method: 'POST', status: 'failed', metadata: { stage, engine_role: 'PRIMARY' },
      })
      return NextResponse.json({
        detail: 'O evento foi registrado, mas a análise não foi concluída. Abra o mesmo evento para tentar novamente, sem criar uma duplicata.',
        event_id: eventId,
        request_id: requestId,
        analysis_started: false,
      }, { status: 503, headers: { 'x-request-id': requestId, 'Cache-Control': 'no-store' } })
    } finally {
      if (creditDebited && !success) {
        try {
          const { data: tNow } = await admin.from('tenants').select('credits_balance').eq('id', user.tenantId).single()
          await refundCreditForFailedAnalysis({
            admin,
            tenantId: user.tenantId,
            submittedById,
            eventId,
            title,
            isEnterprise,
            currentBalanceAfterDebit: tNow?.credits_balance ?? 0,
          })
        } catch (refundErr) {
          logEventsError(refundErr, 'refund', context)
        }
      }
    }
    })
  } catch (e) {
    if (e instanceof Response) return e
    logEventsError(e, stage, context)
    return jsonError('Não foi possível criar o evento.', 500)
  }
}
