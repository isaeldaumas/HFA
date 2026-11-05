/**
 * Offline development diagnostics: NOT independent human/scientific validation.
 * V03 holdout and V04 sealed cohorts are never executed.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { renderDevelopmentCalibrationHtml } from './dev-calibration-html'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
import type { SeraEvidenceItem } from '../../frontend/src/lib/sera-vnext/evidence/types'
import { calibrationCases, validationCases, type EngineV03ValidationCase, type EngineV03Expected } from './engine-validation-v03-naturalistic/cases'

type Axis = 'perception' | 'objective' | 'action'
const AXES: readonly Axis[] = ['perception', 'objective', 'action']
type EngineResult = ReturnType<typeof runSeraVNextEngineV0>

function expectedMatches(expected: EngineV03Expected, codes: Record<Axis, string | null>): boolean {
  if (expected.kind === 'abstention') return AXES.every(axis => codes[axis] === null)
  if (expected.kind === 'notCode') return codes[expected.axis] !== expected.code
  return codes[expected.axis] === expected.code
}

function finalBlocked(o: EngineResult): boolean {
  return o.selectedCode === null && o.releasedCode === null &&
    o.finalConclusion === null && o.classifiedOutput === false &&
    o.readyPromotion === false && o.downstreamAllowed === false
}

function postEscapeNotReused(o: EngineResult): boolean {
  return AXES.every(axis => o.escapePoint.excludedPostEscapeEvidence.every(quote =>
    !o.axes[axis].supportingEvidence.includes(quote)))
}

/**
 * Text-only provenance screening. Absence of a literal substring is NOT
 * proof of incorrect evidence: it can be a lawful paraphrase or engine-derived
 * statement. The researcher must distinguish these meanings manually.
 */
export function isLiteralNarrativeEvidence(narrative: string, evidence: string): boolean {
  const normalize = (value: string) =>
    value.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('pt-BR')
  const quote = normalize(evidence)
  return quote.length > 0 && normalize(narrative).includes(quote)
}

/**
 * Provenance inspection is intentionally weaker than an evidence verdict.
 * Sentence order is document order, NOT necessarily occurrence chronology.
 * When explicit POST_ESCAPE metadata exists, it is a harder guardrail;
 * UNKNOWN metadata after the anchor is a review lead, not proof of leakage.
 */
export function inspectDevelopmentSupportingEvidence(args: {
  supportingEvidence: string[]
  sourceEvidence: SeraEvidenceItem[]
  narrative: string
  anchorSentenceIndex: number | null
}) {
  return args.supportingEvidence.map(quote => {
    const matching = args.sourceEvidence.filter(item => item.statement === quote)
    const postAnchor = args.anchorSentenceIndex === null ? [] : matching
      .filter(item => item.sourceSentenceIndex > args.anchorSentenceIndex!)
    return {
      quote,
      literallyInNarrative: isLiteralNarrativeEvidence(args.narrative, quote),
      exactEvidenceRecordMatch: matching.length > 0,
      sources: matching.map(item => ({
        evidenceId: item.evidenceId,
        sourceSentenceIndex: item.sourceSentenceIndex,
        temporalRelation: item.temporalRelation,
        collectionSource: item.collectionSource ?? 'UNSPECIFIED_RAW_EXTRACTION',
        sourceSection: item.sourceSection,
        assertionStatus: item.assertionStatus,
      })),
      laterInTextThanAnchor: postAnchor.length > 0,
      explicitlyPostEscape: matching.some(item => item.temporalRelation === 'POST_ESCAPE'),
    }
  })
}

