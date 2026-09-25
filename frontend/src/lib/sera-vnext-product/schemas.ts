import {
  SERA_VNEXT_PRODUCT_BETA_DEFAULT_PAGE_SIZE,
  SERA_VNEXT_PRODUCT_BETA_MAX_NARRATIVE_LENGTH,
  SERA_VNEXT_PRODUCT_BETA_MAX_PAGE_SIZE,
  SERA_VNEXT_PRODUCT_BETA_MIN_NARRATIVE_LENGTH,
} from './constants'
import { SeraVNextProductError } from './errors'
import { isAnalysisStatus, isReviewDecision, isReviewStatus } from './statuses'
import type {
  SeraVNextClarificationResponse,
  SeraVNextCreateAnalysisInput,
  SeraVNextListAnalysesQuery,
  SeraVNextProductSourceType,
  SeraVNextReviewInput,
} from './types'

const URL_PATTERN = /\b(?:https?:\/\/|www\.|ftp:\/\/|file:\/\/|data:text\/html|javascript:)/i
const SCRIPT_TAG_PATTERN = /<\s*script\b/i
const HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/gi
const SECRET_FRAGMENT_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]{10,}|Bearer\s+[A-Za-z0-9._-]{10,}|AKIA[0-9A-Z]{16})\b/g
const SAFE_CLIENT_REQUEST_ID = /[^a-zA-Z0-9_\-.:]/g
const sourceTypes = ['REAL_EVENT', 'TRAINING', 'INTERNAL_PILOT', 'OTHER'] as const
const evidenceValues = ['SUFFICIENT_FOR_WORKING_HYPOTHESIS', 'INSUFFICIENT', 'CONFLICTING', 'UNRESOLVED'] as const

function compact(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function sanitizeTextForProductBeta(value: string): { text: string; warnings: string[] } {
  const warnings: string[] = []
  let text = value.trim()
  if (SCRIPT_TAG_PATTERN.test(text)) {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_SCRIPT_NOT_ALLOWED', 'Scripts ou HTML executável não são aceitos.', 400)
  }
  const stripped = compact(text.replace(HTML_TAG_PATTERN, ' '))
  if (stripped !== text) warnings.push('HTML_TAGS_STRIPPED')
  text = compact(stripped.replace(SECRET_FRAGMENT_PATTERN, '[REDACTED_SECRET]'))
  if (text !== stripped) warnings.push('SENSITIVE_TEXT_REDACTED')
  return { text, warnings }
}

function parseSourceType(value: unknown): SeraVNextProductSourceType {
  if (typeof value === 'string' && (sourceTypes as readonly string[]).includes(value)) {
    return value as SeraVNextProductSourceType
  }
  return 'INTERNAL_PILOT'
}

export function sanitizeClientRequestId(value: unknown): string {
  const raw = typeof value === 'string' ? value : ''
  const sanitized = raw.replace(SAFE_CLIENT_REQUEST_ID, '').slice(0, 80)
  if (!sanitized) {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_CLIENT_REQUEST_ID_REQUIRED', 'clientRequestId é obrigatório.', 400)
  }
  return sanitized
}

function optionalString(value: unknown, max = 500): string | null {
  if (value === undefined || value === null) return null
  if (typeof value !== 'string') return null
  const clean = compact(value).slice(0, max)
  return clean || null
}

export function validateCreateAnalysisInput(raw: unknown): SeraVNextCreateAnalysisInput & { warnings: string[] } {
  if (!raw || typeof raw !== 'object') {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_INPUT_REQUIRED', 'Body JSON é obrigatório.', 400)
  }
  const body = raw as Record<string, unknown>
  const title = optionalString(body.title, 180)
  if (!title) {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_TITLE_REQUIRED', 'Título é obrigatório.', 400)
  }
  if (typeof body.narrative !== 'string') {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_NARRATIVE_REQUIRED', 'Relato é obrigatório.', 400)
  }
  if (URL_PATTERN.test(body.narrative)) {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_URL_NOT_ALLOWED', 'URLs não são aceitas neste endpoint interno.', 400)
  }
  const sanitized = sanitizeTextForProductBeta(body.narrative)
  if (sanitized.text.length < SERA_VNEXT_PRODUCT_BETA_MIN_NARRATIVE_LENGTH) {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_NARRATIVE_TOO_SHORT', `O relato deve ter pelo menos ${SERA_VNEXT_PRODUCT_BETA_MIN_NARRATIVE_LENGTH} caracteres.`, 400)
  }
  if (sanitized.text.length > SERA_VNEXT_PRODUCT_BETA_MAX_NARRATIVE_LENGTH) {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_NARRATIVE_TOO_LONG', `O relato deve ter no máximo ${SERA_VNEXT_PRODUCT_BETA_MAX_NARRATIVE_LENGTH} caracteres.`, 400)
  }

  return {
    title,
    narrative: sanitized.text,
    sourceType: parseSourceType(body.sourceType),
    sourceReference: optionalString(body.sourceReference, 500),
    clientRequestId: sanitizeClientRequestId(body.clientRequestId),
    metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {},
    warnings: sanitized.warnings,
  }
}

export function parseListAnalysesQuery(url: URL): SeraVNextListAnalysesQuery {
  const page = Math.max(1, Number.parseInt(url.searchParams.get('page') ?? '1', 10) || 1)
  const requestedPageSize = Number.parseInt(url.searchParams.get('pageSize') ?? String(SERA_VNEXT_PRODUCT_BETA_DEFAULT_PAGE_SIZE), 10)
  const pageSize = Math.max(1, Math.min(SERA_VNEXT_PRODUCT_BETA_MAX_PAGE_SIZE, requestedPageSize || SERA_VNEXT_PRODUCT_BETA_DEFAULT_PAGE_SIZE))
  const statusParam = url.searchParams.get('status') ?? undefined
  const reviewStatusParam = url.searchParams.get('reviewStatus') ?? undefined
  const sortParam = url.searchParams.get('sort') ?? 'created_at_desc'

  return {
    page,
    pageSize,
    status: statusParam && isAnalysisStatus(statusParam) ? statusParam : undefined,
    reviewStatus: reviewStatusParam && isReviewStatus(reviewStatusParam) ? reviewStatusParam : undefined,
    createdBy: optionalString(url.searchParams.get('createdBy'), 80) ?? undefined,
    search: optionalString(url.searchParams.get('search'), 120) ?? undefined,
    from: optionalString(url.searchParams.get('from'), 40) ?? undefined,
    to: optionalString(url.searchParams.get('to'), 40) ?? undefined,
    sort: sortParam === 'created_at_asc' || sortParam === 'updated_at_desc' ? sortParam : 'created_at_desc',
  }
}

export function validateReviewInput(raw: unknown): SeraVNextReviewInput {
  if (!raw || typeof raw !== 'object') {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_REVIEW_INPUT_REQUIRED', 'Body JSON é obrigatório.', 400)
  }
  const body = raw as Record<string, unknown>
  if (typeof body.decision !== 'string' || !isReviewDecision(body.decision)) {
    throw new SeraVNextProductError('SERA_VNEXT_PRODUCT_BETA_REVIEW_DECISION_INVALID', 'Decisão de revisão inválida.', 400)
  }
  const evidenceSufficiency = typeof body.evidenceSufficiency === 'string' && (evidenceValues as readonly string[]).includes(body.evidenceSufficiency)
    ? body.evidenceSufficiency as SeraVNextReviewInput['evidenceSufficiency']
    : 'UNRESOLVED'

  return {
    decision: body.decision,
    reviewNotes: optionalString(body.reviewNotes, 5000),
    escapePointAssessment: optionalString(body.escapePointAssessment, 2000),
    perceptionAssessment: optionalString(body.perceptionAssessment, 2000),
    objectiveAssessment: optionalString(body.objectiveAssessment, 2000),
    actionAssessment: optionalString(body.actionAssessment, 2000),
    preconditionsAssessment: optionalString(body.preconditionsAssessment, 2000),
    evidenceSufficiency,
    requiresMoreEvidence: Boolean(body.requiresMoreEvidence) || body.decision === 'REQUIRES_MORE_EVIDENCE',
    metadata: body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata) ? body.metadata as Record<string, unknown> : {},
  }
}

