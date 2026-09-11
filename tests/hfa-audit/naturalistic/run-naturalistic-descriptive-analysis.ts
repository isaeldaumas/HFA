/**
 * Descriptive analysis for naturalistic validation artifacts.
 *
 * NEVER emits methodological PASS/FAIL / PRODUCTION_READY / SHADOW_APPROVED.
 * TEST_* / scientificUse:false never enter scientific cohort.
 * scientificUse:true on TEST_* caseIds or filenames is a hard error.
 */
import { basename, join } from 'node:path'
import { existsSync, readdirSync, readFileSync } from 'node:fs'

type Axis = 'perception' | 'objective' | 'action'

type AxisCodes = Record<Axis, string | null>

type Pair = {
  file: string
  caseId: string
  scientificUse: boolean
  human: AxisCodes
  humanB: AxisCodes | null
  vnext: AxisCodes
  humanRaw: AxisCodes
  vnextRaw: AxisCodes
}

const FORBIDDEN_VERDICTS = [
  'VALIDATION_PASS',
  'VALIDATION_FAIL',
  'PRODUCTION_READY',
  'SHADOW_APPROVED',
  'ENGINE_NATURALISTIC_VALIDATION_PASS',
]

function parseArgs(argv: string[]): { inputDir: string } {
  const idx = argv.indexOf('--input')
  const inputDir = idx >= 0 ? argv[idx + 1] : 'docs/hfa-backlog/naturalistic-kit/fixtures'
  return { inputDir }
}

function isUnresolved(code: string | null | undefined): boolean {
  return typeof code === 'string' && /^unresolved$/i.test(code.trim())
}

function norm(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null
  const t = code.trim()
  if (!t || isUnresolved(t)) return null
  return t
}

function readAxis(raw?: Partial<AxisCodes> | null): AxisCodes {
  return {
    perception: norm(raw?.perception ?? null),
    objective: norm(raw?.objective ?? null),
    action: norm(raw?.action ?? null),
  }
}

function readAxisRaw(raw?: Partial<AxisCodes> | null): AxisCodes {
  return {
    perception: typeof raw?.perception === 'string' ? raw.perception : null,
    objective: typeof raw?.objective === 'string' ? raw.objective : null,
    action: typeof raw?.action === 'string' ? raw.action : null,
  }
}

function assertNoTestScientific(file: string, caseId: string, scientificUse: boolean) {
  const base = basename(file)
  const testMarked = /^TEST_/i.test(caseId) || /TEST_/i.test(base) || /\/fixtures\/TEST_/i.test(file)
  if (scientificUse && testMarked) {
    throw new Error(
      `SCIENTIFIC_USE_FORBIDDEN_ON_TEST_FIXTURE: file=${file} caseId=${caseId}. ` +
        'TEST_* fixtures cannot set scientificUse=true.',
    )
  }
}

function loadPairs(inputDir: string): Pair[] {
  if (!existsSync(inputDir)) return []
  const files = readdirSync(inputDir).filter((f) => f.endsWith('.json'))
  const pairs: Pair[] = []
  for (const file of files) {
    const full = join(inputDir, file)
    const raw = JSON.parse(readFileSync(full, 'utf8')) as {
      schemaVersion?: string
      caseId?: string
      scientificUse?: boolean
      human?: Partial<AxisCodes>
      humanB?: Partial<AxisCodes>
      vnext?: Partial<AxisCodes>
    }
    if (raw.schemaVersion !== 'NATURALISTIC_DESCRIPTIVE_PAIR_V1') continue
    if (!raw.caseId) continue
    const scientificUse = raw.scientificUse === true
    assertNoTestScientific(full, raw.caseId, scientificUse)
    pairs.push({
      file: full,
      caseId: raw.caseId,
      scientificUse,
      human: readAxis(raw.human),
      humanB: raw.humanB ? readAxis(raw.humanB) : null,
      vnext: readAxis(raw.vnext),
      humanRaw: readAxisRaw(raw.human),
      vnextRaw: readAxisRaw(raw.vnext),
    })
  }
  return pairs
}

function unresolvedCounts(pairs: Pair[]) {
  const axes: Axis[] = ['perception', 'objective', 'action']
  const human: Record<Axis, number> = { perception: 0, objective: 0, action: 0 }
  const vnext: Record<Axis, number> = { perception: 0, objective: 0, action: 0 }
  for (const p of pairs) {
    for (const axis of axes) {
      if (isUnresolved(p.humanRaw[axis])) human[axis] += 1
      if (isUnresolved(p.vnextRaw[axis])) vnext[axis] += 1
    }
  }
  return { human, vnext }
}

function axisStats(pairs: Pair[], axis: Axis, left: 'human' | 'humanB', right: 'vnext' | 'humanB') {
  let comparable = 0
  let agree = 0
  for (const p of pairs) {
    const l = left === 'human' ? p.human[axis] : p.humanB?.[axis] ?? null
    const r = right === 'vnext' ? p.vnext[axis] : p.humanB?.[axis] ?? null
    if (l === null || r === null) continue
    comparable += 1
    if (l === r) agree += 1
  }
  return {
    axis,
    left,
    right,
    comparable,
    agree,
    diverge: comparable - agree,
    agreementRate: comparable === 0 ? null : Number((agree / comparable).toFixed(6)),
  }
}