export function evaluateDevelopmentCase(c: EngineV03ValidationCase) {
  assert.ok(c.group === 'calibration' || c.group === 'validation', 'SEALED_OR_UNAPPROVED_COHORT_FORBIDDEN')
  assert.equal(c.sourceType, 'synthetic', 'REAL_CASES_REQUIRE_SEPARATE_HUMAN_PROTOCOL')
  assert.match(c.caseId, /^V03-(CAL|VAL)-[0-9]{2}$/, 'UNAUTHORIZED_CASE')
  const o = runSeraVNextEngineV0({
    inputId: 'DEV-CAL-' + c.caseId,
    narrative: c.narrative,
    locale: c.locale,
    sourceType: 'synthetic',
    sourceReference: 'DEVELOPMENT_EXPOSED_V03_NOT_SCIENTIFIC',
    requestId: 'dev-cal-' + c.caseId,
    mode: 'CANDIDATE_ONLY',
    options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  })
  const codes = Object.fromEntries(AXES.map(axis => [axis, o.axes[axis].proposedCode])) as Record<Axis, string | null>
  const escapeAnchor = o.escapePoint.poaAnchorCandidate
    ?? o.escapePoint.firstDepartureCandidate
    ?? o.escapePoint.earliestCandidate
  const anchorSentenceIndex = escapeAnchor
    ? o.factualExtraction.timeline.find(item =>
        item.statement === escapeAnchor ||
        item.statement.includes(escapeAnchor) ||
        escapeAnchor.includes(item.statement))?.sourceSentenceIndex ?? null
    : null
  const fullCodes = Object.fromEntries(AXES.map(axis => [axis, o.axes[axis].proposedCode])) as Record<Axis, string | null>
  // A documented sensitivity probe, not a causal/methodological verdict.
  // Trim ONLY the already exposed synthetic narrative after the document-order
  // position of the first-departure landmark. Do not access a sealed cohort.
  let postAnchorAblation: null | {
    method: 'TRUNCATE_AFTER_ANCHOR_BY_TEXT_ORDER'
    fullCodes: Record<Axis, string | null>
    prefixCodes: Record<Axis, string | null>
    changedAxes: Axis[]
    originalAnchorStatus: string
    prefixAnchorStatus: string
    prefixNarrativeSha256: string
    truncatedSentenceCount: number
    interpretation: string
  } = null
  if (anchorSentenceIndex !== null && o.factualExtraction.timeline.some(item =>
    item.sourceSentenceIndex > anchorSentenceIndex)) {
    const prefixStatements = o.factualExtraction.timeline
      .filter(item => item.sourceSentenceIndex <= anchorSentenceIndex)
      .map(item => item.statement)
    const prefixNarrative = prefixStatements.join(' ')
    const shortOutput = runSeraVNextEngineV0({
      inputId: 'DEV-CAL-ABLATE-' + c.caseId,
      narrative: prefixNarrative,
      locale: c.locale,
      sourceType: 'synthetic',
      sourceReference: 'DEVELOPMENT_EXPOSED_ABLATION_NOT_SCIENTIFIC',
      requestId: 'dev-cal-ablate-' + c.caseId,
      mode: 'CANDIDATE_ONLY',
      options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
    })
    // Do not let this tool turn a counterfactual run into a released conclusion.
    assert.ok(finalBlocked(shortOutput) && shortOutput.humanReviewRequired === true,
      'ABLATION_OUTPUT_RELEASE_BLOCK_BROKEN')
    const prefixCodes = Object.fromEntries(AXES.map(axis =>
      [axis, shortOutput.axes[axis].proposedCode])) as Record<Axis, string | null>
    postAnchorAblation = {
      method: 'TRUNCATE_AFTER_ANCHOR_BY_TEXT_ORDER',
      fullCodes,
      prefixCodes,
      changedAxes: AXES.filter(axis => fullCodes[axis] !== prefixCodes[axis]),
      originalAnchorStatus: o.escapePoint.status,
      prefixAnchorStatus: shortOutput.escapePoint.status,
      prefixNarrativeSha256: createHash('sha256').update(prefixNarrative, 'utf8').digest('hex'),
      truncatedSentenceCount: o.factualExtraction.timeline
        .filter(item => item.sourceSentenceIndex > anchorSentenceIndex).length,
      interpretation: 'A change after removal of later narrative sentences indicates context sensitivity, NOT proof of invalid evidence or wrong code.',
    }
  }
  const sourceAudit = Object.fromEntries(AXES.map(axis => [axis,
    inspectDevelopmentSupportingEvidence({
      supportingEvidence: o.axes[axis].supportingEvidence,
      sourceEvidence: o.factualExtraction.evidence,
      narrative: c.narrative,
      anchorSentenceIndex,
    }),
  ])) as Record<Axis, ReturnType<typeof inspectDevelopmentSupportingEvidence>>
  const guardrails = {
    finalOutputsBlocked: finalBlocked(o),
    forbiddenOEAbsent: codes.objective !== 'O-E',
    postEscapeEvidenceNotUsed: postEscapeNotReused(o),
    explicitlyPostEscapeEvidenceNotUsed: AXES.every(axis =>
      sourceAudit[axis].every(item => !item.explicitlyPostEscape)),
    humanReviewRequired: o.humanReviewRequired === true,
  }
  // V03 code expectations only score the named axis. Other proposed codes
  // are NOT independently adjudicated by that oracle; never hide them behind
  // a passing case-level match.
  const extraUnscoredCodes = c.expected.kind === 'code'
    ? AXES.filter(axis => axis !== c.expected.axis && codes[axis] !== null)
        .map(axis => ({ axis, code: codes[axis] }))
    : []
  const actual = Object.fromEntries(AXES.map(axis => [axis, {
    code: codes[axis],
    status: o.axes[axis].status,
    confidence: o.axes[axis].confidence,
    evidenceCount: o.axes[axis].supportingEvidence.length,
    counterEvidenceCount: o.axes[axis].counterEvidence.length,
    excludedPostEscapeCount: o.axes[axis].excludedPostEscapeEvidence.length,
    nonLiteralSupportingEvidenceCount: o.axes[axis].supportingEvidence
      .filter(quote => !isLiteralNarrativeEvidence(c.narrative, quote)).length,
    nonLiteralSupportingEvidenceExcerpts: o.axes[axis].supportingEvidence
      .filter(quote => !isLiteralNarrativeEvidence(c.narrative, quote)).slice(0, 4),
    // Synthetic-only excerpts: reviewer can see why a candidate was proposed,
    // without logging whole case narratives or changing a source of truth.
    supportingEvidenceExcerpts: o.axes[axis].supportingEvidence.slice(0, 4),
    counterEvidenceExcerpts: o.axes[axis].counterEvidence.slice(0, 4),
    canonicalPath: o.axes[axis].canonicalPath,
  }])) as Record<Axis, {
    code: string | null; status: string; confidence: string;
    evidenceCount: number; counterEvidenceCount: number; excludedPostEscapeCount: number;
    nonLiteralSupportingEvidenceCount: number; nonLiteralSupportingEvidenceExcerpts: string[];
    supportingEvidenceExcerpts: string[]; counterEvidenceExcerpts: string[];
    canonicalPath: string[];
  }>
  return {
    caseId: c.caseId, cohort: c.group, locale: c.locale,
    narrativeSha256: createHash('sha256').update(c.narrative, 'utf8').digest('hex'),
    expected: c.expected, actual, extraUnscoredCodes,
    anchorSentenceIndex,
    sourceAudit,
    postAnchorAblation,
    outcome: expectedMatches(c.expected, codes) && Object.values(guardrails).every(Boolean) ? 'MATCH' : 'MISMATCH',
    guardrails,
    escapePointStatus: o.escapePoint.status,
    evidenceSufficiency: o.evidenceSufficiency.status,
    blockingReasons: [...o.evidenceSufficiency.blockingReasons],
    clarificationQuestions: o.evidenceSufficiency.questions.map(q => ({
      id: q.id,
      stage: q.stage,
      question: q.question,
      linkedNodeId: q.linkedNodeId,
      requestedEvidence: [...q.requestedEvidence],
      blocking: q.blocking,
    })),
  }
}

