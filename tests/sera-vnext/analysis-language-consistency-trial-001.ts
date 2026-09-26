import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import { localizeActor } from '../../frontend/src/lib/sera-vnext/engine-v0/localization'

const ptNarrative = `A equipe de manutenção realizou a inspeção pré-voo e declarou que na inspeção visual nada de anormal fora detectado. No primeiro pouso, o HLO alertou que a portinhola estava aberta.`
const enNarrative = `The maintenance team performed the preflight inspection and reported that no abnormality was detected during the visual inspection. On the first landing, the HLO reported that the access panel was open.`

const common = {
  sourceType: 'real_event' as const,
  mode: 'CANDIDATE_ONLY' as const,
  options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
}

const pt = runSeraVNextEngineV0({
  ...common,
  inputId: 'LANG-PT',
  requestId: 'LANG-PT',
  narrative: ptNarrative,
  locale: 'pt-BR',
})
const en = runSeraVNextEngineV0({
  ...common,
  inputId: 'LANG-EN',
  requestId: 'LANG-EN',
  narrative: enNarrative,
  locale: 'en',
})

assert.equal(localizeActor('maintenance team (collective)', 'pt-BR'), 'equipe de manutenção (coletivo)')
assert.equal(localizeActor('maintenance team (collective)', 'en'), 'maintenance team (collective)')

for (const path of pt.canonicalTraversal.paths) {
  for (const answer of path.answers) {
    assert.doesNotMatch(answer.rationale ?? '', /Root node starts|Evidence supports|No pre-escape|Traversal stops|Correctness of action/i)
  }
}
for (const q of pt.evidenceSufficiency.questions) {
  assert.doesNotMatch(q.question, /What |Who |Was |Which |At the |During the /i)
  assert.doesNotMatch(q.whyNeeded, /available evidence does not allow/i)
}
for (const text of [...pt.uncertainties, ...pt.limitations]) {
  assert.doesNotMatch(text, /Canonical traversal|No candidate-only|Direct actor remains|Post-escape evidence/i)
}

for (const path of en.canonicalTraversal.paths) {
  for (const answer of path.answers) {
    assert.doesNotMatch(answer.question, /O que |Qual |A avaliação|A ação |Como o operador/i)
  }
}
for (const q of en.evidenceSufficiency.questions) {
  assert.doesNotMatch(q.question, /Qual |Quem |Na inspeção|A ação |Havia /i)
  assert.doesNotMatch(q.whyNeeded, /A evidência disponível/i)
}
for (const text of [...en.uncertainties, ...en.limitations]) {
  assert.doesNotMatch(text, /A travessia canônica|Nenhuma pré-condição|O ator direto|Evidências posteriores/i)
}

assert.match(pt.escapePoint.statement ?? '', /^Quando /)
assert.match(en.escapePoint.statement ?? '', /^When /)

console.log('PASS analysis language consistency')
