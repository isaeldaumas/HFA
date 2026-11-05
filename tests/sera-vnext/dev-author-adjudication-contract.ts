/**
 * NON-BLIND DEVELOPMENT worksheet for SYNTHETIC V03 CAL/VAL cases only.
 * This stores user-entered, explicitly provisional human input outside the repo.
 * It never releases a SERA code and cannot authenticate the author or establish
 * scientific validity. V03-HLD and V04 sealed cases MUST NOT be accessed.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { splitNarrativeIntoSentenceRecords } from '../../frontend/src/lib/sera-vnext/engine-v0/factual-extraction-helpers'
import { calibrationCases, validationCases } from './engine-validation-v03-naturalistic/cases'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const AXES = ['P', 'O', 'A'] as const
type Axis = typeof AXES[number]
type ReviewStatus = 'PENDING' | 'UNRESOLVED' | 'PROVISIONAL_CODE' | 'REJECT_ENGINE_CANDIDATE'
type TemporalBasis = 'UNKNOWN' | 'PRE_OR_AT_ESCAPE' | 'RETROSPECTIVE_ABOUT_ESCAPE' | 'POST_ESCAPE_ONLY'

type AxisInput = {
  status: ReviewStatus
  code: string | null
  sourceIds: string[]
  temporalBasis: TemporalBasis
  temporalExplanation: string
  rationale: string
}
type EscapeInput = {
  status: 'PENDING' | 'ACCEPT_SOURCE_ANCHOR_AS_CANDIDATE' | 'REJECT_ENGINE_ANCHOR' | 'UNRESOLVED'
  anchorSourceIds: string[]
  justification: string
}
type Draft = {
  schemaVersion: 'HFA_DEV_AUTHOR_INPUT_V1'
  scope: 'V03_CAL_VAL_DEVELOPMENT_EXPOSED_SYNTHETIC_ONLY'
  scientificValidation: 'NOT_RUN'
  methodologicalGate: 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY'
  productionAuthorization: 'NOT_AUTHORIZED'
  inputContainsEnginePredictions: false
  caseId: string
  locale: string
  narrativeSha256: string
  methodologyReference: string
  sourceSentences: Array<{ sourceId: string; index: number; statement: string; sha256: string }>
  reviewStatus: 'DRAFT_UNREVIEWED' | 'HUMAN_INPUT_RECORDED_NOT_VERIFIED'
  reviewerReference: string | null
  escapePointReview: EscapeInput
  axes: Record<Axis, AxisInput>
}
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
const allowedCodes: Record<Axis, RegExp> = {
  P: /^P-[A-H]$/,
  O: /^O-[A-D]$/,
  A: /^A-[A-J]$/,
}

function devCase(caseId: string) {
  assert.match(caseId, /^V03-(CAL|VAL)-[0-9]{2}$/, 'SEALED_CASE_ID_FORBIDDEN')
  const c = [...calibrationCases, ...validationCases].find(x => x.caseId === caseId)
  assert.ok(c, 'CASE_NOT_IN_EXPOSED_DEVELOPMENT_COHORT')
  assert.equal(c.sourceType, 'synthetic', 'REAL_CASE_REQUIRES_SEPARATE_PROTOCOL')
  return c
}

export function generateDevelopmentAuthorWorksheet(caseId: string): Draft {
  const c = devCase(caseId)
  const emptyAxis = (): AxisInput => ({
    status: 'PENDING', code: null, sourceIds: [],
    temporalBasis: 'UNKNOWN', temporalExplanation: '', rationale: '',
  })
  return {
    schemaVersion: 'HFA_DEV_AUTHOR_INPUT_V1',
    scope: 'V03_CAL_VAL_DEVELOPMENT_EXPOSED_SYNTHETIC_ONLY',
    scientificValidation: 'NOT_RUN',
    methodologicalGate: 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY',
    productionAuthorization: 'NOT_AUTHORIZED',
    inputContainsEnginePredictions: false,
    caseId: c.caseId,
    locale: c.locale,
    narrativeSha256: sha(c.narrative),
    methodologyReference: 'A4R135_METHODOLOGY_CONTROL_BOARD; A4R137_POA_AT_ESCAPE_POINT',
    sourceSentences: splitNarrativeIntoSentenceRecords(c.narrative).map(r => ({
      sourceId: 'SOURCE-S' + String(r.sourceSentenceIndex).padStart(3, '0'),
      index: r.sourceSentenceIndex,
      statement: r.statement,
      sha256: sha(r.statement),
    })),
    reviewStatus: 'DRAFT_UNREVIEWED',
    reviewerReference: null,
    escapePointReview: { status: 'PENDING', anchorSourceIds: [], justification: '' },
    axes: { P: emptyAxis(), O: emptyAxis(), A: emptyAxis() },
  }
}

function exactKeys(value: unknown, keys: string[], name: string) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), 'INVALID_OBJECT_' + name)
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), 'UNEXPECTED_KEYS_' + name)
}
function meaningful(s: unknown, min: number, label: string) {
  assert.ok(typeof s === 'string' && s.trim().length >= min, 'MISSING_SUBSTANTIVE_' + label)
}
function sourceRefs(refs: unknown, validIds: Set<string>, label: string) {
  assert.ok(Array.isArray(refs), 'NOT_SOURCE_ID_ARRAY_' + label)
  assert.equal(new Set(refs).size, refs.length, 'DUPLICATE_SOURCE_ID_' + label)
  for (const ref of refs) assert.ok(typeof ref === 'string' && validIds.has(ref), 'UNVERIFIABLE_SOURCE_ID_' + label)
}

export function validateDevelopmentAuthorWorksheet(input: unknown) {
  const templateKeys = Object.keys(generateDevelopmentAuthorWorksheet('V03-CAL-07'))
  exactKeys(input, templateKeys, 'ROOT')
  const x = input as Draft
  const template = generateDevelopmentAuthorWorksheet(x.caseId)
  for (const key of [
    'schemaVersion', 'scope', 'scientificValidation', 'methodologicalGate',
    'productionAuthorization', 'inputContainsEnginePredictions', 'caseId',
    'locale', 'narrativeSha256', 'methodologyReference',
  ] as const) assert.deepEqual(x[key], template[key], 'UNAUTHORIZED_METADATA_CHANGE_' + key)
  assert.deepEqual(x.sourceSentences, template.sourceSentences, 'SOURCE_PROVENANCE_CHANGED')
  assert.ok(['DRAFT_UNREVIEWED', 'HUMAN_INPUT_RECORDED_NOT_VERIFIED'].includes(x.reviewStatus),
    'INVALID_REVIEW_STATUS')
  exactKeys(x.escapePointReview, ['status', 'anchorSourceIds', 'justification'], 'ESCAPE_POINT')
  exactKeys(x.axes, [...AXES], 'AXES')
  const validIds = new Set(template.sourceSentences.map(s => s.sourceId))
  const escape = x.escapePointReview
  assert.ok(['PENDING', 'ACCEPT_SOURCE_ANCHOR_AS_CANDIDATE', 'REJECT_ENGINE_ANCHOR', 'UNRESOLVED'].includes(escape.status),
    'INVALID_ESCAPE_STATUS')
  sourceRefs(escape.anchorSourceIds, validIds, 'ESCAPE_POINT')
  if (escape.status === 'PENDING') {
    assert.equal(escape.anchorSourceIds.length, 0, 'PENDING_ESCAPE_HAS_SOURCES')
    assert.equal(escape.justification, '', 'PENDING_ESCAPE_HAS_RATIONALE')
  } else {
    meaningful(escape.justification, 40, 'ESCAPE_JUSTIFICATION')
    if (escape.status === 'ACCEPT_SOURCE_ANCHOR_AS_CANDIDATE')
      assert.ok(escape.anchorSourceIds.length > 0, 'ACCEPTED_ESCAPE_REQUIRES_SOURCE')
  }
  let reviewedAxes = 0
  const reviewedAxisIds: Axis[] = []
  for (const axis of AXES) {
    const a = x.axes[axis]
    exactKeys(a, ['status', 'code', 'sourceIds', 'temporalBasis', 'temporalExplanation', 'rationale'], 'AXIS_' + axis)
    assert.ok(['PENDING', 'UNRESOLVED', 'PROVISIONAL_CODE', 'REJECT_ENGINE_CANDIDATE'].includes(a.status),
      'INVALID_AXIS_STATUS_' + axis)
    assert.ok(['UNKNOWN', 'PRE_OR_AT_ESCAPE', 'RETROSPECTIVE_ABOUT_ESCAPE', 'POST_ESCAPE_ONLY'].includes(a.temporalBasis),
      'INVALID_TEMPORAL_BASIS_' + axis)
    sourceRefs(a.sourceIds, validIds, axis)
    if (a.status === 'PENDING') {
      assert.equal(a.code, null, 'PENDING_HAS_CODE_' + axis)
      assert.equal(a.sourceIds.length, 0, 'PENDING_HAS_SOURCES_' + axis)
      assert.equal(a.temporalBasis, 'UNKNOWN', 'PENDING_HAS_TEMPORAL_CLAIM_' + axis)
      assert.equal(a.temporalExplanation, '', 'PENDING_HAS_TEMPORAL_RATIONALE_' + axis)
      assert.equal(a.rationale, '', 'PENDING_HAS_RATIONALE_' + axis)
      continue
    }
    reviewedAxes++
    reviewedAxisIds.push(axis)
    meaningful(a.rationale, 50, 'AXIS_RATIONALE_' + axis)
    if (a.status === 'PROVISIONAL_CODE') {
      assert.ok(typeof a.code === 'string' && allowedCodes[axis].test(a.code), 'NONCANONICAL_CODE_' + axis)
      assert.equal(escape.status, 'ACCEPT_SOURCE_ANCHOR_AS_CANDIDATE', 'CODE_REQUIRES_ANCHORED_ESCAPE_' + axis)
      assert.ok(a.sourceIds.length > 0, 'CODE_REQUIRES_PRIMARY_SOURCE_' + axis)
      assert.ok(['PRE_OR_AT_ESCAPE', 'RETROSPECTIVE_ABOUT_ESCAPE'].includes(a.temporalBasis),
        'CODE_REQUIRES_AT_ESCAPE_TEMPORAL_BASIS_' + axis)
      // Statement occurring later in the DOCUMENT is not necessarily a later EVENT;
      // it can be contemporaneous interview material. Demand an explicit explanation,
      // not a hidden chronological assumption.
      const anchor = template.sourceSentences.find(s => s.sourceId === escape.anchorSourceIds[0])
      const cited = template.sourceSentences.filter(s => a.sourceIds.includes(s.sourceId))
      if (a.temporalBasis === 'RETROSPECTIVE_ABOUT_ESCAPE' ||
        (anchor && cited.some(s => s.index > anchor.index))) {
        meaningful(a.temporalExplanation, 40, 'TEMPORAL_JUSTIFICATION_' + axis)
      }
    } else {
      assert.equal(a.code, null, 'NONCODE_REVIEW_CANNOT_SET_CODE_' + axis)
      // Rejection/unresolved remains documentary, never an automatic negative code.
    }
  }
  if (x.reviewStatus === 'DRAFT_UNREVIEWED') {
    assert.equal(x.reviewerReference, null, 'DRAFT_REVIEWER_REFERENCE_FORBIDDEN')
    assert.equal(escape.status, 'PENDING', 'DRAFT_ESCAPE_REVIEW_FORBIDDEN')
    assert.equal(reviewedAxes, 0, 'DRAFT_AXIS_DECISION_FORBIDDEN')
  } else {
    meaningful(x.reviewerReference, 8, 'REVIEWER_REFERENCE')
    assert.ok(reviewedAxes > 0 || escape.status !== 'PENDING', 'HUMAN_INPUT_EMPTY')
  }
  return {
    status: x.reviewStatus === 'DRAFT_UNREVIEWED' ? 'UNREVIEWED_TEMPLATE_VALID' : 'HUMAN_INPUT_FORMAT_VALID_NOT_VERIFIED',
    caseId: x.caseId,
    reviewedAxisIds,
    reviewedAxes,
    reviewedEscape: escape.status !== 'PENDING',
    independentScientificValidation: 'NOT_RUN',
    reviewerIdentityVerified: false,
    approvedForRuntime: false,
    releasedCodes: null,
    downstreamAllowed: false,
  } as const
}

/**
 * Print-only review instrument. No engine answers, no user sessions, no forms,
 * no JavaScript and no scientific/blind validation claims.
 */