export function createDevelopmentCalibrationReport() {
  // V03's sealed holdout has been development-exposed historically. Even so,
  // this workbench excludes it and never reads V04_SEALED_001 sources.
  const cases = [...calibrationCases, ...validationCases].map(evaluateDevelopmentCase)
  assert.equal(cases.length, 24)
  assert.equal(new Set(cases.map(c => c.caseId)).size, cases.length)
  const mismatch = cases.filter(c => c.outcome === 'MISMATCH')
  const unscoredCodeCases = cases.filter(c => c.extraUnscoredCodes.length > 0)
  const nonLiteralCases = cases.filter(c =>
    AXES.some(axis => c.actual[axis].nonLiteralSupportingEvidenceCount > 0))
  const laterSourceCases = cases.filter(c =>
    AXES.some(axis => c.sourceAudit[axis].some(item => item.laterInTextThanAnchor)))
  const afterAnchorSupportingItems = cases.reduce((sum, c) =>
    sum + AXES.reduce((byAxis, axis) => byAxis +
      c.sourceAudit[axis].filter(item => item.laterInTextThanAnchor).length, 0), 0)
  const explicitlyPostEscapeSupportingItems = cases.reduce((sum, c) =>
    sum + AXES.reduce((byAxis, axis) => byAxis +
      c.sourceAudit[axis].filter(item => item.explicitlyPostEscape).length, 0), 0)
  const unmatchedEvidenceRecordItems = cases.reduce((sum, c) =>
    sum + AXES.reduce((byAxis, axis) => byAxis +
      c.sourceAudit[axis].filter(item => !item.exactEvidenceRecordMatch).length, 0), 0)
  const ablationCases = cases.filter(c => c.postAnchorAblation)
  const ablationChangedCases = ablationCases.filter(c => c.postAnchorAblation!.changedAxes.length > 0)
  const countCategories = (values: string[]) => Object.fromEntries(
    [...new Set(values)].sort().map(value => [value, values.filter(v => v === value).length]))
  const blockingReasonCounts = countCategories(cases.flatMap(c => c.blockingReasons))
  const evidenceSufficiencyCounts = countCategories(cases.map(c => c.evidenceSufficiency))
  const escapePointStatusCounts = countCategories(cases.map(c => c.escapePointStatus))
  const perAxis = Object.fromEntries(AXES.map(axis => [axis, {
    proposed: cases.filter(c => c.actual[axis].code !== null).length,
    unresolvedOrNotCoded: cases.filter(c => c.actual[axis].code === null).length,
  }]))
  return {
    schemaVersion: 'HFA_DEV_CALIBRATION_READONLY_V1',
    baseCorpus: 'V03_DEVELOPMENT_EXPOSED_CAL_AND_VAL_ONLY',
    dataClass: 'SYNTHETIC_ONLY',
    execution: 'LOCAL_DETERMINISTIC_NO_NETWORK',
    scientificUse: false,
    holdoutEligible: false,
    sealedHoldoutExecuted: false,
    methodologicalGate: 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY',
    scientificValidation: 'NOT_RUN',
    productionAuthorization: 'NOT_AUTHORIZED',
    automatedDecisionAuthorized: false,
    metrics: {
      total: cases.length, match: cases.length - mismatch.length, mismatch: mismatch.length,
      perAxis,
      unscoredAdditionalCodeCases: unscoredCodeCases.length,
      unscoredAdditionalCodes: unscoredCodeCases.reduce((sum, c) => sum + c.extraUnscoredCodes.length, 0),
      nonLiteralSupportingEvidenceCount: cases.reduce((sum, c) =>
        sum + AXES.reduce((byAxis, axis) => byAxis + c.actual[axis].nonLiteralSupportingEvidenceCount, 0), 0),
      casesWithNonLiteralEvidence: nonLiteralCases.length,
      afterAnchorSupportingItems,
      casesWithAfterAnchorSupportingItems: laterSourceCases.length,
      explicitlyPostEscapeSupportingItems,
      supportingItemsWithoutExactEvidenceRecord: unmatchedEvidenceRecordItems,
      postAnchorAblationsRun: ablationCases.length,
      postAnchorAblationChangedCases: ablationChangedCases.length,
      evidenceSufficiencyCounts,
      escapePointStatusCounts,
      blockingReasonCounts,
      casesWithClarificationQuestions: cases.filter(c => c.clarificationQuestions.length > 0).length,
      criticalGuardrailsPass: cases.every(c => Object.values(c.guardrails).every(Boolean)),
    },
    textProvenanceScreen: {
      mode: 'EXACT_SUBSTRING_AFTER_WHITESPACE_AND_CASE_NORMALIZATION',
      countsDoNotImplyError: true,
      note: 'Nonliteral wording may be inferred/generated by the engine. Require source-backed human review, not automatic rejection.',
    },
    temporalProvenanceScreen: {
      mode: 'LATER_SOURCE_SENTENCE_THAN_POA_ANCHOR_WITH_EXACT_EVIDENCE_LINK',
      countsDoNotImplyError: true,
      note: 'Sentence order is not necessarily event chronology. UNKNOWN temporal metadata requires investigation; explicit POST_ESCAPE support is a hard QA failure.',
    },
    pendingTemporalReview: laterSourceCases.map(c => ({
      caseId: c.caseId,
      anchorSentenceIndex: c.anchorSentenceIndex,
      supportingAfterAnchor: AXES.flatMap(axis => c.sourceAudit[axis]
        .filter(item => item.laterInTextThanAnchor)
        .map(item => ({ axis, quote: item.quote, sources: item.sources }))),
    })),
    postAnchorAblationScreen: {
      method: 'TRUNCATE_AFTER_ANCHOR_BY_TEXT_ORDER',
      syntheticOnly: true,
      notIndependentValidation: true,
      casesWithChangedOutput: ablationChangedCases.map(c => ({
        caseId: c.caseId,
        changedAxes: c.postAnchorAblation!.changedAxes,
        fullCodes: c.postAnchorAblation!.fullCodes,
        prefixCodes: c.postAnchorAblation!.prefixCodes,
        anchorStatuses: [
          c.postAnchorAblation!.originalAnchorStatus,
          c.postAnchorAblation!.prefixAnchorStatus,
        ],
      })),
      note: 'Deleting narrative context can change a legitimate inference or anchor. Delta is a review lead, not a causal proof or an independent evaluation.',
    },
    mismatchingCaseIds: mismatch.map(c => c.caseId),
    pendingHumanReview: unscoredCodeCases.map(c => ({
      caseId: c.caseId,
      extraUnscoredCodes: c.extraUnscoredCodes,
      reason: 'V03_EXPECTED_ONLY_ONE_AXIS; no independent per-axis reference',
    })),
    cases,
    interpretation: 'Engineering calibration of exposed synthetic cases only; NOT blind independent validation.',
  }
}

