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
const DEFAULT_OUTPUT_PATH = path.join(
  ROOT_DIR,
  'docs',
  'sera-vnext',
  'human-reviewer-pilot',
  'SERA_VNEXT_HUMAN_REVIEWER_PILOT_METRICS_GENERATED.md',
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

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = fs.existsSync(FUTURE_RESULT_DATA_PATH) ? FUTURE_RESULT_DATA_PATH : TEMPLATE_PATH
  let output = DEFAULT_OUTPUT_PATH
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--input') {
      input = path.resolve(ROOT_DIR, argv[i + 1] ?? '')
      i += 1
    } else if (argv[i] === '--output') {
      output = path.resolve(ROOT_DIR, argv[i + 1] ?? '')
      i += 1
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`)
    }
  }
  return { input, output }
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

function yesRate(rows: CsvRow[], field: string): string {
  const eligible = rows.filter((row) => ['YES', 'NO', 'PARTIAL'].includes(row[field]))
  if (eligible.length === 0) return 'NO_DATA'
  const yesCount = eligible.filter((row) => row[field] === 'YES').length
  return `${Math.round((yesCount / eligible.length) * 1000) / 10}%`
}

function countDecision(rows: CsvRow[], decision: string): number {
  return rows.filter((row) => row.reviewer_decision === decision).length
}

function issueCount(rows: CsvRow[], field: string): number {
  return rows.filter((row) => {
    const value = row[field]?.trim().toUpperCase()
    return Boolean(value && !['NO', 'NONE', 'NOT_APPLICABLE', 'NA', 'N/A'].includes(value))
  }).length
}

function averageReviewTime(rows: CsvRow[]): string {
  const values = rows.map((row) => Number.parseFloat(row.review_time_minutes)).filter((value) => Number.isFinite(value))
  if (values.length === 0) return 'NO_DATA'
  return String(Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10)
}

function renderPending(input: string): string {
  return [
    '# SERA vNext Human Reviewer Pilot Metrics',
    '',
    '```text',
    'NO_REAL_HUMAN_RESULTS_YET',
    '```',
    '',
    `Input: \`${path.relative(ROOT_DIR, input)}\``,
    '',
    'The human reviewer pilot has not been executed. This generated report intentionally does not infer, simulate, or declare pilot pass status.',
    '',
    'Expected future metrics:',
    '',
    '- total_reviewers',
    '- total_cases',
    '- escape_point_useful_rate',
    '- poa_useful_rate',
    '- preconditions_useful_rate',
    '- uncertainty_clear_rate',
    '- warnings_clear_rate',
    '- candidate_only_clear_rate',
    '- more_evidence_rate',
    '- reanalyze_rate',
    '- accepted_hypothesis_rate',
    '- rejected_hypothesis_rate',
    '- average_review_time',
    '- critical_method_issue_count',
    '- critical_security_issue_count',
    '',
  ].join('\n')
}

function renderMetrics(input: string, rows: CsvRow[]): string {
  const reviewers = new Set(rows.map((row) => row.reviewer_id).filter(Boolean))
  const cases = new Set(rows.map((row) => row.case_id).filter(Boolean))
  const total = rows.length || 1
  const moreEvidence = countDecision(rows, 'REQUIRES_MORE_EVIDENCE')
  const reanalyze = countDecision(rows, 'RETURN_FOR_REANALYSIS')
  const accepted = countDecision(rows, 'ACCEPT_AS_WORKING_HYPOTHESIS')
  const rejected = countDecision(rows, 'REJECT_WORKING_HYPOTHESIS')

  return [
    '# SERA vNext Human Reviewer Pilot Metrics',
    '',
    '```text',
    'HUMAN_REVIEWER_PILOT_METRICS_GENERATED',
    '```',
    '',
    `Input: \`${path.relative(ROOT_DIR, input)}\``,
    '',
    'Descriptive, reviewer-declared data only: this report does not establish scientific validation.',
    '',
    '| Metric | Value |',
    '| --- | --- |',
    `| total_reviewers | ${reviewers.size} |`,
    `| total_cases | ${cases.size} |`,
    `| escape_point_useful_rate | ${yesRate(rows, 'escape_point_useful')} |`,
    `| poa_useful_rate | ${yesRate(rows, 'poa_useful')} |`,
    `| preconditions_useful_rate | ${yesRate(rows, 'preconditions_useful')} |`,
    `| uncertainty_clear_rate | ${yesRate(rows, 'uncertainty_clear')} |`,
    `| warnings_clear_rate | ${yesRate(rows, 'warnings_clear')} |`,
    `| candidate_only_clear_rate | ${yesRate(rows, 'candidate_only_clear')} |`,
    `| more_evidence_rate | ${Math.round((moreEvidence / total) * 1000) / 10}% |`,
    `| reanalyze_rate | ${Math.round((reanalyze / total) * 1000) / 10}% |`,
    `| accepted_hypothesis_rate | ${Math.round((accepted / total) * 1000) / 10}% |`,
    `| rejected_hypothesis_rate | ${Math.round((rejected / total) * 1000) / 10}% |`,
    `| average_review_time | ${averageReviewTime(rows)} |`,
    `| critical_method_issue_count | ${issueCount(rows, 'method_issue')} |`,
    `| critical_security_issue_count | ${issueCount(rows, 'security_issue')} |`,
    '',
  ].join('\n')
}

function main(): void {
  const { input, output } = parseArgs(process.argv.slice(2))
  const rows = parseCsv(fs.readFileSync(input, 'utf8')).filter(hasRealResult)
  const markdown = rows.length === 0 ? renderPending(input) : renderMetrics(input, rows)
  fs.writeFileSync(output, markdown)
  process.stdout.write(`${rows.length === 0 ? 'NO_REAL_HUMAN_RESULTS_YET' : 'HUMAN_REVIEWER_PILOT_METRICS_GENERATED'}\n`)
}

main()

