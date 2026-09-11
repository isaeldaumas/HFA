/**
 * Descriptive analysis for naturalistic validation artifacts.
 *
 * - Accepts only JSON files under an explicit input directory.
 * - Computes literal axis agreement / exact triplet when BOTH human and vNext codes exist.
 * - Computes Cohen's Kappa ONLY when both raters provide CLASSIFIED codes on ≥2 categories
 *   and sample size ≥ 2; otherwise reports KAPPA_NOT_APPLICABLE.
 * - NEVER emits methodological PASS/FAIL.
 * - TEST fixtures under fixtures/TEST_* must set scientificUse=false.
 *
 * Usage:
 *   ./frontend/node_modules/.bin/tsx tests/hfa-audit/naturalistic/run-naturalistic-descriptive-analysis.ts \
 *     --input docs/hfa-backlog/naturalistic-kit/fixtures
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type Axis = 'perception' | 'objective' | 'action'

type Pair = {
  caseId: string
  scientificUse: boolean
  human: Record<Axis, string | null>
  vnext: Record<Axis, string | null>
}

function parseArgs(argv: string[]): { inputDir: string } {
  const idx = argv.indexOf('--input')
  const inputDir = idx >= 0 ? argv[idx + 1] : 'docs/hfa-backlog/naturalistic-kit/fixtures'
  return { inputDir }
}

function norm(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null
  const t = code.trim()
  if (!t || /^unresolved$/i.test(t)) return null
  return t
}

function loadPairs(inputDir: string): Pair[] {
  if (!existsSync(inputDir)) return []
  const files = readdirSync(inputDir).filter((f) => f.endsWith('.json'))
  const pairs: Pair[] = []
  for (const file of files) {
    const raw = JSON.parse(readFileSync(join(inputDir, file), 'utf8')) as {
      schemaVersion?: string
      caseId?: string
      scientificUse?: boolean
      human?: Partial<Record<Axis, string | null>>
      vnext?: Partial<Record<Axis, string | null>>
    }
    if (raw.schemaVersion !== 'NATURALISTIC_DESCRIPTIVE_PAIR_V1') continue
    if (!raw.caseId) continue
    pairs.push({
      caseId: raw.caseId,
      scientificUse: raw.scientificUse === true,
      human: {
        perception: norm(raw.human?.perception ?? null),
        objective: norm(raw.human?.objective ?? null),
        action: norm(raw.human?.action ?? null),
      },
      vnext: {
        perception: norm(raw.vnext?.perception ?? null),
        objective: norm(raw.vnext?.objective ?? null),
        action: norm(raw.vnext?.action ?? null),
      },
    })
  }
  return pairs
}

function axisStats(pairs: Pair[], axis: Axis) {
  let comparable = 0
  let agree = 0
  for (const p of pairs) {
    const h = p.human[axis]
    const v = p.vnext[axis]
    if (h === null || v === null) continue
    comparable += 1
    if (h === v) agree += 1
  }
  return {
    axis,
    comparable,
    agree,
    diverge: comparable - agree,
    agreementRate: comparable === 0 ? null : Number((agree / comparable).toFixed(6)),
  }
}

function exactTriplet(pairs: Pair[]) {
  let eligible = 0
  let match = 0
  for (const p of pairs) {
    const axes: Axis[] = ['perception', 'objective', 'action']
    if (axes.some((a) => p.human[a] === null || p.vnext[a] === null)) continue
    eligible += 1
    if (axes.every((a) => p.human[a] === p.vnext[a])) match += 1
  }
  return {
    eligible,
    exactTripletMatchCount: match,
    exactTripletMatchRate: eligible === 0 ? null : Number((match / eligible).toFixed(6)),
  }
}

/** Cohen's Kappa for two categorical raters; null when not applicable. */
function cohensKappa(pairs: Pair[], axis: Axis): { kappa: number | null; reason: string } {
  const labeled = pairs
    .map((p) => ({ h: p.human[axis], v: p.vnext[axis] }))
    .filter((x) => x.h !== null && x.v !== null) as Array<{ h: string; v: string }>
  if (labeled.length < 2) {
    return { kappa: null, reason: 'KAPPA_NOT_APPLICABLE_sample_lt_2' }
  }
  const categories = Array.from(new Set(labeled.flatMap((x) => [x.h, x.v]))).sort()
  if (categories.length < 2) {
    return { kappa: null, reason: 'KAPPA_NOT_APPLICABLE_lt_2_categories' }
  }
  const n = labeled.length
  const index = new Map(categories.map((c, i) => [c, i]))
  const matrix = categories.map(() => categories.map(() => 0))
  for (const row of labeled) {
    matrix[index.get(row.h)!][index.get(row.v)!] += 1
  }
  let po = 0
  for (let i = 0; i < categories.length; i++) po += matrix[i][i]
  po /= n
  const rowMarg = matrix.map((r) => r.reduce((a, b) => a + b, 0) / n)
  const colMarg = categories.map((_, j) => matrix.reduce((a, r) => a + r[j], 0) / n)
  let pe = 0
  for (let i = 0; i < categories.length; i++) pe += rowMarg[i] * colMarg[i]
  if (pe === 1) return { kappa: null, reason: 'KAPPA_NOT_APPLICABLE_pe_eq_1' }
  const kappa = (po - pe) / (1 - pe)
  return { kappa: Number(kappa.toFixed(6)), reason: 'COMPUTED' }
}

function main() {
  const { inputDir } = parseArgs(process.argv.slice(2))
  const all = loadPairs(inputDir)
  const scientific = all.filter((p) => p.scientificUse)
  const testOnly = all.filter((p) => !p.scientificUse)

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
    },
    scientificCohort: {
      axis: (['perception', 'objective', 'action'] as Axis[]).map((a) => axisStats(scientific, a)),
      triplet: exactTriplet(scientific),
      kappa: (['perception', 'objective', 'action'] as Axis[]).map((a) => ({
        axis: a,
        ...cohensKappa(scientific, a),
      })),
    },
    testToolingCohort: {
      warning: 'TEST fixtures must never be treated as scientific evidence.',
      axis: (['perception', 'objective', 'action'] as Axis[]).map((a) => axisStats(testOnly, a)),
      triplet: exactTriplet(testOnly),
    },
  }

  console.log(JSON.stringify(report, null, 2))
  console.log('ENGINE_NATURALISTIC_VALIDATION_NOT_READY')
}

main()