function exactTriplet(pairs: Pair[], left: 'human' | 'humanB', right: 'vnext' | 'humanB') {
  let eligible = 0
  let match = 0
  for (const p of pairs) {
    const axes: Axis[] = ['perception', 'objective', 'action']
    const L = axes.map((a) => (left === 'human' ? p.human[a] : p.humanB?.[a] ?? null))
    const R = axes.map((a) => (right === 'vnext' ? p.vnext[a] : p.humanB?.[a] ?? null))
    if (L.some((x) => x === null) || R.some((x) => x === null)) continue
    eligible += 1
    if (L.every((x, i) => x === R[i])) match += 1
  }
  return {
    left,
    right,
    eligible,
    exactTripletMatchCount: match,
    exactTripletMatchRate: eligible === 0 ? null : Number((match / eligible).toFixed(6)),
  }
}

function cohensKappa(
  pairs: Pair[],
  axis: Axis,
  left: 'human' | 'humanB',
  right: 'vnext' | 'humanB',
): { kappa: number | null; reason: string } {
  const labeled = pairs
    .map((p) => ({
      h: left === 'human' ? p.human[axis] : p.humanB?.[axis] ?? null,
      v: right === 'vnext' ? p.vnext[axis] : p.humanB?.[axis] ?? null,
    }))
    .filter((x) => x.h !== null && x.v !== null) as Array<{ h: string; v: string }>
  if (labeled.length < 2) return { kappa: null, reason: 'KAPPA_NOT_APPLICABLE_sample_lt_2' }
  const categories = Array.from(new Set(labeled.flatMap((x) => [x.h, x.v]))).sort()
  if (categories.length < 2) return { kappa: null, reason: 'KAPPA_NOT_APPLICABLE_lt_2_categories' }
  const n = labeled.length
  const index = new Map(categories.map((c, i) => [c, i]))
  const matrix = categories.map(() => categories.map(() => 0))
  for (const row of labeled) matrix[index.get(row.h)!][index.get(row.v)!] += 1
  let po = 0
  for (let i = 0; i < categories.length; i++) po += matrix[i][i]
  po /= n
  const rowMarg = matrix.map((r) => r.reduce((a, b) => a + b, 0) / n)
  const colMarg = categories.map((_, j) => matrix.reduce((a, r) => a + r[j], 0) / n)
  let pe = 0
  for (let i = 0; i < categories.length; i++) pe += rowMarg[i] * colMarg[i]
  if (pe === 1) return { kappa: null, reason: 'KAPPA_NOT_APPLICABLE_pe_eq_1' }
  return { kappa: Number(((po - pe) / (1 - pe)).toFixed(6)), reason: 'COMPUTED' }
}

function main() {
  const { inputDir } = parseArgs(process.argv.slice(2))
  const all = loadPairs(inputDir)
  const scientific = all.filter((p) => p.scientificUse)
  const testOnly = all.filter((p) => !p.scientificUse)
  const interReviewerPairs = scientific.filter((p) => p.humanB !== null)

  const report = {
    schemaVersion: 'NATURALISTIC_DESCRIPTIVE_REPORT_V1',
    methodologicalGate: 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY',
    scientificValidation: 'NOT_RUN',
    humanValidation: 'NOT_STARTED',
    productAuthorization: 'NOT_AUTHORIZED',
    note: 'Descriptive only. This script cannot declare methodological PASS/FAIL.',
    inputDir,
    pairCounts: {
      totalLoaded: all.length,
      scientificUseTrue: scientific.length,
      testOrNonScientific: testOnly.length,
      scientificWithSecondHuman: interReviewerPairs.length,
    },
    scientificCohort: {
      unresolvedCounts: unresolvedCounts(scientific),
      reviewerVsVnext: {
        axis: (['perception', 'objective', 'action'] as Axis[]).map((a) =>
          axisStats(scientific, a, 'human', 'vnext'),
        ),
        triplet: exactTriplet(scientific, 'human', 'vnext'),
        kappa: (['perception', 'objective', 'action'] as Axis[]).map((a) => ({
          axis: a,
          ...cohensKappa(scientific, a, 'human', 'vnext'),
        })),
      },
      interReviewer:
        interReviewerPairs.length === 0
          ? { status: 'NOT_APPLICABLE_no_humanB' }
          : {
              axis: (['perception', 'objective', 'action'] as Axis[]).map((a) =>
                axisStats(interReviewerPairs, a, 'human', 'humanB'),
              ),
              triplet: exactTriplet(interReviewerPairs, 'human', 'humanB'),
              kappa: (['perception', 'objective', 'action'] as Axis[]).map((a) => ({
                axis: a,
                ...cohensKappa(interReviewerPairs, a, 'human', 'humanB'),
              })),
            },
    },
    testToolingCohort: {
      warning: 'TEST fixtures must never be treated as scientific evidence.',
      unresolvedCounts: unresolvedCounts(testOnly),
      axis: (['perception', 'objective', 'action'] as Axis[]).map((a) =>
        axisStats(testOnly, a, 'human', 'vnext'),
      ),
      triplet: exactTriplet(testOnly, 'human', 'vnext'),
    },
  }

  const serialized = JSON.stringify(report, null, 2)
  for (const bad of FORBIDDEN_VERDICTS) {
    // Match as JSON string values / tokens, not substrings inside explanatory prose.
    const pattern = new RegExp(`"${bad}"|\\b${bad}\\b`)
    if (pattern.test(serialized)) {
      throw new Error(`FORBIDDEN_VERDICT_LEAKED_IN_REPORT: ${bad}`)
    }
  }

  console.log(serialized)
  console.log('ENGINE_NATURALISTIC_VALIDATION_NOT_READY')
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.log('ENGINE_NATURALISTIC_VALIDATION_NOT_READY')
  process.exit(1)
}
