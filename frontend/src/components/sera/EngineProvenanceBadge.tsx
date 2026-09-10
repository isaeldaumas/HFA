// Identificação de motor/proveniência na interface (auditoria HFA, 3ª etapa — F-14).
// Ver docs/auditoria-hfa/terceira-etapa/04-congelamento-legado.md e
// docs/auditoria-hfa/segunda-etapa/03-comparacao-motores.md.
//
// Mostra, de forma discreta: qual motor gerou o resultado, se veio de IA/heurística/humano,
// e o status de validação. Nunca apresenta UNRESOLVED/INSUFFICIENT_EVIDENCE como erro do
// sistema — apenas como um estado epistêmico legítimo.

export type GeneratedByType =
  | 'deterministic_engine'
  | 'llm_suggestion'
  | 'human_analyst'
  | 'imported_legacy'
  | 'migration'
  | 'unknown_legacy'
  | null
  | undefined

export type ValidationStatus = 'not_validated' | 'pending_review' | 'validated' | 'rejected' | null | undefined

export type EngineProvenanceBadgeProps = {
  engineId?: string | null
  engineVersion?: string | null
  generatedByType?: GeneratedByType
  validationStatus?: ValidationStatus
  isShadowCandidate?: boolean
}

const GENERATED_BY_LABEL: Record<string, string> = {
  deterministic_engine: 'motor determinístico',
  llm_suggestion: 'sugestão de IA',
  human_analyst: 'analista humano',
  imported_legacy: 'importado (legado)',
  migration: 'migração',
  unknown_legacy: 'origem legada não rastreada',
}

const VALIDATION_LABEL: Record<string, string> = {
  not_validated: 'não validado',
  pending_review: 'revisão pendente',
  validated: 'validado por humano',
  rejected: 'rejeitado',
}

export function describeEngineProvenance(props: EngineProvenanceBadgeProps): string {
  const parts: string[] = []
  if (props.isShadowCandidate) parts.push('CANDIDATO (shadow mode) — não é o resultado de produção')
  parts.push(props.engineId ?? 'motor não identificado')
  if (props.engineVersion) parts.push(`v${props.engineVersion}`)
  parts.push(GENERATED_BY_LABEL[props.generatedByType ?? ''] ?? 'origem não identificada')
  parts.push(VALIDATION_LABEL[props.validationStatus ?? ''] ?? 'status de validação desconhecido')
  return parts.join(' · ')
}

export function EngineProvenanceBadge(props: EngineProvenanceBadgeProps) {
  const isSuggestion = props.generatedByType === 'llm_suggestion'
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
      {props.isShadowCandidate ? (
        <span className="rounded-full border border-amber-800 bg-amber-950 px-2 py-0.5 font-semibold uppercase tracking-wide text-amber-400">
          Candidato — shadow mode
        </span>
      ) : null}
      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5">
        Motor: {props.engineId ?? 'não identificado'}{props.engineVersion ? ` v${props.engineVersion}` : ''}
      </span>
      <span className={`rounded-full border px-2 py-0.5 ${isSuggestion ? 'border-blue-800 bg-blue-950 text-blue-300' : 'border-slate-700 bg-slate-900'}`}>
        {GENERATED_BY_LABEL[props.generatedByType ?? ''] ?? 'origem não identificada'}
        {isSuggestion ? ' (não é decisão validada)' : ''}
      </span>
      <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5">
        {VALIDATION_LABEL[props.validationStatus ?? ''] ?? 'status de validação desconhecido'}
      </span>
    </div>
  )
}