export function validateClarificationResponses(raw: unknown): SeraVNextClarificationResponse[] {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) {
    throw new SeraVNextProductError('SERA_VNEXT_CLARIFICATION_RESPONSES_INVALID', 'clarificationResponses deve ser uma lista.', 400)
  }
  if (raw.length > 20) {
    throw new SeraVNextProductError('SERA_VNEXT_CLARIFICATION_RESPONSES_TOO_MANY', 'No máximo 20 respostas de esclarecimento por reanálise.', 400)
  }
  const seen = new Set<string>()
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new SeraVNextProductError('SERA_VNEXT_CLARIFICATION_RESPONSE_INVALID', `Resposta de esclarecimento ${index + 1} inválida.`, 400)
    }
    const obj = item as Record<string, unknown>
    const questionId = typeof obj.questionId === 'string'
      ? obj.questionId.replace(SAFE_CLIENT_REQUEST_ID, '').slice(0, 160)
      : ''
    if (!questionId || seen.has(questionId)) {
      throw new SeraVNextProductError('SERA_VNEXT_CLARIFICATION_QUESTION_ID_INVALID', 'questionId ausente, inválido ou duplicado.', 400)
    }
    if (typeof obj.response !== 'string') {
      throw new SeraVNextProductError('SERA_VNEXT_CLARIFICATION_RESPONSE_REQUIRED', `Resposta para ${questionId} é obrigatória.`, 400)
    }
    const sanitized = sanitizeTextForProductBeta(obj.response)
    if (sanitized.text.length < 2 || sanitized.text.length > 5000) {
      throw new SeraVNextProductError('SERA_VNEXT_CLARIFICATION_RESPONSE_LENGTH_INVALID', `Resposta para ${questionId} deve ter entre 2 e 5000 caracteres.`, 400)
    }
    seen.add(questionId)
    return { questionId, response: sanitized.text }
  })
}
