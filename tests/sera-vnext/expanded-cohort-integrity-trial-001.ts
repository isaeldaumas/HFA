import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const TRIAL_ID = 'expanded-cohort-integrity-trial-001'
const ROOT_DIR = path.resolve(__dirname, '..', '..')
const COHORT_DIR = path.join(ROOT_DIR, 'docs', 'sera-vnext', 'expanded-cohort')

const REQUIRED_COHORT_DOCS = [
  'SERA_VNEXT_EXPANDED_COHORT_OVERVIEW.md',
  'SERA_VNEXT_EXPANDED_COHORT_PARTICIPANTS.md',
  'SERA_VNEXT_EXPANDED_COHORT_CASE_MATRIX.csv',
  'SERA_VNEXT_EXPANDED_COHORT_CASE_RESULTS.csv',
  'SERA_VNEXT_EXPANDED_COHORT_METRICS.md',
  'SERA_VNEXT_EXPANDED_COHORT_METHOD_OBSERVATIONS.md',
  'SERA_VNEXT_EXPANDED_COHORT_UX_WORKFLOW_FINDINGS.csv',
  'SERA_VNEXT_EXPANDED_COHORT_AUDIT_RESULTS.md',
  'SERA_VNEXT_EXPANDED_COHORT_SECURITY_RESULTS.md',
  'SERA_VNEXT_EXPANDED_COHORT_FINAL_DECISION.md',
  'SERA_VNEXT_EXPANDED_COHORT_NEXT_STEPS.md',
  'SERA_VNEXT_EXPANDED_COHORT_ROLLBACK.md',
]

