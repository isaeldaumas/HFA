import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const rootDir = path.resolve(__dirname, '..', '..')
const scriptPath = path.join(rootDir, 'scripts', 'sera-vnext', 'compute-human-pilot-shared-case-agreement.ts')
const templatePath = path.join(
  rootDir,
  'docs',
  'sera-vnext',
  'human-pilot-preparation',
  'SERA_VNEXT_HUMAN_REVIEWER_RESULT_TEMPLATE.csv',
)
const sharedPlanPath = path.join(
  rootDir,
  'docs',
  'sera-vnext',
  'human-pilot-preparation',
  'SERA_VNEXT_HUMAN_PILOT_SHARED_CASES_PLAN.csv',
)
const outputPath = path.join(rootDir, 'tmp', 'sera-vnext-human-pilot-preparation', 'shared-agreement-trial-output.md')

fs.mkdirSync(path.dirname(outputPath), { recursive: true })

const stdout = execFileSync(
  'npx',
  ['tsx', scriptPath, '--input', templatePath, '--shared-plan', sharedPlanPath, '--output', outputPath],
  { cwd: rootDir, encoding: 'utf8' },
)

assert.equal(stdout.trim(), 'NO_REAL_SHARED_CASE_RESULTS_YET')
assert.ok(fs.existsSync(outputPath), 'shared agreement output file must exist')

const content = fs.readFileSync(outputPath, 'utf8')
assert.ok(content.includes('NO_REAL_SHARED_CASE_RESULTS_YET'))
assert.ok(content.includes('No kappa or agreement claim is calculated'))

// A single completed review cannot be represented as inter-reviewer agreement.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hfa-human-pilot-shared-trial-'))
try {
  const headers = fs.readFileSync(templatePath, 'utf8').trim().split(',').slice(0, 22)
  const fixturePath = path.join(tmp, 'synthetic-input.csv')
  const generatedPath = path.join(tmp, 'generated.md')
  const row = (reviewer: string, submitted: string, decision: string) => {
    const values: Record<string, string> = {
      case_id: 'HP-002',
      reviewer_id: reviewer,
      review_submitted: submitted,
      reviewer_decision: decision,
    }
    return headers.map((header) => values[header] ?? '').join(',')
  }
  const run = (rows: string[]) => {
    fs.writeFileSync(fixturePath, headers.join(',') + '\n' + rows.join('\n') + '\n')
    return execFileSync('npx', [
      'tsx', scriptPath, '--input', fixturePath,
      '--shared-plan', sharedPlanPath, '--output', generatedPath,
    ], { cwd: rootDir, encoding: 'utf8' }).trim()
  }

  const reviewerA = row('REVIEWER-02', 'YES', 'REQUIRES_MORE_EVIDENCE')
  const reviewerB = row('REVIEWER-03', 'YES', 'REQUIRES_MORE_EVIDENCE')
  const incompleteB = row('REVIEWER-03', 'NO', 'REQUIRES_MORE_EVIDENCE')
  assert.equal(run([reviewerA]), 'NO_REAL_SHARED_CASE_RESULTS_YET')
  assert.equal(run([reviewerA, incompleteB]), 'NO_REAL_SHARED_CASE_RESULTS_YET')
  assert.equal(run([reviewerA, reviewerB]), 'HUMAN_REVIEWER_SHARED_CASE_AGREEMENT_GENERATED')
  assert.match(fs.readFileSync(generatedPath, 'utf8'), /not independently authenticate reviewers/)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('HUMAN_PILOT_SHARED_AGREEMENT_TRIAL_OK')

