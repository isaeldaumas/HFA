// AUDIT TEST — não faz parte do manifesto oficial.
// Valida que o shadow mode está desligado por padrão e que sua execução é no-op segura.
// Executar: npx tsx tests/hfa-audit/shadow-mode/shadow-mode-trial-001.ts

import {
  isShadowExecutionEnabled,
  isShadowPersistenceEnabled,
  isShadowAdminViewEnabled,
  isShadowAutoComparisonEnabled,
  isShadowValidationReportsEnabled,
} from '../../../frontend/src/lib/sera-shadow/feature-flags'
import { runShadowVNextIfEnabled } from '../../../frontend/src/lib/sera-shadow/run-shadow-analysis'

let failures = 0
function check(cond: boolean, label: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'} — ${label}`)
  if (!cond) failures++
}

check(isShadowExecutionEnabled() === false, 'SERA_SHADOW_EXECUTION_ENABLED desligado por padrão')
check(isShadowPersistenceEnabled() === false, 'SERA_SHADOW_PERSISTENCE_ENABLED desligado por padrão')
check(isShadowAdminViewEnabled() === false, 'SERA_SHADOW_ADMIN_VIEW_ENABLED desligado por padrão')
check(isShadowAutoComparisonEnabled() === false, 'SERA_SHADOW_AUTO_COMPARISON_ENABLED desligado por padrão')
check(isShadowValidationReportsEnabled() === false, 'SERA_SHADOW_VALIDATION_REPORTS_ENABLED desligado por padrão')

async function main() {
  // Com a flag desligada, runShadowVNextIfEnabled deve retornar SKIPPED_DISABLED sem tocar
  // em `admin` (não deve nem tentar autenticar/consultar o Supabase).
  const fakeAdminThatThrowsIfTouched = new Proxy(
    {},
    {
      get() {
        throw new Error('admin não deveria ser tocado com a flag desligada')
      },
    }
  ) as never

  const outcome = await runShadowVNextIfEnabled({
    admin: fakeAdminThatThrowsIfTouched,
    narrative: 'narrativa de teste',
    context: {
      tenantId: 'tenant-1',
      legacyAnalysisId: 'analysis-1',
      legacyEventId: 'event-1',
      legacyEngineVersion: 'v1',
    },
  })

  check(outcome.status === 'SKIPPED_DISABLED', 'com flag desligada, retorna SKIPPED_DISABLED sem tocar no admin client')

  console.log(failures === 0 ? 'SHADOW_MODE_TRIAL_OK' : `SHADOW_MODE_TRIAL_FAILED (${failures} falhas)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