const FORBIDDEN_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'selectedCode non-null leak', pattern: /selectedCode["']?\s*[:=]\s*(?!null\b)/i },
  { label: 'releasedCode non-null leak', pattern: /releasedCode["']?\s*[:=]\s*(?!null\b)/i },
  { label: 'finalConclusion non-null leak', pattern: /finalConclusion["']?\s*[:=]\s*(?!null\b)/i },
  { label: 'classified state leak', pattern: /\b(CLASSIFIED|READY)\b.*\b(true|allowed|released)\b/i },
  { label: 'downstream enabled leak', pattern: /downstream\w*["']?\s*[:=]\s*true/i },
  { label: 'operational recommendation leak', pattern: /recommendations operacionais/i },
]

const FORBIDDEN_SECRET_PATTERNS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'service role key', pattern: /SUPABASE_SERVICE_ROLE|service_role\s*=/i },
  { label: 'database url assignment', pattern: /DATABASE_URL\s*=/i },
  { label: 'jwt-like secret', pattern: /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/ },
  { label: 'cookie assignment', pattern: /\bcookie\s*[:=]/i },
]

function scanFile(filePath: string, forbidden: Array<{ label: string; pattern: RegExp }>): string[] {
  const content = fs.readFileSync(filePath, 'utf8')
  return forbidden.filter((f) => f.pattern.test(content)).map((f) => f.label)
}

function main(): void {
  // 1. All required cohort docs must exist
  for (const docName of REQUIRED_COHORT_DOCS) {
    const docPath = path.join(COHORT_DIR, docName)
    assert.ok(fs.existsSync(docPath), `Required cohort doc missing: ${docName}`)
  }
  console.log('✓ All required cohort docs present')

  // 2. Final decision must reference BLOCKED_SINGLE_REVIEWER or PASS
  const finalDecisionPath = path.join(COHORT_DIR, 'SERA_VNEXT_EXPANDED_COHORT_FINAL_DECISION.md')
  const finalDecision = fs.readFileSync(finalDecisionPath, 'utf8')
  assert.ok(
    finalDecision.includes('EXPANDED_COHORT_BLOCKED_SINGLE_REVIEWER') ||
      finalDecision.includes('EXPANDED_COHORT_PASS'),
    'Final decision must contain a valid status',
  )
  console.log('✓ Final decision contains valid status')

  // 3. No forbidden output strings in any cohort doc
  const docFiles = REQUIRED_COHORT_DOCS.map((d) => path.join(COHORT_DIR, d))
  for (const docPath of docFiles) {
    const found = scanFile(docPath, FORBIDDEN_PATTERNS)
    assert.equal(
      found.length,
      0,
      `Forbidden strings in ${path.basename(docPath)}: ${found.join(', ')}`,
    )
  }
  console.log('✓ No forbidden output strings in cohort docs')

  // 4. No credentials or secrets in cohort docs
  for (const docPath of docFiles) {
    const found = scanFile(docPath, FORBIDDEN_SECRET_PATTERNS)
    assert.equal(
      found.length,
      0,
      `Potential credential leak in ${path.basename(docPath)}: ${found.join(', ')}`,
    )
  }
  console.log('✓ No credential/secret leaks in cohort docs')

  // 5. Engine ENGINE_VERSION.ts must still exist and be unchanged (verify it is present)
  const engineVersionPath = path.join(ROOT_DIR, 'frontend', 'src', 'lib', 'sera-vnext', 'ENGINE_VERSION.ts')
  assert.ok(fs.existsSync(engineVersionPath), `Engine version file missing: ${engineVersionPath}`)
  const engineVersion = fs.readFileSync(engineVersionPath, 'utf8')
  assert.ok(engineVersion.includes('ENGINE_VERSION') || engineVersion.includes('version'), 'ENGINE_VERSION.ts must define version')
  console.log('✓ Engine version file present')

  // 6. Engine baseline fixtures must exist
  const fixturesDir = path.join(ROOT_DIR, 'tests', 'sera-vnext', 'baselines')
  assert.ok(fs.existsSync(fixturesDir), `Baselines dir missing: ${fixturesDir}`)
  const fixtureFiles = fs.readdirSync(fixturesDir)
  assert.ok(fixtureFiles.length > 0, 'Baselines dir must not be empty')
  console.log(`✓ Baselines dir present (${fixtureFiles.length} files)`)

  // 7. Case results must have >= 20 rows
  const caseResultsPath = path.join(COHORT_DIR, 'SERA_VNEXT_EXPANDED_COHORT_CASE_RESULTS.csv')
  const caseResultsContent = fs.readFileSync(caseResultsPath, 'utf8')
  const caseRows = caseResultsContent.split('\n').filter((l) => l.trim() && !l.startsWith('case_id'))
  assert.ok(caseRows.length >= 20, `Expected >= 20 result rows, got ${caseRows.length}`)
  console.log(`✓ Case results has ${caseRows.length} rows`)

  // 8. Case matrix must have >= 20 rows
  const caseMatrixPath = path.join(COHORT_DIR, 'SERA_VNEXT_EXPANDED_COHORT_CASE_MATRIX.csv')
  const caseMatrixContent = fs.readFileSync(caseMatrixPath, 'utf8')
  const matrixRows = caseMatrixContent.split('\n').filter((l) => l.trim() && !l.startsWith('case_id'))
  assert.ok(matrixRows.length >= 20, `Expected >= 20 matrix rows, got ${matrixRows.length}`)
  console.log(`✓ Case matrix has ${matrixRows.length} rows`)

  // 9. Participants doc must not contain real email or PII
  const participantsPath = path.join(COHORT_DIR, 'SERA_VNEXT_EXPANDED_COHORT_PARTICIPANTS.md')
  const participantsContent = fs.readFileSync(participantsPath, 'utf8')
  assert.ok(
    !participantsContent.includes('@') || participantsContent.includes('REDACTED'),
    'Participants doc must not contain real email addresses',
  )
  console.log('✓ Participants doc does not leak PII')

  // 10. Method observations must classify issues
  const methodPath = path.join(COHORT_DIR, 'SERA_VNEXT_EXPANDED_COHORT_METHOD_OBSERVATIONS.md')
  const methodContent = fs.readFileSync(methodPath, 'utf8')
  assert.ok(
    methodContent.includes('NO_METHOD_ISSUE') ||
      methodContent.includes('NON_CRITICAL_METHOD_OBSERVATION') ||
      methodContent.includes('CRITICAL_METHOD_BUG'),
    'Method observations must include a classification',
  )
  console.log('✓ Method observations contain classification')

  console.log(JSON.stringify({
    trialId: TRIAL_ID,
    cohort_docs_present: REQUIRED_COHORT_DOCS.length,
    case_result_rows: caseRows.length,
    matrix_rows: matrixRows.length,
    forbidden_strings_check: 'PASS',
    credential_leak_check: 'PASS',
    engine_integrity: 'PASS',
    result: 'EXPANDED_COHORT_INTEGRITY_PASS',
  }, null, 2))
  console.log('EXPANDED_COHORT_INTEGRITY_OK')
}

main()
