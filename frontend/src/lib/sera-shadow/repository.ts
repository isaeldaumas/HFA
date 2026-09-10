import type { SupabaseClient } from '@supabase/supabase-js'

export type ShadowResultRow = {
  id: string
  tenant_id: string
  legacy_analysis_id: string | null
  legacy_event_id: string | null
  shadow_run_id: string
  legacy_engine_version: string | null
  vnext_engine_version: string
  vnext_methodology_version: string
  vnext_engine_output: Record<string, unknown>
  divergence_summary: Record<string, unknown>
  human_review_required: boolean
  generated_by_type: string
  validation_status: string
  created_at: string
}

export type InsertShadowResultInput = Omit<ShadowResultRow, 'id' | 'created_at'>

/**
 * Idempotência aplicada em nível de aplicação: consulta antes de inserir (a tabela é
 * append-only por trigger — não permite UPDATE/DELETE — e ainda não tem constraint UNIQUE de
 * shadow_run_id no schema; ver docs/auditoria-hfa/terceira-etapa/08-migrations.md §Riscos).
 * Reprocessar a mesma análise com a mesma versão do vNext não deve criar linhas duplicadas.
 */
export async function findExistingShadowResult(
  admin: SupabaseClient,
  tenantId: string,
  shadowRunId: string
): Promise<ShadowResultRow | null> {
  const { data, error } = await admin
    .from('sera_vnext_shadow_results')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('shadow_run_id', shadowRunId)
    .maybeSingle()
  if (error) throw new Error(`SERA_SHADOW_REPOSITORY_FIND: ${error.message}`)
  return (data as ShadowResultRow | null) ?? null
}

export async function insertShadowResult(
  admin: SupabaseClient,
  input: InsertShadowResultInput
): Promise<ShadowResultRow> {
  const { data, error } = await admin
    .from('sera_vnext_shadow_results')
    .insert(input)
    .select('*')
    .single()
  if (error || !data) throw new Error(`SERA_SHADOW_REPOSITORY_INSERT: ${error?.message ?? 'no data returned'}`)
  return data as ShadowResultRow
}

/** Restrito a perfis autorizados — ver isShadowAdminViewEnabled() e requireAdmin no chamador. */
export async function listShadowResultsForTenant(
  admin: SupabaseClient,
  tenantId: string,
  limit = 50
): Promise<ShadowResultRow[]> {
  const { data, error } = await admin
    .from('sera_vnext_shadow_results')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`SERA_SHADOW_REPOSITORY_LIST: ${error.message}`)
  return (data as ShadowResultRow[] | null) ?? []
}
