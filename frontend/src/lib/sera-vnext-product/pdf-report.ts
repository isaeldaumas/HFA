// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit/js/pdfkit.standalone.js') as typeof import('pdfkit')

import type { SeraCanonicalPath, SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { localizeActor, localizeRationale } from '@/lib/sera-vnext/engine-v0/localization'
import { SERA_PT_V1_TREE } from '@/lib/sera-vnext/canonical-tree/sera-pt-v1'
import { buildCanonicalFlowVisualModel } from '@/lib/sera-vnext/canonical-flow-visual'
import { buildExecutiveSummary, friendlyAnswerLabel, friendlyNodeLabel, hfacsBridgeLevelLabel, preconditionLevelLabel, preconditionMethodologyMatchLabel } from '@/lib/sera-vnext/presentation'
import { SERA_PRECONDITION_META } from '@/lib/sera-vnext/precondition-taxonomy'
import { buildSeraHfacsBridge } from '@/lib/sera-vnext/hfacs-bridge'
import { buildSeraActionSuggestions } from '@/lib/corrective-actions/sera-suggestions'
import { buildPreconditionContextReadout } from '@/lib/sera-vnext/precondition-presentation'
import type {
  SeraVNextAnalysisRecord,
  SeraVNextReviewRecord,
} from './types'
import type { SeraReviewerOutput } from './reviewer-output'
import type { SeraVNextProductVersionSet } from './versioning'

type Doc = InstanceType<typeof PDFDocument>

type DetailedPdfInput = {
  analysis: SeraVNextAnalysisRecord
  reviewerOutput: SeraReviewerOutput
  reviews: SeraVNextReviewRecord[]
  versions: SeraVNextProductVersionSet
}

function value(v: unknown, fallback = '-'): string {
  if (v === null || v === undefined || v === '') return fallback
  return String(v)
}

function normalizeLandmarkForDisplay(v: string | null | undefined): string {
  return (v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '')
}

function distinctLaterLandmark(output: SeraVNextEngineOutput): string | null {
  const first = output.escapePoint.firstDepartureCandidate ?? output.escapePoint.statement
  const later = output.escapePoint.criticalUnsafeActCandidate
  if (!later) return null
  if (first && normalizeLandmarkForDisplay(first) === normalizeLandmarkForDisplay(later)) return null
  return later
}

const PDF_COLORS = {
  navy: '#123B5D',
  blue: '#2563A6',
  cyan: '#0E7490',
  green: '#16734B',
  greenSoft: '#ECF8F1',
  amber: '#9A6410',
  amberSoft: '#FFF8E7',
  red: '#A13A3A',
  ink: '#233444',
  muted: '#667786',
  line: '#D7E0E8',
  soft: '#F5F8FB',
  white: '#FFFFFF',
}

function pageContentWidth(doc: Doc): number {
  return doc.page.width - doc.page.margins.left - doc.page.margins.right
}

function pageBottom(doc: Doc): number {
  return doc.page.height - doc.page.margins.bottom - 16
}

function keepTogether(doc: Doc, height = 110): void {
  if (doc.y + height > pageBottom(doc)) doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
}

function heading(doc: Doc, title: string): void {
  keepTogether(doc, 64)
  doc.moveDown(0.6)
  doc.font('Helvetica-Bold').fontSize(17).fillColor(PDF_COLORS.navy).text(title, doc.page.margins.left, doc.y, { width: pageContentWidth(doc), lineGap: 1.5 })
  doc.moveDown(0.18)
  doc.strokeColor(PDF_COLORS.line).lineWidth(0.8)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke()
  doc.moveDown(0.55)
}

function subheading(doc: Doc, title: string): void {
  keepTogether(doc, 38)
  doc.font('Helvetica-Bold').fontSize(11.5).fillColor('#355267').text(title, doc.page.margins.left, doc.y, { width: pageContentWidth(doc), lineGap: 1 })
  doc.moveDown(0.18)
}

function cleanDisplayText(text: string): string {
  return text
    .replace(/^[\s•▪◦ðØ�]+/u, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/(?:ðØ|ï¿½|�)+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function body(doc: Doc, text: string, align: 'left' | 'justify' = 'left'): void {
  doc.font('Helvetica').fontSize(10.5).fillColor(PDF_COLORS.ink).text(cleanDisplayText(text || '-'), doc.page.margins.left, doc.y, {
    width: pageContentWidth(doc),
    align,
    lineGap: 3,
  })
  doc.x = doc.page.margins.left
}

function meta(doc: Doc, label: string, data: string): void {
  keepTogether(doc, 26)
  const x = doc.page.margins.left
  const y = doc.y
  doc.font('Helvetica-Bold').fontSize(9.4).fillColor(PDF_COLORS.muted).text(label + ': ', x, y, { width: pageContentWidth(doc), continued: true })
  doc.font('Helvetica').fontSize(9.4).fillColor(PDF_COLORS.ink).text(data || '-', { lineGap: 1.6 })
  doc.x = x
}

function bullets(doc: Doc, items: string[], empty = '-'): void {
  if (!items.length) {
    doc.font('Helvetica-Oblique').fontSize(9.4).fillColor('#768695').text(empty, { lineGap: 2 })
    return
  }

  for (const item of items) {
    const cleaned = cleanDisplayText(item)
    const width = pageContentWidth(doc) - 20
    doc.font('Helvetica').fontSize(9.6)
    const h = doc.heightOfString(cleaned, { width, lineGap: 2.4 }) + 10
    keepTogether(doc, h)
    const y = doc.y + 2
    doc.circle(doc.page.margins.left + 5, y + 5, 2.2).fill(PDF_COLORS.blue)
    doc.fillColor(PDF_COLORS.ink).text(cleaned, doc.page.margins.left + 15, y, {
      width,
      lineGap: 2.4,
    })
    doc.y = Math.max(doc.y, y + h)
  }
}

function infoCard(
  doc: Doc,
  title: string,
  text: string,
  options: { accent?: string; fill?: string; label?: string; minHeight?: number } = {},
): void {
  const x = doc.page.margins.left
  const w = pageContentWidth(doc)
  const innerW = w - 28
  const accent = options.accent ?? PDF_COLORS.blue
  const fill = options.fill ?? PDF_COLORS.soft
  doc.font('Helvetica').fontSize(10.4)
  const textH = doc.heightOfString(cleanDisplayText(text || '-'), { width: innerW, lineGap: 2.8 })
  const titleH = title ? 18 : 0
  const labelH = options.label ? 15 : 0
  const h = Math.max(options.minHeight ?? 70, 26 + titleH + labelH + textH)
  keepTogether(doc, h + 10)
  const y = doc.y
  doc.roundedRect(x, y, w, h, 8).fillAndStroke(fill, PDF_COLORS.line)
  doc.rect(x, y, 5, h).fill(accent)
  let cy = y + 12
  if (options.label) {
    doc.font('Helvetica-Bold').fontSize(8.7).fillColor(accent).text(options.label.toUpperCase(), x + 16, cy, { width: innerW })
    cy += 15
  }
  if (title) {
    doc.font('Helvetica-Bold').fontSize(11.4).fillColor(PDF_COLORS.navy).text(title, x + 16, cy, { width: innerW, lineGap: 1.5 })
    cy += 19
  }
  doc.font('Helvetica').fontSize(10.4).fillColor(PDF_COLORS.ink).text(cleanDisplayText(text || '-'), x + 16, cy, {
    width: innerW,
    lineGap: 2.8,
  })
  doc.y = y + h + 10
  doc.x = doc.page.margins.left
}

function statRow(doc: Doc, items: Array<{ label: string; value: string; accent?: string }>): void {
  const x = doc.page.margins.left
  const w = pageContentWidth(doc)
  const gap = 8
  const cardW = (w - gap * (items.length - 1)) / items.length
  const h = 62
  keepTogether(doc, h + 12)
  const y = doc.y
  items.forEach((item, index) => {
    const cx = x + index * (cardW + gap)
    doc.roundedRect(cx, y, cardW, h, 7).fillAndStroke('#F8FAFC', PDF_COLORS.line)
    doc.font('Helvetica-Bold').fontSize(8.2).fillColor(item.accent ?? PDF_COLORS.muted)
      .text(item.label.toUpperCase(), cx + 10, y + 10, { width: cardW - 20, align: 'center' })
    doc.font('Helvetica-Bold').fontSize(item.value.length > 26 ? 10.5 : 12.3).fillColor(PDF_COLORS.navy)
      .text(item.value, cx + 9, y + 28, { width: cardW - 18, height: 27, align: 'center', lineGap: 1 })
  })
  doc.y = y + h + 12
  doc.x = doc.page.margins.left
}

function axisAccent(axis: string): { accent: string; fill: string } {
  if (axis === 'P') return { accent: '#087B8F', fill: '#ECFBFD' }
  if (axis === 'O') return { accent: '#A86408', fill: '#FFF8E8' }
  return { accent: '#B33452', fill: '#FFF1F4' }
}

function axisSummaryRow(
  doc: Doc,
  axes: Array<{ id: string; title: string; code: string; meaning: string }>,
): void {
  const x = doc.page.margins.left
  const w = pageContentWidth(doc)
  const gap = 9
  const cardW = (w - gap * 2) / 3
  doc.font('Helvetica').fontSize(8.9)
  const meaningHeight = Math.max(...axes.map((axis) => doc.heightOfString(cleanDisplayText(axis.meaning), { width: cardW - 22, lineGap: 1.6 })))
  const h = Math.max(110, 66 + meaningHeight)
  keepTogether(doc, h + 12)
  const y = doc.y
  axes.forEach((axis, index) => {
    const { accent, fill } = axisAccent(axis.id)
    const cx = x + index * (cardW + gap)
    doc.roundedRect(cx, y, cardW, h, 8).fillAndStroke(fill, '#D5DEE6')
    doc.font('Helvetica-Bold').fontSize(9).fillColor(accent).text(axis.title.toUpperCase(), cx + 11, y + 10, { width: cardW - 22 })
    doc.font('Helvetica-Bold').fontSize(20).fillColor(PDF_COLORS.navy).text(axis.code, cx + 11, y + 28, { width: cardW - 22 })
    doc.font('Helvetica').fontSize(8.9).fillColor(PDF_COLORS.ink).text(cleanDisplayText(axis.meaning), cx + 11, y + 56, {
      width: cardW - 22,
      lineGap: 1.6,
    })
  })
  doc.y = y + h + 12
  doc.x = doc.page.margins.left
}

function applyPageChrome(doc: Doc, title: string, pt: boolean): void {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i)
    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    if (i > 0) {
      doc.font('Helvetica-Bold').fontSize(7.8).fillColor('#758493')
        .text('HFA / SERA  -  ' + title, left, 18, { width: right - left, lineBreak: false })
      doc.strokeColor('#E1E7ED').lineWidth(0.6).moveTo(left, 31).lineTo(right, 31).stroke()
    }
    const footerY = pageBottom(doc) + 7
    doc.strokeColor('#E1E7ED').lineWidth(0.6).moveTo(left, footerY - 5).lineTo(right, footerY - 5).stroke()
    doc.font('Helvetica').fontSize(7.2).fillColor('#7A8996')
      .text(`${pt ? 'Relatório de análise de fatores humanos' : 'Human factors analysis report'}`, left, footerY, { lineBreak: false })
    doc.text(`${pt ? 'Página' : 'Page'} ${i - range.start + 1} ${pt ? 'de' : 'of'} ${range.count}`, right - 92, footerY, { width: 92, align: 'right', lineBreak: false })
  }
}

function reviewStatusLabel(value: string, pt: boolean): string {
  const ptMap: Record<string, string> = {
    NOT_REVIEWED: 'Aguardando revisão',
    IN_REVIEW: 'Em revisão',
    WORKING_HYPOTHESIS_ACCEPTED: 'Hipótese de trabalho aceita',
    WORKING_HYPOTHESIS_REJECTED: 'Hipótese de trabalho rejeitada',
    MORE_EVIDENCE_REQUIRED: 'Mais informações necessárias',
    REANALYSIS_REQUIRED: 'Reanálise necessária',
    REVIEW_COMPLETED_NON_FINAL: 'Revisão concluída - resultado não final',
  }
  const enMap: Record<string, string> = {
    NOT_REVIEWED: 'Awaiting review', IN_REVIEW: 'Under review', WORKING_HYPOTHESIS_ACCEPTED: 'Working hypothesis accepted',
    WORKING_HYPOTHESIS_REJECTED: 'Working hypothesis rejected', MORE_EVIDENCE_REQUIRED: 'More evidence required',
    REANALYSIS_REQUIRED: 'Reanalysis required', REVIEW_COMPLETED_NON_FINAL: 'Review completed - non-final result',
  }
  return (pt ? ptMap : enMap)[value] ?? value.replaceAll('_', ' ').toLowerCase()
}

function hfacsLabel(value: string, pt: boolean): string {
  if (!pt) return value
  const map: Record<string, string> = {
    'Physical–mental limitations': 'Limitações físicas ou mentais',
    'Physical–mental limitation': 'Limitação física ou mental',
    'Personal readiness': 'Prontidão pessoal',
    'Knowledge–information': 'Conhecimento e informação',
    'Attention–memory': 'Atenção e memória',
    'Adverse mental state': 'Estado mental adverso',
    'Adverse mental states': 'Estados mentais adversos',
    'Perceptual': 'Perceptivo',
    'Violation – routine': 'Violação rotineira',
    'Violation – exceptional': 'Violação excepcional',
    'Supervisory violations': 'Violações de supervisão',
    'Decision': 'Decisão',
    'Technique': 'Técnica',
    'Adverse physiological states': 'Estados fisiológicos adversos',
    'Interpersonal resource management': 'Gerenciamento de recursos interpessoais',
    'Training': 'Treinamento',
    'Qualification': 'Qualificação',
    'Organizational process': 'Processo organizacional',
    'Planned inappropriate operations': 'Operações planejadas inadequadamente',
    'Equipment': 'Equipamento',
    'Workspace': 'Espaço de trabalho',
    'Environment': 'Ambiente',
    'Inadequate supervision': 'Supervisão inadequada',
    'Failed to correct a problem': 'Falha em corrigir um problema',
    'Organizational climate': 'Clima organizacional',
    'Resource management': 'Gerenciamento de recursos',
    'No direct AGA 135 HFACS equivalent identified by Hendy': 'Sem correspondência direta identificada na taxonomia HFACS utilizada',
  }
  return map[value] ?? value
}

function confidenceLabel(value: string | undefined | null, pt: boolean): string {
  if (value === 'HIGH') return pt ? 'ALTA' : 'HIGH'
  if (value === 'MEDIUM') return pt ? 'MÉDIA' : 'MEDIUM'
  if (value === 'LOW') return pt ? 'BAIXA' : 'LOW'
  return value ?? '-'
}


function landmarkRelationshipLabel(value: SeraVNextEngineOutput['escapePoint']['anchorBasis'], pt: boolean): string {
  if (value === 'FIRST_DEPARTURE_AND_CRITICAL_ACT') return pt ? 'Coincidem no mesmo ato/condição.' : 'Both landmarks coincide in the same act/condition.'
  if (value === 'FIRST_DEPARTURE_PRIMARY') return pt ? 'O ponto de fuga SERA é o primeiro desvio seguro→inseguro e ancora P/O/A; o ato crítico posterior é preservado apenas como evolução da ocorrência.' : 'The SERA escape point is the first safe→unsafe departure and anchors P/O/A; the later critical act is retained only as occurrence evolution.'
  if (value === 'FIRST_DEPARTURE_ONLY') return pt ? 'Foi identificado apenas o primeiro desvio da operação segura.' : 'Only the first departure from safe operation was established.'
  return pt ? 'Relação ainda não determinada.' : 'Relationship not yet resolved.'
}

function candidateStatusLabel(value: string, pt: boolean): string {
  const ptMap: Record<string, string> = {
    CANDIDATE: 'CANDIDATO', NO_FAILURE: 'SEM FALHA INDEPENDENTE', INSUFFICIENT_EVIDENCE: 'EVIDÊNCIA INSUFICIENTE',
    UNRESOLVED: 'NÃO RESOLVIDO', PROGRESSIVE_ZONE: 'ZONA PROGRESSIVA', NO_HUMAN_ESCAPE_POINT: 'SEM PONTO DE FUGA HUMANO',
  }
  const enMap: Record<string, string> = {
    CANDIDATE: 'CANDIDATE', NO_FAILURE: 'NO INDEPENDENT FAILURE', INSUFFICIENT_EVIDENCE: 'INSUFFICIENT EVIDENCE',
    UNRESOLVED: 'UNRESOLVED', PROGRESSIVE_ZONE: 'PROGRESSIVE ZONE', NO_HUMAN_ESCAPE_POINT: 'NO HUMAN ESCAPE POINT',
  }
  return (pt ? ptMap : enMap)[value] ?? value
}

function axisLabel(axis: string, pt: boolean): string {
  if (axis === 'P') return pt ? 'Percepção (P)' : 'Perception (P)'
  if (axis === 'O') return pt ? 'Objetivo (O)' : 'Objective (O)'
  return pt ? 'Ação (A)' : 'Action (A)'
}

function axisOutput(output: SeraVNextEngineOutput, axis: string) {
  if (axis === 'P') return output.axes.perception
  if (axis === 'O') return output.axes.objective
  return output.axes.action
}

function stripAxisPrefix(value: string | null | undefined): string | null {
  if (!value) return null
  const colon = value.indexOf(':')
  if (colon > 0 && /ponto de fuga|escape point/i.test(value.slice(0, colon))) return value.slice(colon + 1).trim() || null
  return value.trim() || null
}

function pathAnswerText(answer: SeraCanonicalPath['answers'][number], path: SeraCanonicalPath, output: SeraVNextEngineOutput, pt: boolean): string {
  if (answer.responseText) return answer.responseText
  if (answer.answer === 'START') {
    return stripAxisPrefix(axisOutput(output, path.axis).statementAtEscapePoint)
      ?? (pt ? 'Resposta descritiva não registrada; reanalise o evento para atualizar este nó.' : 'Descriptive response not recorded; reanalyze the event to update this node.')
  }
  return friendlyAnswerLabel(answer.answer, pt)
}

function canonicalQuestion(answer: SeraCanonicalPath['answers'][number], pt: boolean): string {
  return pt
    ? (SERA_PT_V1_TREE.nodes.find((item) => item.nodeId === answer.nodeId)?.question ?? answer.question)
    : (answer.exactQuestionTextENAnchor ?? answer.question)
}

function didacticReason(nodeId: string, answer: string, fallback: string | undefined, pt: boolean): string {
  if (!pt) return fallback ?? 'The answer was determined by the usable evidence available at this node.'
  const key = nodeId + ':' + answer
  const map: Record<string, string> = {
    'P_ROOT:START': 'A primeira etapa registra o estado que o operador acreditava existir. As etapas seguintes verificam se essa percepção correspondia adequadamente à situação real.',
    'P_ASSESSMENT:NÃO': 'A avaliação da situação não correspondia ao estado real; por isso a árvore segue para identificar o mecanismo perceptivo associado.',
    'P_ASSESSMENT:SIM': 'A evidência sustenta avaliação adequada da situação; não há falha perceptiva independente neste eixo.',
    'P_CAPABILITY:SIM': 'Havia capacidade e meios para perceber a situação; a análise segue para pressão temporal e qualidade da informação.',
    'P_CAPABILITY:NÃO_SENSORIAL': 'A evidência localiza a falha em limitação sensorial ou perceptiva.',
    'P_CAPABILITY:NÃO_CONHECIMENTO': 'A evidência localiza a falha em conhecimento necessário para interpretar a situação.',
    'P_TIME_PRESSURE:NÃO': 'Não há evidência de pressão de tempo excessiva dominante; a análise segue para ambiguidade e disponibilidade da informação.',
    'P_TIME_PRESSURE:SIM_ATENCAO': 'A pressão de tempo afetou principalmente a atenção disponível para a tarefa.',
    'P_TIME_PRESSURE:SIM_GERENCIAMENTO': 'A pressão de tempo afetou principalmente o gerenciamento temporal da tarefa.',
    'P_INFORMATION_AMBIGUOUS:NÃO': 'A informação relevante não era ilusória ou ambígua; resta verificar se estava disponível e correta.',
    'P_INFORMATION_AMBIGUOUS:SIM': 'A evidência sustenta que a informação era ilusória ou ambígua.',
    'P_INFORMATION_AVAILABLE:SIM': 'A informação necessária estava disponível e correta, mas não foi monitorada ou integrada adequadamente; isso conduz a P-G.',
    'P_INFORMATION_AVAILABLE:NÃO': 'A informação necessária não estava disponível ou correta; isso conduz ao ramo de comunicação/informação.',
    'O_ROOT:START': 'A primeira etapa explicita o objetivo pretendido pelo operador; os nós seguintes verificam compatibilidade com regras, procedimentos e gerenciamento do risco.',
    'O_RULES:SIM': 'O objetivo pretendido era compatível com regras e procedimentos; a árvore segue para verificar se havia uma meta insegura independente.',
    'O_RULES:NÃO': 'Há evidência de objetivo incompatível com regras ou procedimentos; a árvore distingue o padrão de violação aplicável.',
    'O_MANAGED_RISK:NÃO': 'Não foi demonstrado objetivo inseguro independente; mantém-se O-A, sem falha própria de objetivo.',
    'O_MANAGED_RISK:SIM': 'Há evidência de objetivo que, embora compatível com regras gerais, não gerenciava adequadamente o risco operacional.',
    'A_ROOT:START': 'A primeira etapa explicita como o operador tentou alcançar o objetivo; os nós seguintes avaliam a execução e a adequação da ação.',
    'A_IMPLEMENTED:SIM': 'A ação foi implementada como pretendida; a árvore então verifica se existia falha de ação independente.',
    'A_IMPLEMENTED:NÃO_DESLIZE_LAPSO_ERRO': 'Há evidência de deslize, omissão ou lapso específico na execução da ação.',
    'A_IMPLEMENTED:NÃO_FEEDBACK': 'Há evidência de falha de feedback ou verificação durante a própria execução.',
    'A_CORRECT:SIM': 'Não foi demonstrado mecanismo independente de ação inadequada; a ação permaneceu coerente com a percepção e o objetivo do ator, conduzindo a A-A.',
    'A_CORRECT:NÃO': 'A ação implementada era inadequada por mecanismo próprio; a árvore segue para capacidade, seleção e feedback da resposta.',
  }
  return map[key] ?? fallback ?? 'A resposta foi determinada pela evidência utilizável disponível neste nó.'
}

function renderAxisDidacticPage(
  doc: Doc,
  path: SeraCanonicalPath,
  output: SeraVNextEngineOutput,
  pt: boolean,
): void {
  const axis = axisOutput(output, path.axis)
  const L = (ptText: string, enText: string) => pt ? ptText : enText
  const { accent } = axisAccent(path.axis)
  const code = axis.proposedCode ?? L('Não resolvido', 'Unresolved')
  const title = axisLabel(path.axis, pt)

  doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
  const x = doc.page.margins.left
  const w = pageContentWidth(doc)
  doc.font('Helvetica-Bold').fontSize(9).fillColor(accent).text(L('ANÁLISE SERA', 'SERA ANALYSIS'))
  doc.moveDown(0.35)
  doc.font('Helvetica-Bold').fontSize(20).fillColor(PDF_COLORS.navy).text(`${title} - ${code}`)
  doc.font('Helvetica').fontSize(10).fillColor(PDF_COLORS.muted)
    .text(L('Leitura do caminho destacado na árvore completa da página anterior. Cada etapa apresenta a pergunta canônica, a resposta deste evento e o motivo do ramo seguido.', 'Reading of the path highlighted in the complete tree on the previous page. Each step shows the canonical question, this event answer, and why that branch was followed.'), { lineGap: 2 })
  doc.moveDown(0.55)

  // The axis result and meaning are already summarized on the cover and in the tree title.
  // Do not repeat them here; use this page only to explain the traversed path.


  for (let index = 0; index < path.answers.length; index += 1) {
    const answer = path.answers[index]
    const q = canonicalQuestion(answer, pt)
    const response = pathAnswerText(answer, path, output, pt)
    const rationale = didacticReason(
      answer.nodeId,
      answer.answer,
      localizeRationale(answer.rationale ?? '', pt ? 'pt-BR' : 'en'),
      pt,
    )
    const cardW = w - 38
    doc.font('Helvetica').fontSize(9.5)
    const qH = doc.heightOfString(q, { width: cardW - 28, lineGap: 2.1 })
    doc.font('Helvetica-Bold').fontSize(9.8)
    const aH = doc.heightOfString(`${L('Resposta', 'Answer')}: ${response}`, { width: cardW - 28, lineGap: 2.2 })
    doc.font('Helvetica').fontSize(9.1)
    const rH = doc.heightOfString(`${L('Por que', 'Why')}: ${rationale}`, { width: cardW - 28, lineGap: 2 })
    const h = Math.max(82, 45 + qH + aH + rH)
    if (doc.y + h + 10 > pageBottom(doc)) {
      doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
      doc.font('Helvetica-Bold').fontSize(9).fillColor(accent).text(`${title} - ${code} | ${L('continuação', 'continued')}`)
      doc.moveDown(0.6)
    }
    const y = doc.y
    doc.circle(x + 13, y + 17, 10).fill(accent)
    doc.font('Helvetica-Bold').fontSize(8.8).fillColor(PDF_COLORS.white)
      .text(String(index + 1), x + 6.5, y + 11.5, { width: 13, align: 'center', lineBreak: false })
    const cx = x + 34
    doc.roundedRect(cx, y, cardW, h, 8).fillAndStroke(PDF_COLORS.white, '#D5DEE6')
    doc.font('Helvetica-Bold').fontSize(10.6).fillColor(PDF_COLORS.navy)
      .text(friendlyNodeLabel(answer.nodeId, pt), cx + 14, y + 10, { width: cardW - 28 })
    let ty = y + 27
    doc.font('Helvetica').fontSize(9.5).fillColor(PDF_COLORS.muted)
      .text(q, cx + 14, ty, { width: cardW - 28, lineGap: 2.1 })
    ty += qH + 6
    doc.font('Helvetica-Bold').fontSize(9.8).fillColor(PDF_COLORS.ink)
      .text(`${L('Resposta', 'Answer')}: ${response}`, cx + 14, ty, { width: cardW - 28, lineGap: 2.2 })
    ty += aH + 6
    doc.font('Helvetica').fontSize(9.1).fillColor('#536676')
      .text(`${L('Por que', 'Why')}: ${rationale}`, cx + 14, ty, { width: cardW - 28, lineGap: 2 })
    doc.y = y + h + 10
  }
}

function renderCanonicalTreePage(doc: Doc, path: SeraCanonicalPath, pt: boolean): void {
  const model = buildCanonicalFlowVisualModel(path, pt)
  const title = axisLabel(path.axis, pt)
  const { accent, fill: accentLight } = axisAccent(path.axis)
  const code = path.candidateCode ?? (pt ? 'não resolvido' : 'unresolved')
  doc.addPage({ size: 'A4', layout: 'landscape', margin: 34 })
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const width = right - left
  const top = 42
  const bottom = doc.page.height - doc.page.margins.bottom - 34

  doc.font('Helvetica-Bold').fontSize(18).fillColor(PDF_COLORS.navy)
    .text(`${pt ? 'Árvore SERA completa' : 'Complete SERA tree'} - ${title} - ${code}`, left, top, { width })
  doc.font('Helvetica').fontSize(9.4).fillColor(PDF_COLORS.muted)
    .text(pt
      ? 'A topologia canônica completa é preservada. Ramos não percorridos permanecem visíveis em cinza; o caminho deste evento é destacado e a classificação alcançada aparece em verde. As perguntas completas, respostas e justificativas usam a mesma numeração na página seguinte.'
      : 'The complete canonical topology is preserved. Branches not taken remain visible in gray; this event path is highlighted and the reached classification appears in green. Full questions, answers, and rationales use the same numbering on the next page.', left, top + 25, { width, lineGap: 2 })

  const legendY = top + 60
  const legendItems = [
    { fill: accentLight, stroke: accent, label: pt ? 'Caminho seguido' : 'Traversed path' },
    { fill: '#FFFFFF', stroke: '#A8B3BF', label: pt ? 'Caminho não seguido' : 'Path not taken' },
    { fill: PDF_COLORS.greenSoft, stroke: PDF_COLORS.green, label: pt ? 'Classificação alcançada' : 'Reached classification' },
  ]
  let lx = left
  for (const item of legendItems) {
    doc.roundedRect(lx, legendY, 22, 10, 2).fillAndStroke(item.fill, item.stroke)
    doc.font('Helvetica').fontSize(8).fillColor(PDF_COLORS.muted)
      .text(item.label, lx + 29, legendY + 1, { width: 132, lineBreak: false })
    lx += 176
  }

  const treeTop = legendY + 30
  const treeBottom = bottom
  const children = new Map<string, typeof model.edges>()
  const incoming = new Set<string>()
  for (const edge of model.edges) {
    children.set(edge.from, [...(children.get(edge.from) ?? []), edge])
    incoming.add(edge.to)
  }
  const root = model.nodes.find((node) => node.kind === 'question' && !incoming.has(node.id))
  if (!root) return

  const depth = new Map<string, number>()
  const visitDepth = (id: string, level: number) => {
    if ((depth.get(id) ?? -1) >= level) return
    depth.set(id, level)
    for (const edge of children.get(id) ?? []) visitDepth(edge.to, level + 1)
  }
  visitDepth(root.id, 0)

  const leaves = model.nodes.filter((node) => (children.get(node.id) ?? []).length === 0)
  const leafOrder: string[] = []
  const collectLeaves = (id: string) => {
    const outgoing = children.get(id) ?? []
    if (!outgoing.length) {
      if (!leafOrder.includes(id)) leafOrder.push(id)
      return
    }
    for (const edge of outgoing) collectLeaves(edge.to)
  }
  collectLeaves(root.id)
  for (const leaf of leaves) if (!leafOrder.includes(leaf.id)) leafOrder.push(leaf.id)

  const maxDepth = Math.max(...depth.values(), 1)
  const nodeTop = treeTop + 8
  const nodeBottom = treeBottom - 4
  const levelGap = Math.max(50, (nodeBottom - nodeTop - 50) / maxDepth)
  const leafStep = width / Math.max(leafOrder.length, 1)
  const xCenter = new Map<string, number>()
  leafOrder.forEach((id, index) => xCenter.set(id, left + leafStep * (index + 0.5)))
  const resolveX = (id: string): number => {
    const cached = xCenter.get(id)
    if (cached !== undefined) return cached
    const xs = (children.get(id) ?? []).map((edge) => resolveX(edge.to))
    const v = xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : left + width / 2
    xCenter.set(id, v)
    return v
  }
  resolveX(root.id)

  const geom = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const node of model.nodes) {
    const d = depth.get(node.id)
    if (d === undefined) continue
    const terminal = node.kind === 'terminal'
    const rootNode = node.sourceId.endsWith('_ROOT')
    const nodeW = terminal ? Math.min(84, Math.max(58, leafStep - 7)) : rootNode ? 126 : 106
    const nodeH = terminal ? 46 : rootNode ? 38 : 54
    geom.set(node.id, { x: resolveX(node.id) - nodeW / 2, y: nodeTop + d * levelGap, w: nodeW, h: nodeH })
  }

  for (const edge of model.edges) {
    const a = geom.get(edge.from)
    const b = geom.get(edge.to)
    if (!a || !b) continue
    const x1 = a.x + a.w / 2
    const y1 = a.y + a.h
    const x2 = b.x + b.w / 2
    const y2 = b.y
    const color = edge.active ? accent : '#B7C1CB'
    doc.strokeColor(color).lineWidth(edge.active ? 2.5 : 1)
      .moveTo(x1, y1).lineTo(x1, y1 + 9).lineTo(x2, y2 - 9).lineTo(x2, y2).stroke()
    doc.fillColor(color).polygon([x2 - 3, y2 - 5], [x2 + 3, y2 - 5], [x2, y2]).fill()
    if (edge.label) {
      const labelX = x1 + (x2 - x1) * 0.67 - 28
      const labelY = y1 + (y2 - y1) * 0.54 - 4
      doc.font(edge.active ? 'Helvetica-Bold' : 'Helvetica').fontSize(7)
        .fillColor(edge.active ? accent : '#71808D')
        .text(edge.label, labelX, labelY, { width: 56, align: 'center', lineBreak: false })
    }
  }

  for (const node of model.nodes) {
    const g = geom.get(node.id)
    if (!g) continue
    const rootNode = node.sourceId.endsWith('_ROOT')
    const fill = node.selected ? PDF_COLORS.greenSoft : node.active ? accentLight : '#FFFFFF'
    const stroke = node.selected ? PDF_COLORS.green : node.active ? accent : '#A8B3BF'
    doc.lineWidth(node.active || node.selected ? 2 : 1)
    if (node.kind === 'terminal') {
      doc.roundedRect(g.x, g.y, g.w, g.h, 9).fillAndStroke(fill, stroke)
    } else if (rootNode) {
      doc.roundedRect(g.x, g.y, g.w, g.h, 8).fillAndStroke(fill, stroke)
    } else {
      doc.polygon(
        [g.x + g.w / 2, g.y],
        [g.x + g.w, g.y + g.h / 2],
        [g.x + g.w / 2, g.y + g.h],
        [g.x, g.y + g.h / 2],
      ).fillAndStroke(fill, stroke)
    }

    if (node.kind === 'terminal') {
      doc.font('Helvetica-Bold').fontSize(8.2).fillColor(node.selected ? PDF_COLORS.green : '#334155')
        .text(node.code ?? '', g.x + 4, g.y + 6, { width: g.w - 8, align: 'center', lineBreak: false })
      doc.font('Helvetica').fontSize(node.label.length > 24 ? 6.5 : 7.1)
        .fillColor(node.selected ? PDF_COLORS.green : '#596B79')
        .text(node.label, g.x + 4, g.y + 20, { width: g.w - 8, height: 22, align: 'center', lineGap: 0.5 })
    } else {
      if (node.stepNumber) {
        doc.circle(g.x + 10, g.y + 9, 6).fill(accent)
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor(PDF_COLORS.white)
          .text(String(node.stepNumber), g.x + 6, g.y + 5.2, { width: 8, align: 'center', lineBreak: false })
      }
      doc.font('Helvetica-Bold').fontSize(node.label.length > 28 ? 7.1 : 7.9)
        .fillColor(node.active ? accent : '#475569')
        .text(node.label, g.x + 12, g.y + (rootNode ? 12 : 16), { width: g.w - 24, align: 'center', height: rootNode ? 18 : 25, lineGap: 0.5 })
    }
  }
}


