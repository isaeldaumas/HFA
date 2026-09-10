import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT_DIR = path.resolve(__dirname, '..', '..')
const COHORT_DIR = path.join(ROOT_DIR, 'docs', 'sera-vnext', 'expanded-cohort')
const TRIAL_ID = 'expanded-cohort-metrics-trial-001'
const MIN_REVIEWERS_FOR_PASS = 3

type CaseResultRow = {
  case_id: string
  reviewer_id: string
  analysis_id_sanitized: string
  created_ok: string
  detail_opened: string
  review_submitted: string
  reanalyzed: string
  exported: string
  archived_restored: string
  escape_point_useful: string
  poa_useful: string
  preconditions_useful: string
  uncertainty_clear: string
  warnings_clear: string
  reviewer_decision: string
  review_time_minutes: string
  issues: string
}

function parseBool(val: string): boolean {
  return val.toLowerCase() === 'true'
}

function parseCsv(filePath: string): CaseResultRow[] {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split('\n').filter((l) => l.trim())
  const [header, ...rows] = lines
  const keys = header.split(',')
  return rows.map((row) => {
    const values = row.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? []
    const obj: Record<string, string> = {}
    keys.forEach((k, i) => {
      obj[k.trim()] = (values[i] ?? '').replace(/^"|"$/g, '').trim()
    })
    return obj as CaseResultRow
  })
}

function parseCaseMatrix(filePath: string): Array<Record<string, string>> {
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split('\n').filter((l) => l.trim())
  const [header, ...rows] = lines
  const keys = header.split(',')
  return rows.map((row) => {
    const values = row.split(',')
    const obj: Record<string, string> = {}
    keys.forEach((k, i) => {
      obj[k.trim()] = (values[i] ?? '').trim()
    })
    return obj
  })
}

function main(): void {
  const caseResultsPath = path.join(COHORT_DIR, 'SERA_VNEXT_EXPANDED_COHORT_CASE_RESULTS.csv')
  const caseMatrixPath = path.join(COHORT_DIR, 'SERA_VNEXT_EXPANDED_COHORT_CASE_MATRIX.csv')
  const metricsPath = path.join(COHORT_DIR, 'SERA_VNEXT_EXPANDED_COHORT_METRICS.md')

  assert.ok(fs.existsSync(caseResultsPath), `Case results not found: ${caseResultsPath}`)
  assert.ok(fs.existsSync(caseMatrixPath), `Case matrix not found: ${caseMatrixPath}`)
  assert.ok(fs.existsSync(metricsPath), `Metrics doc not found: ${metricsPath}`)

  const rows = parseCsv(caseResultsPath)
  assert.ok(rows.length >= 20, `Expected >= 20 cases, got ${rows.length}`)

  const matrix = parseCaseMatrix(caseMatrixPath)
  assert.ok(matrix.length >= 20, `Case matrix must have >= 20 rows, got ${matrix.length}`)

  const total = rows.length
  const reviewers = new Set(rows.map((r) => r.reviewer_id)).size
  const created = rows.filter((r) => parseBool(r.created_ok)).length
  const reviewed = rows.filter((r) => parseBool(r.review_submitted)).length
  const escapeUseful = rows.filter((r) => parseBool(r.escape_point_useful)).length
  const poaUseful = rows.filter((r) => parseBool(r.poa_useful)).length
  const precondUseful = rows.filter((r) => parseBool(r.preconditions_useful)).length
  const uncertainClear = rows.filter((r) => parseBool(r.uncertainty_clear)).length
  const warningsClear = rows.filter((r) => parseBool(r.warnings_clear)).length

  const escapeRate = escapeUseful / total
  const poaRate = poaUseful / total
  const precondRate = precondUseful / total
  const uncertainRate = uncertainClear / total
  const warningsRate = warningsClear / total

  assert.equal(created, total, 'All cases must have created_ok=true')
  assert.equal(reviewed, total, 'All cases must have review_submitted=true')
  assert.ok(uncertainRate >= 0.90, `uncertainty_clear_rate ${uncertainRate.toFixed(3)} < 0.90`)
  assert.ok(warningsRate >= 0.90, `warnings_clear_rate ${warningsRate.toFixed(3)} < 0.90`)

  const decisions = rows.map((r) => r.reviewer_decision)
  const knownDecisions = new Set([
    'ACCEPT_AS_WORKING_HYPOTHESIS',
    'REJECT_WORKING_HYPOTHESIS',
    'REQUIRES_MORE_EVIDENCE',
    'RETURN_FOR_REANALYSIS',
  ])
  for (const d of decisions) {
    assert.ok(knownDecisions.has(d), `Unknown decision: ${d}`)
  }

  const metricsContent = fs.readFileSync(metricsPath, 'utf8')
  assert.ok(metricsContent.includes('escape_point_useful_rate'), 'Metrics doc must include escape_point_useful_rate')
  assert.ok(metricsContent.includes('poa_useful_rate'), 'Metrics doc must include poa_useful_rate')
  assert.ok(metricsContent.includes('BLOCKED_SINGLE_REVIEWER'), 'Metrics doc must document single reviewer limitation')

  const cohortBlockedByReviewerCount = reviewers < MIN_REVIEWERS_FOR_PASS
  if (!cohortBlockedByReviewerCount) {
    assert.ok(escapeRate >= 0.85, `escape_point_useful_rate ${escapeRate.toFixed(3)} < 0.85`)
    assert.ok(poaRate >= 0.70, `poa_useful_rate ${poaRate.toFixed(3)} < 0.70`)
    assert.ok(precondRate >= 0.70, `preconditions_useful_rate ${precondRate.toFixed(3)} < 0.70`)
  }

  console.log(JSON.stringify({
    trialId: TRIAL_ID,
    total_cases: total,
    total_reviewers: reviewers,
    escape_point_useful_rate: escapeRate.toFixed(3),
    poa_useful_rate: poaRate.toFixed(3),
    preconditions_useful_rate: precondRate.toFixed(3),
    uncertainty_clear_rate: uncertainRate.toFixed(3),
    warnings_clear_rate: warningsRate.toFixed(3),
    thresholds: cohortBlockedByReviewerCount ? 'NOT_APPLICABLE_SINGLE_REVIEWER_BLOCK' : 'ALL_PASS',
    cohortStatus: cohortBlockedByReviewerCount
      ? 'EXPANDED_COHORT_BLOCKED_SINGLE_REVIEWER'
      : 'EXPANDED_COHORT_PASS',
    matrix_rows: matrix.length,
  }, null, 2))
  console.log('EXPANDED_COHORT_METRICS_OK')
}

main()
