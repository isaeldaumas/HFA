/**
 * Feature flags do shadow mode (auditoria HFA, 3ª etapa).
 * TODAS desligadas por padrão. Ver docs/auditoria-hfa/terceira-etapa/05-arquitetura-shadow-mode.md.
 *
 * Nenhuma automação, promoção ou exibição deste módulo deve ocorrer sem essas flags —
 * e mesmo com as flags ligadas, o resultado candidato NUNCA substitui a produção (D1).
 */
function readBooleanEnv(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  return value === 'true'
}

/** Executa o motor vNext em paralelo ao legado para a análise (sem afetar a resposta ao usuário). */
export function isShadowExecutionEnabled(): boolean {
  return readBooleanEnv('SERA_SHADOW_EXECUTION_ENABLED')
}

/** Persiste o resultado candidato em sera_vnext_shadow_results. */
export function isShadowPersistenceEnabled(): boolean {
  return readBooleanEnv('SERA_SHADOW_PERSISTENCE_ENABLED')
}

/** Permite que telas administrativas autorizadas consultem resultados de shadow. */
export function isShadowAdminViewEnabled(): boolean {
  return readBooleanEnv('SERA_SHADOW_ADMIN_VIEW_ENABLED')
}

/** Habilita o job de comparação automática legado × vNext. */
export function isShadowAutoComparisonEnabled(): boolean {
  return readBooleanEnv('SERA_SHADOW_AUTO_COMPARISON_ENABLED')
}

/** Permite incluir divergências de shadow em relatórios de validação (plano da 7ª seção). */
export function isShadowValidationReportsEnabled(): boolean {
  return readBooleanEnv('SERA_SHADOW_VALIDATION_REPORTS_ENABLED')
}