export function renderDevelopmentAuthorWorksheetHtml(draft: Draft): string {
  assert.equal(draft.inputContainsEnginePredictions, false)
  assert.equal(draft.scientificValidation, 'NOT_RUN')
  const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] ?? char))
  const axisTitles: Record<Axis,string> = {
    P: 'Percepção — o que o operador percebia no ponto de fuga?',
    O: 'Objetivo — o que o operador pretendia atingir naquele instante?',
    A: 'Ação — como o operador tentava atingir o objetivo naquele instante?',
  }
  const sourceLines = draft.sourceSentences.map(s =>
    '<li><b>' + esc(s.sourceId) + '</b> — ' + esc(s.statement) + '</li>').join('')
  const blank = '<div class="blank" aria-hidden="true"></div>'
  const reviewParts = AXES.map(axis =>
    '<section><h2>' + esc(axis + ' · ' + axisTitles[axis]) + '</h2>' +
    '<p>Decisão: [ ] Não resolvido  [ ] Hipótese provisória  [ ] Rejeitar proposta do motor</p>' +
    '<p>Frases de origem (ID): _______________________________</p>' +
    '<p>Enquadramento temporal: [ ] Antes/no ponto de fuga  [ ] Retrospectivo sobre o ponto de fuga  [ ] Só posterior  [ ] Desconhecido</p>' +
    '<p>Justificativa metodológica (não inferir intenção somente de ação posterior):</p>' +
    blank + '</section>').join('')
  const css = [
    'body{margin:0;background:#fafbfc;color:#182433;font:15px/1.5 system-ui,Arial,sans-serif}',
    'main{max-width:850px;margin:0 auto;padding:36px}',
    'header{border-bottom:3px solid #253d59;padding-bottom:12px}',
    '.warning{border:2px solid #877139;padding:12px;margin:16px 0;background:#fffbe8}',
    '.sources{border:1px solid #bbc5d2;padding:16px;border-radius:7px}',
    '.sources li{margin:8px 0}.blank{height:90px;border-bottom:1px solid #bdc7d1;',
    'background:repeating-linear-gradient(to bottom,#fff 0px,#fff 28px,#d8e0e7 29px)}',
    'section{margin:20px 0;break-inside:avoid}h1{font-size:1.5rem}h2{font-size:1.1rem}',
    'small{color:#5b6776}code{overflow-wrap:anywhere}',
    '@media print{main{padding:0}.sources{break-inside:avoid}body{background:white}}',
  ].join('')
  return [
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    '<meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;; form-action &#39;none&#39;">',
    '<title>HFA · Ficha técnica de revisão sintética</title><style>', css, '</style></head><body><main>',
    '<header><h1>HFA · Ficha de revisão humana (desenvolvimento)</h1>',
    '<p><b>Caso:</b> ', esc(draft.caseId), ' · <b>SHA-256:</b> <code>', esc(draft.narrativeSha256), '</code></p></header>',
    '<p class="warning"><b>Não é validação científica nem avaliação cega.</b> Este documento usa apenas caso sintético de desenvolvimento previamente exposto. Não apresenta propostas nem códigos gerados pelo motor. Nenhuma resposta tem autoridade automática para alterar SERA.</p>',
    '<section class="sources"><h2>Fonte primária do caso sintético</h2><ol>', sourceLines, '</ol>',
    '<small>Índices representam ordem no documento, não necessariamente sequência cronológica do evento.</small></section>',
    '<section><h2>Ponto de fuga da operação segura</h2>',
    '<p>Indique a primeira passagem observável da operação segura para a condição insegura.</p>',
    '<p>Decisão: [ ] Aceitar âncora como candidata  [ ] Rejeitar  [ ] Não resolvido</p>',
    '<p>Frase(s) de origem (ID): _______________________________</p>',
    '<p>Justificativa:</p>', blank, '</section>',
    reviewParts,
    '<footer><p><b>Regra:</b> não usar ações de recuperação ou consequências posteriores como evidência causal do ponto de fuga. Uma declaração retrospectiva sobre estado anterior requer justificativa temporal explícita.</p>',
    '<small>Referência: A4R135/A4R137. Identidade do revisor, adequação da evidência e julgamento científico não são verificados por este instrumento.</small></footer>',
    '</main></body></html>',
  ].join('')
}

