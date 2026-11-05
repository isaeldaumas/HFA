import assert from 'node:assert/strict'
import { createDevelopmentCalibrationReport, evaluateDevelopmentCase, isLiteralNarrativeEvidence, inspectDevelopmentSupportingEvidence } from './dev-calibration-workbench'
import { holdoutCases } from './engine-validation-v03-naturalistic/cases'
import { escapeDevelopmentHtml, renderDevelopmentCalibrationHtml } from './dev-calibration-html'

const report = createDevelopmentCalibrationReport()
assert.equal(report.schemaVersion, 'HFA_DEV_CALIBRATION_READONLY_V1')
assert.equal(report.metrics.total, 24)
assert.equal(report.scientificUse, false)
assert.equal(report.sealedHoldoutExecuted, false)
assert.equal(report.holdoutEligible, false)
assert.equal(report.scientificValidation, 'NOT_RUN')
assert.equal(report.methodologicalGate, 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY')
assert.equal(report.productionAuthorization, 'NOT_AUTHORIZED')
assert.equal(report.automatedDecisionAuthorized, false)
assert.equal(report.metrics.criticalGuardrailsPass, true)
assert.equal(report.metrics.unscoredAdditionalCodeCases, 1)
assert.equal(Object.values(report.metrics.evidenceSufficiencyCounts).reduce((sum, n) => sum + n, 0), 24)
assert.equal(Object.values(report.metrics.escapePointStatusCounts).reduce((sum, n) => sum + n, 0), 24)
assert.equal(report.metrics.blockingReasonCounts.OBJECTIVE_EVIDENCE_INSUFFICIENT, 22)
assert.equal(report.metrics.afterAnchorSupportingItems, 6)
assert.equal(report.metrics.casesWithAfterAnchorSupportingItems, 4)
assert.equal(report.metrics.explicitlyPostEscapeSupportingItems, 0)
assert.equal(report.metrics.postAnchorAblationsRun, 9)
assert.equal(report.metrics.postAnchorAblationChangedCases, 1)
assert.equal(report.reviewQueue.length, 24)
assert.equal(report.reviewQueuePolicy.rankingIsNotErrorProbability, true)
assert.equal(report.reviewQueuePolicy.noAutomaticChanges, true)
assert.deepEqual(report.reviewQueue[0].caseId, 'V03-CAL-07')
assert.equal(report.reviewQueue[0].tier, 'P1_METHODOLOGICAL_ADJUDICATION')
assert.ok(report.reviewQueue[0].reasons.includes('POST_ANCHOR_CONTEXT_SENSITIVITY'))
assert.ok(report.reviewQueue[0].reasons.includes('ADDITIONAL_CODE_WITHOUT_AXIS_ORACLE'))
assert.equal(Object.values(report.metrics.reviewQueueTierCounts).reduce((a,b) => a+b,0), 24)
assert.equal(report.postAnchorAblationScreen.notIndependentValidation, true)
assert.deepEqual(report.postAnchorAblationScreen.casesWithChangedOutput.map(c => c.caseId), ['V03-CAL-07'])
const ablation = report.cases.find(c => c.caseId === 'V03-CAL-07')?.postAnchorAblation
assert.ok(ablation)
assert.deepEqual(ablation.changedAxes, ['objective'])
assert.equal(ablation.fullCodes.objective, 'O-A')
assert.equal(ablation.prefixCodes.objective, null)
assert.equal(ablation.fullCodes.action, 'A-F')
assert.equal(ablation.prefixCodes.action, 'A-F')
assert.equal(ablation.originalAnchorStatus, 'CANDIDATE')
assert.equal(ablation.prefixAnchorStatus, 'CANDIDATE')
assert.equal(report.temporalProvenanceScreen.countsDoNotImplyError, true)
assert.ok(report.pendingTemporalReview.some(c => c.caseId === 'V03-CAL-07'))
const evidenceProbe = inspectDevelopmentSupportingEvidence({
  supportingEvidence: ['Before the anchor.', 'Later evidence.'],
  narrative: 'Before the anchor. Later evidence.',
  anchorSentenceIndex: 0,
  sourceEvidence: [
    { statement: 'Before the anchor.', sourceSentenceIndex: 0, temporalRelation: 'AT_ESCAPE', evidenceId: 'A' },
    { statement: 'Later evidence.', sourceSentenceIndex: 1, temporalRelation: 'POST_ESCAPE', evidenceId: 'B' },
  ] as Parameters<typeof inspectDevelopmentSupportingEvidence>[0]['sourceEvidence'],
})
assert.equal(evidenceProbe[0].laterInTextThanAnchor, false)
assert.equal(evidenceProbe[1].laterInTextThanAnchor, true)
assert.equal(evidenceProbe[1].explicitlyPostEscape, true)
assert.ok(report.metrics.casesWithClarificationQuestions > 0)
assert.ok(report.metrics.nonLiteralSupportingEvidenceCount > 0)
assert.equal(report.textProvenanceScreen.countsDoNotImplyError, true)
assert.equal(isLiteralNarrativeEvidence('O piloto fez a chamada.\nDepois aguardou.', '  o piloto fez a chamada. '), true)
assert.equal(isLiteralNarrativeEvidence('O piloto fez a chamada.', 'A tripulação decidiu arremeter.'), false)
const cal07 = report.cases.find(c => c.caseId === 'V03-CAL-07')
assert.ok(cal07)
assert.ok(cal07.actual.objective.nonLiteralSupportingEvidenceExcerpts.some(q => q.includes('intended to execute a go-around')))
assert.deepEqual(report.pendingHumanReview, [{
  caseId: 'V03-CAL-07',
  extraUnscoredCodes: [{ axis: 'objective', code: 'O-A' }],
  reason: 'V03_EXPECTED_ONLY_ONE_AXIS; no independent per-axis reference',
}])
for (const entry of report.cases) {
  assert.ok(!entry.caseId.startsWith('V03-HLD-'), 'holdout leaked')
  assert.match(entry.narrativeSha256, /^[a-f0-9]{64}$/)
  assert.equal(Object.keys(entry.actual).length, 3)
  for (const axis of ['perception', 'objective', 'action'] as const) {
    assert.ok(entry.actual[axis].status)
    assert.ok(Array.isArray(entry.blockingReasons))
    assert.ok(Array.isArray(entry.clarificationQuestions))
    assert.ok(entry.actual[axis].evidenceCount >= 0)
    assert.ok(entry.actual[axis].nonLiteralSupportingEvidenceCount >= 0)
    assert.ok(entry.actual[axis].nonLiteralSupportingEvidenceExcerpts.length <= 4)
    assert.ok(entry.actual[axis].supportingEvidenceExcerpts.length <= 4)
    assert.ok(entry.actual[axis].counterEvidenceExcerpts.length <= 4)
    assert.ok(Array.isArray(entry.actual[axis].canonicalPath))
  }
}
assert.throws(() => evaluateDevelopmentCase(holdoutCases[0]), /SEALED_OR_UNAPPROVED_COHORT_FORBIDDEN/)
console.log('DEV_CALIBRATION_WORKBENCH_CONTRACT_PASS', JSON.stringify(report.metrics))
console.log('ENGINE_NATURALISTIC_VALIDATION_NOT_READY')

const html = renderDevelopmentCalibrationHtml(report)
assert.match(html, /<!doctype html>/)
assert.match(html, /NÃO É validação científica independente/)
assert.match(html, /V03-CAL-07/)
assert.match(html, /O-A/)
assert.match(html, /Verificar origem textual/)
assert.match(html, /Informações que faltam para o motor/)
assert.match(html, /SENSÍVEL AO TEXTO POSTERIOR/)
assert.match(html, /Teste exploratório de retirada do texto posterior/)
assert.match(html, /Fila de revisão técnica/)
assert.match(html, /href="#case-V03-CAL-07"/)
assert.match(html, /id="case-V03-CAL-07"/)
assert.match(html, /REVISAR TEMPORALIDADE/)
assert.match(html, /ordem das frases no documento NÃO equivale/)
assert.match(html, /OBJECTIVE_EVIDENCE_INSUFFICIENT/)
assert.match(html, /<details class="case"/)
assert.match(html, /default-src &#39;none&#39;/)
assert.equal(html.includes('<script'), false)
assert.equal(html.includes('<iframe'), false)
assert.equal(html.includes('http://') || html.includes('https://'), false)
assert.equal(escapeDevelopmentHtml('<script>alert("x")</script>&'), '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;&amp;')
assert.throws(() => renderDevelopmentCalibrationHtml({ ...report, scientificUse: true }), /SCIENTIFIC_PROMOTION/)
console.log('DEV_CALIBRATION_HTML_OFFLINE_PASS')
