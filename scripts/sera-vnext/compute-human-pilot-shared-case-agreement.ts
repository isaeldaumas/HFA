import fs from 'node:fs'
import path from 'node:path'

type CsvRow = Record<string, string>

const ROOT_DIR = process.cwd()
const FUTURE_RESULT_DATA_PATH = path.join(
  ROOT_DIR,
  'docs',
  'sera-vnext',
  'human-reviewer-pilot',
  'SERA_VNEXT_HUMAN_REVIEWER_RESULT_DATA.csv',
)
const TEMPLATE_PATH = path.join(
  ROOT_DIR,
  'docs',
  'sera-vnext',
  'human-pilot-preparation',
  'SERA_VNEXT_HUMAN_REVIEWER_RESULT_TEMPLATE.csv',
)
const SHARED_PLAN_PATH = path.join(
  ROOT_DIR,
  'docs',
  'sera-vnext',
  'human-pilot-preparation',
  'SERA_VNEXT_HUMAN_PILOT_SHARED_CASES_PLAN.csv',
)
const DEFAULT_OUTPUT_PATH = path.join(
  ROOT_DIR,
  'docs',
  'sera-vnext',
  'human-reviewer-pilot',
  'SERA_VNEXT_HUMAN_REVIEWER_SHARED_CASE_AGREEMENT_GENERATED.md',
)

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i]
    if (char === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (char === ',' && !inQuotes) {
      values.push(current)
      current = ''
      continue
    }
    current += char
  }
  values.push(current)
  return values
}

function parseCsv(content: string): CsvRow[] {
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0)
  if (lines.length <= 1) return []
  const headers = parseCsvLine(lines[0])
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line)
    return Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))
  })
}

function parseArgs(argv: string[]): { input: string; sharedPlan: string; output: string } {
  let input = fs.existsSync(FUTURE_RESULT_DATA_PATH) ? FUTURE_RESULT_DATA_PATH : TEMPLATE_PATH
  let sharedPlan = SHARED_PLAN_PATH
  let output = DEFAULT_OUTPUT_PATH
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') {
      input = path.resolve(ROOT_DIR, argv[i + 1] ?? '')
      i += 1
    } else if (argv[i] === '--shared-plan') {
      sharedPlan = path.resolve(ROOT_DIR, argv[i + 1] ?? '')
      i += 1
    } else if (argv[i] === '--output') {
      output = path.resolve(ROOT_DIR, argv[i + 1] ?? '')
      i += 1
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`)
    }
  }
  return { input, sharedPlan, output }
}

const HUMAN_REVIEW_DECISIONS = new Set([
  'ACCEPT_AS_WORKING_HYPOTHESIS',
  'REJECT_WORKING_HYPOTHESIS',
  'REQUIRES_MORE_EVIDENCE',
  'RETURN_FOR_REANALYSIS',
])

/** Completeness check, not independent verification of human origin. */
function hasRealResult(row: CsvRow): boolean {
  return Boolean(
    row.case_id?.trim() &&
    row.reviewer_id?.trim() &&
    row.review_submitted?.trim().toUpperCase() === 'YES' &&
    HUMAN_REVIEW_DECISIONS.has(row.reviewer_decision?.trim() ?? ''),
  )
}

function agreementRate(planRows: CsvRow[], resultRows: CsvRow[], field: string): string {
  let comparable = 0
  let agreements = 0
  for (const shared of planRows) {
    const a = resultRows.find((row) => row.case_id === shared.case_id && row.reviewer_id === shared.reviewer_a)
    const b = resultRows.find((row) => row.case_id === shared.case_id && row.reviewer_id === shared.reviewer_b)
    if (!a || !b || !a[field] || !b[field]) continue
    comparable += 1
    if (a[field] === b[field]) agreements += 1
  }
  if (comparable === 0) return 'NO_DATA'
  return `${Math.round((agreements / comparable) * 1000) / 10}%`
}

function renderPending(input: string, sharedPlan: string): string {
  return [
    '# SERA vNext Human Reviewer Shared Case Agreement',
    '',
    '```text',
    'NO_REAL_SHARED_CASE_RESULTS_YET',
    '```',
    '',
    `Input: \`${path.relative(ROOT_DIR, input)}\``,
    `Shared plan: \`${path.relative(ROOT_DIR, sharedPlan)}\``,
    '',
    'The human reviewer pilot has not produced shared-case result rows. No kappa or agreement claim is calculated.',
    '',
  ].join('\n')
}

function renderAgreement(input: string, sharedPlan: string, planRows: CsvRow[], resultRows: CsvRow[]): string {
  const disagreements = planRows.flatMap((shared) => {
    const a = resultRows.find((row) => row.case_id === shared.case_id && row.reviewer_id === shared.reviewer_a)
    const b = resultRows.find((row) => row.case_id === shared.case_id && row.reviewer_id === shared.reviewer_b)
    if (!a || !b || a.reviewer_decision === b.reviewer_decision) return []
    return [`- ${shared.case_id}: ${shared.reviewer_a}=${a.reviewer_decision}; ${shared.reviewer_b}=${b.reviewer_decision}`]
  })

  return [
    '# SERA vNext Human Reviewer Shared Case Agreement',
    '',
    '```text',
    'HUMAN_REVIEWER_SHARED_CASE_AGREEMENT_GENERATED',
    '```',
    '',
    `Input: \`${path.relative(ROOT_DIR, input)}\``,
    `Shared plan: \`${path.relative(ROOT_DIR, sharedPlan)}\``,
    '',
    'Descriptive agreement only: this report does not independently authenticate reviewers or establish scientific validation.',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| decision agreement | ${agreementRate(planRows, resultRows, 'reviewer_decision')} |`,
    `| escape point useful agreement | ${agreementRate(planRows, resultRows, 'escape_point_useful')} |`,
    `| P/O/A useful agreement | ${agreementRate(planRows, resultRows, 'poa_useful')} |`,
    `| preconditions useful agreement | ${agreementRate(planRows, resultRows, 'preconditions_useful')} |`,
    '',
    '## Disagreement List',
    '',
    disagreements.length === 0 ? 'No decision disagreements in comparable shared cases.' : disagreements.join('\n'),
    '',
  ].join('\n')
}

function main(): void {
  const { input, sharedPlan, output } = parseArgs(process.argv.slice(2))
  const resultRows = parseCsv(fs.readFileSync(input, 'utf8')).filter(hasRealResult)
  const planRows = parseCsv(fs.readFileSync(sharedPlan, 'utf8'))
  // A single submitted review is not a pairwise human agreement.
  const comparablePairs = planRows.filter((shared) => {
    const a = resultRows.find((row) => row.case_id === shared.case_id && row.reviewer_id === shared.reviewer_a)
    const b = resultRows.find((row) => row.case_id === shared.case_id && row.reviewer_id === shared.reviewer_b)
    return Boolean(
      shared.case_id?.trim() && shared.reviewer_a?.trim() && shared.reviewer_b?.trim() &&
      shared.reviewer_a !== shared.reviewer_b && a && b,
    )
  })
  const markdown = comparablePairs.length === 0
    ? renderPending(input, sharedPlan)
    : renderAgreement(input, sharedPlan, comparablePairs, resultRows)
  fs.writeFileSync(output, markdown)
  process.stdout.write(`${comparablePairs.length === 0 ? 'NO_REAL_SHARED_CASE_RESULTS_YET' : 'HUMAN_REVIEWER_SHARED_CASE_AGREEMENT_GENERATED'}\n`)
}

main()