function outputPathAllowed(destination: string) {
  assert.ok(path.isAbsolute(destination), 'ABSOLUTE_DESTINATION_REQUIRED')
  const realParent = path.resolve(path.dirname(destination))
  assert.ok(!realParent.startsWith(ROOT + path.sep) && realParent !== ROOT,
    'DO_NOT_WRITE_WORKSHEET_INSIDE_REPOSITORY')
  assert.ok(!existsSync(destination), 'DO_NOT_OVERWRITE_REVIEW_FILE')
  mkdirSync(realParent, { recursive: true })
}
function runCli(argv: string[]) {
  if ((argv.length === 4 || argv.length === 6) && argv[0] === '--case' && argv[2] === '--out') {
    assert.ok(argv.length === 4 || argv[4] === '--html', 'EXPECTED_HTML_FLAG')
    const result = generateDevelopmentAuthorWorksheet(argv[1])
    outputPathAllowed(argv[3])
    if (argv[5]) {
      assert.notEqual(argv[5], argv[3], 'OUTPUT_PATH_COLLISION')
      outputPathAllowed(argv[5])
    }
    writeFileSync(argv[3], JSON.stringify(result, null, 2) + '\n', { flag: 'wx', mode: 0o600 })
    if (argv[5]) writeFileSync(argv[5], renderDevelopmentAuthorWorksheetHtml(result),
      { flag: 'wx', mode: 0o600 })
    console.log(JSON.stringify({
      generated: argv[3],
      html: argv[5] ?? null,
      ...validateDevelopmentAuthorWorksheet(result),
    }))
    return
  }
  if (argv.length === 2 && argv[0] === '--validate') {
    const result = validateDevelopmentAuthorWorksheet(JSON.parse(readFileSync(argv[1], 'utf8')))
    console.log(JSON.stringify(result))
    return
  }
  throw new Error('USE: --case V03-CAL-07 --out /absolute/path.json [--html /absolute/path.html] OR --validate /absolute/path.json')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli(process.argv.slice(2))