export function generateSeraVNextDetailedPdfBuffer(input: DetailedPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const analysis = input.analysis
    const output = analysis.engine_output
    const reviewerOutput = input.reviewerOutput
    const locale: 'pt-BR' | 'en' = analysis.engine_input.locale === 'en' ? 'en' : 'pt-BR'
    const pt = locale === 'pt-BR'
    const L = (ptText: string, enText: string) => pt ? ptText : enText
    const categoryLabel = (category: string): string => {
      const map: Record<string, [string, string]> = {
        PHYSICAL_CAPABILITY: ['Capacidade física / ergonomia', 'Physical capability / ergonomics'],
        SENSORY_LIMITATION: ['Limitação sensorial', 'Sensory limitation'],
        KNOWLEDGE_TRAINING: ['Conhecimento / treinamento', 'Knowledge / training'],
        TIME_PRESSURE: ['Pressão de tempo', 'Time pressure'],
        ATTENTION_WORKLOAD_CONTEXT: ['Atenção / carga de trabalho', 'Attention / workload'],
        COMMUNICATION_INFORMATION: ['Comunicação / informação', 'Communication / information'],
        PROCEDURAL_MONITORING: ['Monitoramento / procedimento', 'Monitoring / procedure'],
        FEEDBACK_VERIFICATION: ['Feedback / verificação', 'Feedback / verification'],
        INTENT_AWARENESS: ['Intenção / consciência', 'Intent / awareness'],
        TEAM_COORDINATION: ['Coordenação de equipe', 'Team coordination'],
        ENVIRONMENTAL_CONTEXT: ['Contexto ambiental', 'Environmental context'],
        TECHNICAL_CONTEXT: ['Contexto técnico', 'Technical context'],
        ORGANIZATIONAL_CONTEXT: ['Contexto organizacional / supervisão', 'Organizational / supervision context'],
      }
      const item = map[category]
      return item ? item[pt ? 0 : 1] : category
    }
    const relationshipLabel = (relationship: string): string => {
      const map: Record<string, [string, string]> = {
        CONTEXTUAL_PRECONDITION: ['pré-condição contextual', 'contextual precondition'],
        ENABLING_PRECONDITION: ['pré-condição facilitadora', 'enabling precondition'],
        DIRECT_ESCAPE_POINT: ['ponto de fuga direto', 'direct escape point'],
        POST_ESCAPE_CONSEQUENCE: ['consequência pós-ponto de fuga', 'post-escape consequence'],
        UNRELATED_OR_UNSUPPORTED: ['hipótese indicada, não confirmada causalmente', 'indicated hypothesis, not causally confirmed'],
      }
      const item = map[relationship]
      return item ? item[pt ? 0 : 1] : relationship
    }
    const doc = new PDFDocument({
      margin: 44,
      size: 'A4',
      bufferPages: true,
      info: {
        Title: 'HFA / SERA - ' + analysis.title,
        Subject: L('Relatório de análise de fatores humanos - SERA', 'Human factors analysis report - SERA'),
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)


    doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF_COLORS.blue)
      .text(L('RELATÓRIO DE ANÁLISE DE FATORES HUMANOS - SERA', 'HUMAN FACTORS ANALYSIS REPORT - SERA'), { align: 'center' })
    doc.moveDown(0.35)
    doc.font('Helvetica-Bold').fontSize(24).fillColor(PDF_COLORS.navy)
      .text(analysis.title, { align: 'center', lineGap: 2 })
    doc.moveDown(0.18)
    doc.font('Helvetica').fontSize(10.5).fillColor(PDF_COLORS.muted)
      .text(L('Análise para revisão humana', 'Analysis for human review'), { align: 'center' })
    doc.moveDown(0.7)

    const bannerY = doc.y
    const bannerW = pageContentWidth(doc)
    doc.roundedRect(doc.page.margins.left, bannerY, bannerW, 48, 8).fillAndStroke(PDF_COLORS.amberSoft, '#E4C982')
    doc.font('Helvetica-Bold').fontSize(9.3).fillColor(PDF_COLORS.amber)
      .text(L('ANÁLISE NÃO FINAL', 'NON-FINAL ANALYSIS'), doc.page.margins.left + 14, bannerY + 9)
    doc.font('Helvetica').fontSize(9.2).fillColor('#6D5725')
      .text(L(
        'Ponto de fuga, ator, P/O/A e pré-condições exigem confirmação humana antes do uso formal.',
        'Escape point, actor, P/O/A, and preconditions require human confirmation before formal use.',
      ), doc.page.margins.left + 14, bannerY + 24, { width: bannerW - 28, lineGap: 2 })
    doc.y = bannerY + 60

    infoCard(
      doc,
      L('Marcos da ocorrência para revisão', 'Occurrence landmarks for review'),
      [
        `${L('Ponto de fuga SERA / primeira saída', 'SERA escape point / first departure')}: ${value(output.escapePoint.firstDepartureCandidate ?? output.escapePoint.statement, L('Não estabelecido.', 'Not established.'))}`,
        `${L('Ator no ponto de fuga (P/O/A)', 'Escape-point actor (P/O/A)')}: ${value(localizeActor(output.escapePoint.firstDepartureActor ?? output.directActor.actor, locale), L('Não individualizado', 'Not individually resolved'))}`,
        `${L('Evolução crítica posterior', 'Later critical evolution')}: ${value(distinctLaterLandmark(output), L('Nenhum ato posterior distinto estabelecido.', 'No distinct later act established.'))}`,
      ].join('\n'),
      { accent: PDF_COLORS.blue, fill: '#F2F7FC', label: L('Uma única âncora SERA', 'Single SERA anchor'), minHeight: 108 },
    )

    statRow(doc, [
      { label: L('Ator no ponto de fuga (P/O/A)', 'Escape-point actor (P/O/A)'), value: value(localizeActor(output.escapePoint.firstDepartureActor ?? output.directActor.actor, locale), L('Não resolvido', 'Unresolved')), accent: PDF_COLORS.blue },
      { label: L('Classificação', 'Classification'), value: [output.axes.perception.proposedCode, output.axes.objective.proposedCode, output.axes.action.proposedCode].map((item) => value(item, '—')).join(' / '), accent: PDF_COLORS.green },
      { label: L('Revisão', 'Review'), value: reviewStatusLabel(analysis.review_status, pt), accent: PDF_COLORS.amber },
    ])
    if (output.directActor.actorMigrationWarnings.length > 0) {
      infoCard(
        doc,
        L('Atribuição do ator e barreiras complementares', 'Actor attribution and complementary barriers'),
        [
          L(
            'O P/O/A principal permanece ancorado no ator que executa ou decide o ato no ponto de fuga. Papéis de monitoramento, cross-check e última barreira são preservados separadamente para não reduzir um evento de equipe a erro individual.',
            'Primary P/O/A remains anchored to the actor who performs or decides the act at the escape point. Monitoring, cross-check, and last-barrier roles are preserved separately so a crew event is not reduced to an individual error.',
          ),
          ...output.directActor.actorMigrationWarnings,
          output.directActor.alternatives.length ? `${L('Papéis relacionados preservados', 'Related roles retained')}: ${output.directActor.alternatives.join(' · ')}` : '',
        ].filter(Boolean).join('\n'),
        { accent: PDF_COLORS.blue, fill: '#F3F8FC', minHeight: 84 },
      )
    }

    const axisCards = [
      { id: 'P', title: L('Percepção', 'Perception'), code: output.axes.perception.proposedCode ?? '—', meaning: reviewerOutput.axisReviews.perception.candidateMeaning ?? candidateStatusLabel(output.axes.perception.status, pt) },
      { id: 'O', title: L('Objetivo', 'Objective'), code: output.axes.objective.proposedCode ?? '—', meaning: reviewerOutput.axisReviews.objective.candidateMeaning ?? candidateStatusLabel(output.axes.objective.status, pt) },
      { id: 'A', title: L('Ação', 'Action'), code: output.axes.action.proposedCode ?? '—', meaning: reviewerOutput.axisReviews.action.candidateMeaning ?? candidateStatusLabel(output.axes.action.status, pt) },
    ]
    axisSummaryRow(doc, axisCards)

    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(PDF_COLORS.navy).text(L('Síntese executiva', 'Executive summary'))
    doc.moveDown(0.2)
    body(doc, buildExecutiveSummary({ title: analysis.title, output, pt }), 'justify')

    doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
    heading(doc, '1. ' + L('Sequência da ocorrência e ponto de fuga', 'Occurrence sequence and escape point'))
    body(doc, L(
      'A leitura abaixo organiza a sequência relevante para a análise: operação segura esperada, ponto de fuga SERA (primeira saída seguro→inseguro e única âncora P/O/A), evolução crítica posterior quando existente e desfecho.',
      'The sequence below separates the safe state, the SERA escape point (first safe→unsafe departure and sole P/O/A anchor), later critical evolution when present, and the outcome.',
    ), 'justify')
    doc.moveDown(0.55)

    infoCard(doc, L('Operação segura', 'Safe operation'), `${L('Estado', 'State')}: ${value(output.safeOperationModel.expectedSafeState)}\n${L('Ação esperada', 'Expected action')}: ${value(output.safeOperationModel.expectedSafeAction)}`, {
      accent: PDF_COLORS.green,
      fill: '#F2FAF5',
      label: L('1  -  operação segura esperada', '1  -  expected safe operation'),
    })
    infoCard(doc, L('Ponto de fuga SERA', 'SERA escape point'), value(output.escapePoint.firstDepartureCandidate ?? output.escapePoint.earliestCandidate), {
      accent: PDF_COLORS.amber,
      fill: '#FFF9EC',
      label: L('2  -  primeira saída seguro → inseguro / âncora P/O/A', '2  -  first safe → unsafe departure / P/O/A anchor'),
    })
    infoCard(doc, L('Evolução crítica posterior', 'Later critical evolution'), value(distinctLaterLandmark(output), L('Nenhum ato crítico posterior distinto foi estabelecido.', 'No distinct later critical act was established.')), {
      accent: PDF_COLORS.red,
      fill: '#FFF4F4',
      label: L('3  -  evolução posterior (não ancora P/O/A)', '3  -  later evolution (does not anchor P/O/A)'),
    })
    infoCard(doc, L('Desfecho posterior', 'Later outcome'), value(output.escapePoint.irreversibilityBoundaryCandidate, L('Nenhum ponto explícito de irreversibilidade foi identificado.', 'No explicit irreversibility boundary was identified.')), {
      accent: '#6B7280',
      fill: '#F7F8FA',
      label: L('4  -  desfecho posterior', '4  -  later outcome'),
    })

    statRow(doc, [
      { label: L('Ator no ponto de fuga (P/O/A)', 'Escape-point actor (P/O/A)'), value: value(localizeActor(output.escapePoint.firstDepartureActor ?? output.directActor.actor, locale), L('Não individualizado', 'Not individually resolved')), accent: PDF_COLORS.blue },
      { label: L('Ator da evolução posterior', 'Later-evolution actor'), value: distinctLaterLandmark(output)
        ? value(localizeActor(output.escapePoint.criticalUnsafeActActor ?? null, locale), L('Não atribuído / não aplicável', 'Not attributed / not applicable'))
        : L('Não aplicável', 'Not applicable'), accent: PDF_COLORS.blue },
      { label: L('Relação / confiança', 'Relationship / confidence'), value: `${landmarkRelationshipLabel(output.escapePoint.anchorBasis, pt)} · ${confidenceLabel(output.escapePoint.confidence, pt)}`, accent: PDF_COLORS.amber },
    ])

    subheading(doc, L('Evidência principal da primeira saída', 'Key evidence for the first departure'))
    bullets(doc, (output.escapePoint.firstDepartureSupportingEvidence ?? []).slice(0, 2), L('Nenhuma evidência específica registrada para este marco.', 'No landmark-specific evidence recorded.'))
    subheading(doc, L('Evidência da evolução crítica posterior', 'Evidence for later critical evolution'))
    if (distinctLaterLandmark(output)) {
      bullets(doc, (output.escapePoint.criticalUnsafeActSupportingEvidence ?? output.escapePoint.supportingEvidence).slice(0, 2), L('Nenhuma evidência específica registrada para este marco.', 'No landmark-specific evidence recorded.'))
    } else {
      body(doc, L('Não foi identificado ato/condição posterior distinto do próprio ponto de fuga.', 'No later act/condition distinct from the escape point was identified.'))
    }
    if (output.canonicalTraversal.paths.length === 0) {
      doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
      heading(doc, '2. ' + L('P / O / A - análise interrompida', 'P / O / A - analysis stopped'))
      infoCard(doc, L('Travessia canônica não iniciada', 'Canonical traversal not started'), L(
        'O ator direto ou a definição do ponto de fuga ainda não permitem avançar P/O/A sem inferência. As informações adicionais necessárias são apresentadas no próprio relatório.',
        'The direct actor or escape-point definition does not yet allow P/O/A traversal without inference. Required clarification is presented in the report.',
      ), { accent: PDF_COLORS.amber, fill: PDF_COLORS.amberSoft })
    } else {
      for (const path of output.canonicalTraversal.paths) {
        renderCanonicalTreePage(doc, path, pt)
        renderAxisDidacticPage(doc, path, output, pt)
      }
    }

    doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
    heading(doc, '5. ' + L('Pré-condições e hipóteses contextuais', 'Preconditions and contextual hypotheses'))
    body(doc, L(
      'No SERA, as pré-condições ajudam a explicar por que a falha ativa se tornou mais provável. A metodologia indica categorias que devem ser verificadas, mas nenhuma pré-condição é atribuída sem evidência específica do evento.',
      'In SERA, preconditions explain why the active failure became more likely. Hendy Table 1 and Annex B, as applied by Daumas, identify the most likely preconditions for each failure type. The list guides the investigation but does not create a precondition automatically: every item below still requires event evidence.',
    ), 'justify')
    doc.moveDown(0.35)
    const supportedPreconditions = output.preconditions.filter((pc) =>
      pc.relationship === 'CONTEXTUAL_PRECONDITION' || pc.relationship === 'ENABLING_PRECONDITION',
    )
    const hypothesisPreconditions = output.preconditions.filter((pc) =>
      pc.relationship !== 'CONTEXTUAL_PRECONDITION' && pc.relationship !== 'ENABLING_PRECONDITION',
    )
    const taxonomyOnlyInvestigationGaps = hypothesisPreconditions.filter((pc) => pc.basedOnCandidateCode && pc.evidence.length === 0)
    const evidenceHypotheses = hypothesisPreconditions.filter((pc) => !(pc.basedOnCandidateCode && pc.evidence.length === 0))
    const renderPrecondition = (pc: typeof output.preconditions[number], hypothesis: boolean) => {
      const reviewCard = reviewerOutput.preconditionReview.cards.find((card) =>
        card.category === pc.category && card.canonicalCategory === (pc.canonicalCategory ?? null))
      const canonicalMeta = pc.canonicalCategory ? SERA_PRECONDITION_META[pc.canonicalCategory] : null
      const canonicalName = canonicalMeta ? (pt ? canonicalMeta.pt : canonicalMeta.en) : categoryLabel(pc.category)
      const accent = hypothesis ? PDF_COLORS.amber : PDF_COLORS.blue
      const fill = hypothesis ? PDF_COLORS.amberSoft : '#F3F8FC'
      infoCard(
        doc,
        `${canonicalName}  -  ${confidenceLabel(pc.confidence, pt)}`,
        pc.description,
        { accent, fill, label: hypothesis ? L('Hipótese preservada - não confirmada causalmente', 'Retained hypothesis - not causally confirmed') : L('Pré-condição sustentada pela evidência', 'Precondition supported by evidence'), minHeight: 82 },
      )
      statRow(doc, [
        { label: L('Nível SERA', 'SERA level'), value: canonicalMeta ? preconditionLevelLabel(canonicalMeta.level, pt) : '-', accent },
        { label: L('Associada a', 'Linked to'), value: pc.likelyForActiveFailureCodes?.join(', ') || '-', accent },
        { label: L('Ator', 'Actor'), value: value(localizeActor(pc.linkedActor, locale)), accent },
      ])
      meta(doc, L('Relação com a falha', 'Relationship to the failure'), relationshipLabel(pc.relationship))
      if (pc.methodologyMatch) meta(doc, L('Correspondência metodológica', 'Methodological match'), preconditionMethodologyMatchLabel(pc.methodologyMatch, pt, pc.basedOnCandidateCode))
      const contextReadout = buildPreconditionContextReadout(output, pc, pt)
      if (contextReadout) {
        subheading(doc, L('Decomposição do contexto', 'Context decomposition'))
        bullets(doc, [
          ...contextReadout.supported.map((text) => `${L('Sustentado', 'Supported')}: ${text}`),
          ...contextReadout.contextual.map((text) => `${L('Contextual/possível', 'Contextual/possible')}: ${text}`),
          ...contextReadout.rejected.map((text) => `${L('Rejeitado como fator', 'Rejected as factor')}: ${text}`),
        ])
      }
      if (pt && reviewCard?.reviewerQuestion) {
        doc.moveDown(0.2)
        infoCard(doc, L('Pergunta ao revisor', 'Reviewer question'), reviewCard.reviewerQuestion, { accent, fill: '#FFFFFF', minHeight: 62 })
      }
      subheading(doc, hypothesis ? L('Evidência contextual principal', 'Key contextual evidence') : L('Evidência principal', 'Key evidence'))
      bullets(doc, pc.evidence.slice(0, 3))
      doc.moveDown(0.55)
    }


    if (!supportedPreconditions.length && !hypothesisPreconditions.length) {
      body(doc, L('Nenhuma pré-condição candidata foi sustentada pela evidência disponível.', 'No candidate precondition was supported by the available evidence.'))
    } else {
      if (supportedPreconditions.length) {
        subheading(doc, L('Pré-condições sustentadas pela evidência', 'Preconditions supported by the evidence'))
        for (const pc of supportedPreconditions) renderPrecondition(pc, false)
      }
      if (evidenceHypotheses.length) {
        subheading(doc, L('Hipóteses contextuais preservadas - não confirmadas causalmente', 'Retained contextual hypotheses - not causally confirmed'))
        body(doc, L(
          'Estes itens aparecem no material-fonte como contexto potencialmente relevante, mas não entram como pré-condições confirmadas nem no Perfil de Risco enquanto permanecerem sem suporte causal suficiente.',
          'These items appear in the source material as potentially relevant context, but they do not count as confirmed preconditions or enter the Risk Profile while causal support remains insufficient.',
        ), 'justify')
        doc.moveDown(0.25)
        for (const pc of evidenceHypotheses) renderPrecondition(pc, true)
      }
      if (taxonomyOnlyInvestigationGaps.length) {
        subheading(doc, L('Rotas de investigação sugeridas pela taxonomia', 'Investigation routes suggested by the taxonomy'))
        body(doc, L(
          'As categorias abaixo vêm da correspondência da Tabela 1 com a falha ativa candidata. Elas são perguntas de investigação, não fatores encontrados no relato e não causas presumidas.',
          'The categories below come from Table 1 correspondence with the candidate active failure. They are investigation prompts, not factors found in the source and not presumed causes.',
        ), 'justify')
        bullets(doc, taxonomyOnlyInvestigationGaps.map((pc) => {
          const meta = pc.canonicalCategory ? SERA_PRECONDITION_META[pc.canonicalCategory] : null
          const label = meta ? (pt ? meta.pt : meta.en) : categoryLabel(pc.category)
          return `${label}: ${pc.description}`
        }))
      }
    }

    heading(doc, '6. ' + L('Correspondência complementar SERA / HFACS', 'Complementary SERA / HFACS correspondence'))
    const hfacsBridge = buildSeraHfacsBridge(
      [output.axes.perception.proposedCode, output.axes.objective.proposedCode, output.axes.action.proposedCode],
      supportedPreconditions.map((pc) => pc.canonicalCategory ?? null),
    )
    body(doc, L(
      'Esta correspondência é apresentada como referência complementar após a classificação SERA. Ela não altera o caminho da análise nem substitui a interpretação do contexto do ato inseguro.',
      'This is a post-SERA classification bridge based on Hendy Tables 3–6. It does not alter the tree path or select SERA codes. Hendy explicitly notes that the correspondence is not one-to-one and must be resolved from the unsafe-act context.',
    ), 'justify')
    doc.moveDown(0.25)
    subheading(doc, L('Falhas ativas SERA — melhor correspondência HFACS/AGA135', 'SERA active failures — best-fit HFACS/AGA135 correspondence'))
    bullets(doc, hfacsBridge.activeFailures.map((item) => `${hfacsBridgeLevelLabel(item.level, pt)}: ${hfacsLabel(item.hfacs, pt)}`), L('Nenhuma correspondência disponível enquanto P/O/A permanecer não resolvido.', 'No correspondence is available while P/O/A remains unresolved.'))
    subheading(doc, L('Pré-condições SERA — melhor correspondência HFACS/AGA135', 'SERA preconditions — best-fit HFACS/AGA135 correspondence'))
    bullets(doc, hfacsBridge.preconditions.map((item) => `${hfacsBridgeLevelLabel(item.level, pt)}: ${hfacsLabel(item.hfacs, pt)}`), L('Nenhuma pré-condição confirmada para mapeamento.', 'No confirmed precondition available for mapping.'))

    const operationalObservations = output.factualExtraction.evidence
      .filter((item) =>
        item.sourceSection === 'REPORT_ANALYSIS' &&
        item.assertionStatus === 'AFFIRMED' &&
      item.evidenceType !== 'NON_CAUSAL_DOCUMENT' &&
      item.evidenceType !== 'SYSTEM_DESCRIPTION' &&
      item.statement.length <= 1200 &&
        /\b(reconfirma[cç][aã]o|c[oó]digo 9p|cross-check|checklist|barreira|monitoramento|monitoring|verification|coordena[cç][aã]o|coordination)\b/i.test(item.statement),
      )
      .map((item) => item.statement)
      .filter((item, index, all) => all.indexOf(item) === index)
      .slice(0, 6)

    heading(doc, '7. ' + L('Outros fatores contribuintes e observações operacionais', 'Other contributory factors and operational observations'))
    body(doc, L(
      'Itens explicitamente registrados pela investigação e preservados para revisão humana, sem convertê-los automaticamente em pré-condições causais.',
      'Items explicitly recorded by the investigation and retained for human review without automatically converting them into causal preconditions.',
    ), 'justify')
    bullets(doc, operationalObservations, L('Nenhum outro fator contribuinte ou observação operacional adicional foi identificado nesta análise.', 'No additional contributory factor or operational observation was identified in this analysis.'))

    heading(doc, '8. ' + L('Tratamento e ações sugeridas', 'Treatment and suggested actions'))
    const treatmentSuggestions = buildSeraActionSuggestions({
      analysisId: analysis.id,
      eventId: analysis.source_reference,
      analysisTitle: analysis.title,
      output,
    })
    const correctiveSuggestions = treatmentSuggestions.filter((item) => item.kind === 'CORRECTIVE_PREVENTIVE')
    const taxonomyOnlyCategories = new Set(taxonomyOnlyInvestigationGaps.map((pc) => pc.canonicalCategory).filter(Boolean))
    const investigationSuggestions = treatmentSuggestions.filter((item) =>
      item.kind === 'INVESTIGATION' && !taxonomyOnlyCategories.has(item.canonicalCategory),
    )
    body(doc, L(
      'O tratamento é derivado das pré-condições, não apenas do código P/O/A. Pré-condições sustentadas geram propostas de controle para decisão humana; hipóteses ainda não confirmadas geram somente tarefas de investigação. Após a implementação, a ação deve ter eficácia verificada e o risco residual acompanhado antes do fechamento do ciclo.',
      'Treatment is derived from preconditions, not merely from P/O/A codes. Evidence-supported preconditions generate control proposals for human decision; unconfirmed hypotheses generate investigation tasks only. After implementation, action effectiveness and residual risk must be reviewed before closing the cycle.',
    ), 'justify')
    doc.moveDown(0.25)
    if (correctiveSuggestions.length) {
      subheading(doc, L('Propostas de ação corretiva/preventiva', 'Corrective/preventive action proposals'))
      for (const item of correctiveSuggestions) {
        infoCard(doc, item.title, item.description, { accent: PDF_COLORS.green, fill: PDF_COLORS.greenSoft, label: L('Proposta para validação humana', 'Proposal for human validation'), minHeight: 74 })
      }
    }
    if (investigationSuggestions.length) {
      subheading(doc, L('Lacunas de investigação antes de definir ação', 'Investigation gaps before defining action'))
      bullets(doc, investigationSuggestions.map((item) => `${item.title}: ${item.description}`))
    }
    if (!correctiveSuggestions.length && !investigationSuggestions.length) {
      body(doc, taxonomyOnlyInvestigationGaps.length
        ? L('Nenhuma ação corretiva é proposta com a evidência atual. As rotas de investigação orientadas pela taxonomia estão consolidadas na seção 5 e não são causas presumidas.', 'No corrective action is proposed with the current evidence. Taxonomy-guided investigation routes are consolidated in Section 5 and are not presumed causes.')
        : L('Nenhuma proposta de tratamento é liberada com a evidência atual. Complete a investigação e valide as pré-condições antes de definir ações.', 'No treatment proposal is released with the current evidence. Complete the investigation and validate preconditions before defining actions.'))
    }

    heading(doc, '9. ' + L('Conclusão e próximos passos', 'Conclusion and next steps'))
    const analysisReady = output.evidenceSufficiency.status === 'SUFFICIENT_FOR_CANDIDATE_ANALYSIS' && !Object.values(output.guardrails).some(Boolean)
    body(doc, analysisReady
      ? L(
          'A análise apresenta elementos suficientes para revisão humana. Antes do uso formal, recomenda-se confirmar o ponto de fuga, o ator direto, os resultados P/O/A e as pré-condições identificadas.',
          'The candidate analysis has minimum evidence for human review. Before formal use, the reviewer must confirm the escape point, actor, P/O/A candidates, and preconditions.',
        )
      : (() => {
          const axisSummary = [
            ['Percepção', 'Perception', output.axes.perception.proposedCode],
            ['Objetivo', 'Objective', output.axes.objective.proposedCode],
            ['Ação', 'Action', output.axes.action.proposedCode],
          ].map(([ptLabel, enLabel, code]) => `${pt ? ptLabel : enLabel}: ${code ?? (pt ? 'não resolvido' : 'unresolved')}`).join(' · ')
          return L(
            `O fechamento metodológico ainda requer evidência/revisão adicional. Estado atual por eixo: ${axisSummary}. Os eixos já sustentados permanecem como candidatos; as lacunas indicadas devem ser esclarecidas antes do uso formal.`,
            `Methodological closure still requires additional evidence/review. Current axis state: ${axisSummary}. Supported axes remain candidates; identified gaps must be resolved before formal use.`,
          )
        })(), 'justify')

    doc.moveDown(0.55)
    heading(doc, '10. ' + L('Referência metodológica', 'Methodological reference'))
    body(doc, L(
      'A análise utiliza a metodologia SERA, estruturada nos eixos Percepção, Objetivo e Ação, com correspondência complementar à taxonomia HFACS quando aplicável. O resultado permanece sujeito à revisão humana.',
      'The analysis uses the SERA methodology, structured around Perception, Objective, and Action, with complementary HFACS correspondence where applicable. The result remains subject to human review.',
    ), 'justify')

    applyPageChrome(doc, analysis.title, pt)
    doc.end()
  })
}

export const generateSeraVNextPdfBuffer = generateSeraVNextDetailedPdfBuffer
