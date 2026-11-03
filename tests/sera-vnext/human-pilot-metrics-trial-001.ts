import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const rootDir = path.resolve(__dirname, '..', '..')
const scriptPath = path.join(rootDir, 'scripts', 'sera-vnext', 'compute-human-pilot-metrics.ts')
const templatePath = path.join(
  rootDir,
  'docs',
  'sera-vnext',
  'human-pilot-preparation',
  'SERA_VNEXT_HUMAN_REVIEWER_RESULT_TEMPLATE.csv',
)
const outputPath = path.join(rootDir, 'tmp', 'sera-vnext-human-pilot-preparation', 'metrics-trial-output.md')

fs.mkdirSync(path.dirname(outputPath), { recursive: true })

const stdout = execFileSync('npx', ['tsx', scriptPath, '--input', templatePath, '--output', outputPath], {
  cwd: rootDir,
  encoding: 'utf8',
})

assert.equal(stdout.trim(), 'NO_REAL_HUMAN_RESULTS_YET')
assert.ok(fs.existsSync(outputPath), 'metrics output file must exist')

const content = fs.readFileSync(outputPath, 'utf8')
assert.ok(content.includes('NO_REAL_HUMAN_RESULTS_YET'))
assert.ok(content.includes('candidate_only_clear_rate'))
assert.ok(content.includes('does not infer, simulate, or declare pilot pass status'))

// Regression: a CSV row marked NO or missing a reviewer decision is not a
// submitted human result. These fixtures are synthetic tests, not field data.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hfa-human-pilot-metrics-trial-'))
try {
  const headers = fs.readFileSync(templatePath, 'utf8').trim().split(',').slice(0, 22)
  const fixturePath = path.join(tmp, 'synthetic-input.csv')
  const generatedPath = path.join(tmp, 'generated.md')
  const run = (submitted: string, decision: string) => {
    const values: Record<string, string> = {
      case_id: 'TEST-NON-REAL-001',
      reviewer_id: 'REVIEWER-FIXTURE',
      review_submitted: submitted,
      reviewer_decision: decision,
    }
    const record = headers.map((header) => values[header] ?? '').join(',')
    fs.writeFileSync(fixturePath, headers.join(',') + '\n' + record + '\n')
    return execFileSync('npx', ['tsx', scriptPath, '--input', fixturePath, '--output', generatedPath], {
      cwd: rootDir,
      encoding: 'utf8',
    }).trim()
  }

  assert.equal(run('NO', 'ACCEPT_AS_WORKING_HYPOTHESIS'), 'NO_REAL_HUMAN_RESULTS_YET')
  assert.equal(run('PENDING', 'ACCEPT_AS_WORKING_HYPOTHESIS'), 'NO_REAL_HUMAN_RESULTS_YET')
  assert.equal(run('YES', ''), 'NO_REAL_HUMAN_RESULTS_YET')
  assert.equal(run('YES', 'ACCEPT_AS_WORKING_HYPOTHESIS'), 'HUMAN_REVIEWER_PILOT_METRICS_GENERATED')
  assert.match(fs.readFileSync(generatedPath, 'utf8'), /does not establish scientific validation/)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log('HUMAN_PILOT_METRICS_TRIAL_OK')