function runCommand() {
  const args = process.argv.slice(2)
  const paths = new Map<string, string>()
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]
    const output = args[i + 1]
    if ((key !== '--out' && key !== '--html') || !output || paths.has(key)) {
      throw new Error('Use: tsx dev-calibration-workbench.ts [--out /tmp/report.json] [--html /tmp/report.html]')
    }
    paths.set(key, path.resolve(output))
  }
  const repo = path.resolve(__dirname, '../..') + path.sep
  for (const [key, output] of paths) {
    const ext = key === '--html' ? '.html' : '.json'
    if (output.startsWith(repo) || !output.endsWith(ext) || existsSync(output)) {
      throw new Error('REPORT_OUTPUT_NOT_SAFE_OR_ALREADY_EXISTS')
    }
  }
  const report = createDevelopmentCalibrationReport()
  for (const [key, output] of paths) {
    mkdirSync(path.dirname(output), { recursive: true })
    const contents = key === '--html'
      ? renderDevelopmentCalibrationHtml(report)
      : JSON.stringify(report, null, 2) + '\n'
    writeFileSync(output, contents, { flag: 'wx', mode: 0o600 })
  }
  console.log(JSON.stringify({
    schemaVersion: report.schemaVersion, total: report.metrics.total,
    matching: report.metrics.match, mismatches: report.metrics.mismatch,
    additionalUnscoredCodeCases: report.metrics.unscoredAdditionalCodeCases,
    additionalUnscoredCodes: report.metrics.unscoredAdditionalCodes,
    nonLiteralSupportingEvidenceCount: report.metrics.nonLiteralSupportingEvidenceCount,
    casesWithNonLiteralEvidence: report.metrics.casesWithNonLiteralEvidence,
    evidenceSufficiencyCounts: report.metrics.evidenceSufficiencyCounts,
    sourceAfterAnchorItems: report.metrics.afterAnchorSupportingItems,
    casesWithSourceAfterAnchor: report.metrics.casesWithAfterAnchorSupportingItems,
    explicitlyPostEscapeItems: report.metrics.explicitlyPostEscapeSupportingItems,
    ablationsRun: report.metrics.postAnchorAblationsRun,
    ablationsWithChangedCodes: report.metrics.postAnchorAblationChangedCases,
    guardrailsPass: report.metrics.criticalGuardrailsPass,
    scientificValidation: report.scientificValidation,
    methodologicalGate: report.methodologicalGate,
    outputs: Object.fromEntries(paths),
  }, null, 2))
  if (report.metrics.mismatch || !report.metrics.criticalGuardrailsPass) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCommand()
