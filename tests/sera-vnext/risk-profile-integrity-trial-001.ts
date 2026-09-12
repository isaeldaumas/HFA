import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { writeJsonReport } from './product-beta-real-helpers'
import { isAllowedA4R190LegacyMethodologyPath } from './protected-path-contract'

const TRIAL_ID = 'risk-profile-integrity-trial-001'

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

async function main() {
  const changed = git(['diff', '--name-only']).split('\n').filter(Boolean)
  const staged = git(['diff', '--cached', '--name-only']).split('\n').filter(Boolean)
  const combined = [...new Set([...changed, ...staged])]

  const forbiddenPrefixes = [
    'frontend/src/lib/sera/',
    'tests/sera/fixtures/',
    'tests/reports/baseline/',
  ]

  for (const prefix of forbiddenPrefixes) {
    assert.equal(
      combined.some((file) => file.startsWith(prefix) && !isAllowedA4R190LegacyMethodologyPath(process.cwd(), file)),
      false,
      `protected area changed unexpectedly: ${prefix}`,
    )
  }

  const allowedMigration = 'supabase/migrations/20260608190000_risk_profile_exclusions.sql'
  const unexpectedMigration = combined
    .filter((file) => file.startsWith('supabase/migrations/'))
    .filter((file) => file !== allowedMigration)
  assert.deepEqual(unexpectedMigration, [], 'only the risk-profile exclusion migration may change in this phase')

  const report = {
    trialId: TRIAL_ID,
    changedFiles: combined.map((file) => path.normalize(file)),
    status: 'PASS',
  }
  const reportPath = writeJsonReport(`${TRIAL_ID}.json`, report)
  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
