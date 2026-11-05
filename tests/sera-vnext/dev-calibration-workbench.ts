/**
 * Offline development diagnostics: NOT independent human/scientific validation.
 * V03 holdout and V04 sealed cohorts are never executed.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'
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
  const guardrails = {
    finalOutputsBlocked: finalBlocked(o),
    forbiddenOEAbsent: codes.objective !== 'O-E',
    postEscapeEvidenceNotUsed: postEscapeNotReused(o),
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
  }])) as Record<Axis, {
    code: string | null; status: string; confidence: string;
    evidenceCount: number; counterEvidenceCount: number; excludedPostEscapeCount: number;
  }>
  return {
    caseId: c.caseId, cohort: c.group, locale: c.locale,
    narrativeSha256: createHash('sha256').update(c.narrative, 'utf8').digest('hex'),
    expected: c.expected, actual, extraUnscoredCodes,
    outcome: expectedMatches(c.expected, codes) && Object.values(guardrails).every(Boolean) ? 'MATCH' : 'MISMATCH',
    guardrails,
    escapePointStatus: o.escapePoint.status,
    evidenceSufficiency: o.evidenceSufficiency.status,
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
      criticalGuardrailsPass: cases.every(c => Object.values(c.guardrails).every(Boolean)),
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
  const outIdx = args.indexOf('--out')
  if (args.length && (outIdx < 0 || args.length !== 2 || !args[outIdx + 1])) {
    throw new Error('Use: tsx tests/sera-vnext/dev-calibration-workbench.ts [--out /tmp/report.json]')
  }
  const report = createDevelopmentCalibrationReport()
  if (outIdx !== -1) {
    const out = path.resolve(args[outIdx + 1])
    const repo = path.resolve(__dirname, '../..') + path.sep
    if (out.startsWith(repo) || !out.endsWith('.json')) throw new Error('REPORT_OUTPUT_MUST_BE_JSON_OUTSIDE_REPOSITORY')
    mkdirSync(path.dirname(out), { recursive: true })
    writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
  }
  console.log(JSON.stringify({
    schemaVersion: report.schemaVersion, total: report.metrics.total,
    matching: report.metrics.match, mismatches: report.metrics.mismatch,
    additionalUnscoredCodeCases: report.metrics.unscoredAdditionalCodeCases,
    additionalUnscoredCodes: report.metrics.unscoredAdditionalCodes,
    guardrailsPass: report.metrics.criticalGuardrailsPass,
    scientificValidation: report.scientificValidation,
    methodologicalGate: report.methodologicalGate,
    output: outIdx !== -1 ? path.resolve(args[outIdx + 1]) : 'NONE',
  }, null, 2))
  if (report.metrics.mismatch || !report.metrics.criticalGuardrailsPass) process.exitCode = 1
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCommand()
