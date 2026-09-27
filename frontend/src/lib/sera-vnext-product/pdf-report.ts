// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit/js/pdfkit.standalone.js') as typeof import('pdfkit')

import type { SeraCanonicalPath, SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { localizeActor } from '@/lib/sera-vnext/engine-v0/localization'
import { SERA_PT_V1_TREE } from '@/lib/sera-vnext/canonical-tree/sera-pt-v1'
import { buildExecutiveSummary, friendlyAnswerLabel, hfacsBridgeLevelLabel, preconditionLevelLabel, preconditionMethodologyMatchLabel } from '@/lib/sera-vnext/presentation'
import { SERA_PRECONDITION_META } from '@/lib/sera-vnext/precondition-taxonomy'
import { buildSeraHfacsBridge } from '@/lib/sera-vnext/hfacs-bridge'
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
  if (value === 'CRITICAL_UNSAFE_ACT') return pt ? 'O primeiro desvio antecede o ato crítico; P/O/A parte do ato crítico.' : 'Distinct landmarks: the first departure precedes the critical act; P/O/A is anchored to the critical act.'
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

function renderAxisDidacticPage(
  doc: Doc,
  path: SeraCanonicalPath,
  output: SeraVNextEngineOutput,
  pt: boolean,
  meaning: string | null,
): void {
  const axis = axisOutput(output, path.axis)
  const L = (ptText: string, enText: string) => pt ? ptText : enText
  const { accent, fill } = axisAccent(path.axis)
  const code = axis.proposedCode ?? L('Não resolvido', 'Unresolved')
  const title = axisLabel(path.axis, pt)
  const x = doc.page.margins.left
  const w = pageContentWidth(doc)

  const addAxisPage = (continued = false) => {
    doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
    doc.font('Helvetica-Bold').fontSize(9).fillColor(accent)
      .text(continued ? `${title} - ${code} | ${L('continuação', 'continued')}` : L('ANÁLISE SERA', 'SERA ANALYSIS'))
    if (!continued) {
      doc.moveDown(0.35)
      doc.font('Helvetica-Bold').fontSize(20).fillColor(PDF_COLORS.navy).text(`${title} - ${code}`)
      doc.font('Helvetica').fontSize(10).fillColor(PDF_COLORS.muted)
        .text(L('Fluxograma com as perguntas canônicas da metodologia e as respostas deste evento.', 'Flowchart with the canonical methodology questions and this event responses.'), { lineGap: 2 })
      doc.moveDown(0.6)
    } else {
      doc.moveDown(0.55)
    }
  }

  addAxisPage(false)

  const rootAnswer = path.answers[0] ? pathAnswerText(path.answers[0], path, output, pt) : L('Não estabelecido pela evidência disponível.', 'Not established by the available evidence.')
  const resultText = meaning ? `${rootAnswer}\n\n${meaning}` : rootAnswer
  doc.font('Helvetica').fontSize(10.4)
  const resultH = Math.max(112, doc.heightOfString(resultText, { width: w - 32, lineGap: 2.8 }) + 74)
  const resultY = doc.y
  doc.roundedRect(x, resultY, w, resultH, 9).fillAndStroke(fill, '#D5DEE6')
  doc.font('Helvetica-Bold').fontSize(8.8).fillColor(accent).text(L('RESULTADO DO EIXO', 'AXIS RESULT'), x + 16, resultY + 13)
  doc.font('Helvetica-Bold').fontSize(23).fillColor(PDF_COLORS.navy).text(code, x + 16, resultY + 31, { width: 90 })
  doc.font('Helvetica-Bold').fontSize(10.8).fillColor(PDF_COLORS.ink)
    .text(candidateStatusLabel(axis.status, pt), x + 108, resultY + 35, { width: w - 124 })
  let resultTextY = resultY + 62
  doc.font('Helvetica-Bold').fontSize(9.2).fillColor(accent).text(L('Resposta inicial', 'Initial answer'), x + 16, resultTextY)
  resultTextY += 15
  doc.font('Helvetica').fontSize(10.4).fillColor(PDF_COLORS.ink).text(rootAnswer, x + 16, resultTextY, { width: w - 32, lineGap: 2.8 })
  resultTextY += doc.heightOfString(rootAnswer, { width: w - 32, lineGap: 2.8 }) + 7
  if (meaning) doc.font('Helvetica').fontSize(9.4).fillColor(PDF_COLORS.muted).text(meaning, x + 16, resultTextY, { width: w - 32, lineGap: 2.3 })
  doc.y = resultY + resultH + 15

  doc.font('Helvetica-Bold').fontSize(12).fillColor(PDF_COLORS.navy).text(L('Fluxograma da análise', 'Analysis flowchart'))
  doc.moveDown(0.2)
  doc.font('Helvetica').fontSize(9.5).fillColor(PDF_COLORS.muted)
    .text(L('Os losangos reproduzem integralmente as perguntas canônicas. As respostas indicam o ramo seguido neste evento.', 'Diamonds reproduce the canonical questions in full. Responses indicate the branch followed in this event.'), { lineGap: 2.2 })
  doc.moveDown(0.5)

  const flowCenter = x + w / 2
  const nodeW = Math.min(430, w - 42)
  const textW = nodeW - 110
  let previousBottom: number | null = null

  for (let index = 0; index < path.answers.length; index += 1) {
    const answer = path.answers[index]
    const q = canonicalQuestion(answer, pt)
    const response = pathAnswerText(answer, path, output, pt)
    const isRoot = index === 0
    doc.font('Helvetica-Bold').fontSize(9.5)
    const qH = doc.heightOfString(q, { width: isRoot ? nodeW - 34 : textW, lineGap: 1.6 })
    doc.font('Helvetica').fontSize(9.4)
    const aH = doc.heightOfString(`${L('Resposta', 'Answer')}: ${response}`, { width: isRoot ? nodeW - 34 : textW, lineGap: 1.5 })
    const nodeH = Math.max(isRoot ? 82 : 92, qH + aH + (isRoot ? 32 : 42))
    const totalNeeded = nodeH + 42
    if (doc.y + totalNeeded > pageBottom(doc)) {
      addAxisPage(true)
      previousBottom = null
    }

    const y = doc.y
    const left = flowCenter - nodeW / 2
    if (previousBottom !== null) {
      const arrowTop = previousBottom + 3
      const arrowBottom = y - 4
      doc.strokeColor(accent).lineWidth(1.8).moveTo(flowCenter, arrowTop).lineTo(flowCenter, arrowBottom).stroke()
      doc.fillColor(accent).polygon([flowCenter - 4, arrowBottom - 6], [flowCenter + 4, arrowBottom - 6], [flowCenter, arrowBottom]).fill()
      const prior = path.answers[index - 1]
      if (prior.answer !== 'START') {
        const branch = friendlyAnswerLabel(prior.answer, pt)
        doc.font('Helvetica-Bold').fontSize(8.3).fillColor(accent)
          .text(branch, flowCenter + 9, arrowTop + Math.max(2, (arrowBottom - arrowTop) / 2 - 5), { width: 95, lineBreak: false })
      }
    }

    if (isRoot) {
      doc.roundedRect(left, y, nodeW, nodeH, 10).fillAndStroke(fill, accent)
    } else {
      doc.polygon(
        [flowCenter, y],
        [left + nodeW, y + nodeH / 2],
        [flowCenter, y + nodeH],
        [left, y + nodeH / 2],
      ).fillAndStroke(fill, accent)
    }

    doc.circle(left + 15, y + 15, 9).fill(accent)
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF')
      .text(String(index + 1), left + 10, y + 10, { width: 10, align: 'center', lineBreak: false })

    const tx = isRoot ? left + 17 : flowCenter - textW / 2
    const tw = isRoot ? nodeW - 34 : textW
    let ty = y + (isRoot ? 17 : 19)
    doc.font('Helvetica-Bold').fontSize(9.5).fillColor(accent)
      .text(q, tx, ty, { width: tw, align: 'center', lineGap: 1.6 })
    ty += qH + 7
    doc.font('Helvetica').fontSize(9.4).fillColor(PDF_COLORS.ink)
      .text(`${L('Resposta', 'Answer')}: ${response}`, tx, ty, { width: tw, align: 'center', lineGap: 1.5 })

    previousBottom = y + nodeH
    doc.y = y + nodeH + 30
  }

  if (path.candidateCode && previousBottom !== null) {
    if (doc.y + 82 > pageBottom(doc)) {
      addAxisPage(true)
      previousBottom = null
    }
    const terminalY = doc.y
    if (previousBottom !== null) {
      doc.strokeColor(PDF_COLORS.green).lineWidth(1.8).moveTo(flowCenter, previousBottom + 3).lineTo(flowCenter, terminalY - 4).stroke()
      doc.fillColor(PDF_COLORS.green).polygon([flowCenter - 4, terminalY - 10], [flowCenter + 4, terminalY - 10], [flowCenter, terminalY - 4]).fill()
      const last = path.answers[path.answers.length - 1]
      if (last.answer !== 'START') {
        doc.font('Helvetica-Bold').fontSize(8.3).fillColor(PDF_COLORS.green)
          .text(friendlyAnswerLabel(last.answer, pt), flowCenter + 9, previousBottom + 11, { width: 95, lineBreak: false })
      }
    }
    const terminalW = 230
    doc.roundedRect(flowCenter - terminalW / 2, terminalY, terminalW, 58, 10).fillAndStroke(PDF_COLORS.greenSoft, PDF_COLORS.green)
    doc.font('Helvetica-Bold').fontSize(15).fillColor(PDF_COLORS.green)
      .text(path.candidateCode, flowCenter - terminalW / 2 + 12, terminalY + 9, { width: terminalW - 24, align: 'center' })
    doc.font('Helvetica').fontSize(9.2).fillColor(PDF_COLORS.green)
      .text(candidateStatusLabel(axis.status, pt), flowCenter - terminalW / 2 + 12, terminalY + 31, { width: terminalW - 24, align: 'center' })
    doc.y = terminalY + 70
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
      L('Ponto de fuga identificado para revisão', 'Escape point identified for review'),
      value(output.escapePoint.statement, L('Não estabelecido.', 'Not established.')),
      { accent: PDF_COLORS.blue, fill: '#F2F7FC', label: L('Ponto de fuga analisado', 'Analysed escape point'), minHeight: 82 },
    )

    statRow(doc, [
      { label: L('Ator direto', 'Direct actor'), value: value(localizeActor(output.directActor.actor, locale), L('Não resolvido', 'Unresolved')), accent: PDF_COLORS.blue },
      { label: L('Classificação', 'Classification'), value: [output.axes.perception.proposedCode, output.axes.objective.proposedCode, output.axes.action.proposedCode].map((item) => value(item, '—')).join(' / '), accent: PDF_COLORS.green },
      { label: L('Revisão', 'Review'), value: reviewStatusLabel(analysis.review_status, pt), accent: PDF_COLORS.amber },
    ])

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
      'A leitura abaixo organiza a sequência relevante para a análise: operação segura esperada, primeiro desvio, ato inseguro crítico que define o ponto de fuga e desfecho posterior.',
      'The sequence below separates the safe state, the first departure from safe operation, the critical unsafe act anchoring P/O/A, and the later outcome. These landmarks are not interchangeable.',
    ), 'justify')
    doc.moveDown(0.55)

    infoCard(doc, L('Operação segura', 'Safe operation'), `${L('Estado', 'State')}: ${value(output.safeOperationModel.expectedSafeState)}\n${L('Ação esperada', 'Expected action')}: ${value(output.safeOperationModel.expectedSafeAction)}`, {
      accent: PDF_COLORS.green,
      fill: '#F2FAF5',
      label: L('1  -  operação segura esperada', '1  -  expected safe operation'),
    })
    infoCard(doc, L('Primeiro desvio da operação segura', 'First departure from safe operation'), value(output.escapePoint.firstDepartureCandidate ?? output.escapePoint.earliestCandidate), {
      accent: PDF_COLORS.amber,
      fill: '#FFF9EC',
      label: L('2  -  primeiro desvio relevante', '2  -  first relevant departure'),
    })
    infoCard(doc, L('Ato/condição insegura crítica', 'Critical unsafe act/condition'), value(output.escapePoint.criticalUnsafeActCandidate ?? output.escapePoint.latestCandidate), {
      accent: PDF_COLORS.red,
      fill: '#FFF4F4',
      label: L('3  -  ponto de fuga para P/O/A', '3  -  P/O/A escape point'),
    })
    infoCard(doc, L('Desfecho posterior', 'Later outcome'), value(output.escapePoint.irreversibilityBoundaryCandidate, L('Nenhum ponto explícito de irreversibilidade foi identificado.', 'No explicit irreversibility boundary was identified.')), {
      accent: '#6B7280',
      fill: '#F7F8FA',
      label: L('4  -  desfecho posterior', '4  -  later outcome'),
    })

    statRow(doc, [
      { label: L('Relação entre os momentos', 'Relationship between moments'), value: landmarkRelationshipLabel(output.escapePoint.anchorBasis, pt), accent: PDF_COLORS.blue },
      { label: L('Ator direto', 'Direct actor'), value: value(localizeActor(output.directActor.actor, locale), L('Não resolvido', 'Unresolved')), accent: PDF_COLORS.blue },
      { label: L('Confiança da identificação', 'Identification confidence'), value: confidenceLabel(output.escapePoint.confidence, pt), accent: PDF_COLORS.amber },
    ])

    subheading(doc, L('Evidência principal da primeira saída', 'Key evidence for the first departure'))
    bullets(doc, (output.escapePoint.firstDepartureSupportingEvidence ?? []).slice(0, 2), L('Nenhuma evidência específica registrada para este marco.', 'No landmark-specific evidence recorded.'))
    subheading(doc, L('Evidência principal do ato crítico', 'Key evidence for the critical act'))
    bullets(doc, (output.escapePoint.criticalUnsafeActSupportingEvidence ?? output.escapePoint.supportingEvidence).slice(0, 2), L('Nenhuma evidência específica registrada para este marco.', 'No landmark-specific evidence recorded.'))
    if (output.canonicalTraversal.paths.length === 0) {
      doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
      heading(doc, '2. ' + L('P / O / A - análise interrompida', 'P / O / A - analysis stopped'))
      infoCard(doc, L('Travessia canônica não iniciada', 'Canonical traversal not started'), L(
        'O ator direto ou a definição do ponto de fuga ainda não permitem avançar P/O/A sem inferência. As informações adicionais necessárias são apresentadas no próprio relatório.',
        'The direct actor or escape-point definition does not yet allow P/O/A traversal without inference. Required clarification is presented in the report.',
      ), { accent: PDF_COLORS.amber, fill: PDF_COLORS.amberSoft })
    } else {
      for (const path of output.canonicalTraversal.paths) {
        const reviewCard = path.axis === 'P'
          ? reviewerOutput.axisReviews.perception
          : path.axis === 'O'
            ? reviewerOutput.axisReviews.objective
            : reviewerOutput.axisReviews.action
        renderAxisDidacticPage(doc, path, output, pt, reviewCard.candidateMeaning ?? null)
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
    const renderPrecondition = (pc: typeof output.preconditions[number], hypothesis: boolean) => {
      const reviewCard = reviewerOutput.preconditionReview.cards.find((card) => card.category === pc.category)
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
      if (pc.methodologyMatch) meta(doc, L('Correspondência metodológica', 'Methodological match'), preconditionMethodologyMatchLabel(pc.methodologyMatch, pt))
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
      if (hypothesisPreconditions.length) {
        subheading(doc, L('Hipóteses preservadas - não confirmadas causalmente', 'Retained hypotheses - not causally confirmed'))
        body(doc, L(
          'Estes itens foram mencionados ou sugeridos no material-fonte, mas não entram como pré-condições confirmadas nem no Perfil de Risco enquanto permanecerem sem suporte causal suficiente.',
          'These items were mentioned or suggested in the source material, but they do not count as confirmed preconditions or enter the Risk Profile while causal support remains insufficient.',
        ), 'justify')
        doc.moveDown(0.25)
        for (const pc of hypothesisPreconditions) renderPrecondition(pc, true)
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

    heading(doc, '8. ' + L('Conclusão e próximos passos', 'Conclusion and next steps'))
    const analysisReady = output.evidenceSufficiency.status === 'SUFFICIENT_FOR_CANDIDATE_ANALYSIS' && !Object.values(output.guardrails).some(Boolean)
    body(doc, analysisReady
      ? L(
          'A análise apresenta elementos suficientes para revisão humana. Antes do uso formal, recomenda-se confirmar o ponto de fuga, o ator direto, os resultados P/O/A e as pré-condições identificadas.',
          'The candidate analysis has minimum evidence for human review. Before formal use, the reviewer must confirm the escape point, actor, P/O/A candidates, and preconditions.',
        )
      : L(
          'A análise ainda não possui evidência suficiente para concluir P/O/A. As perguntas e informações adicionais indicadas no relatório devem ser esclarecidas antes do uso formal.',
          'The analysis does not have sufficient evidence to close P/O/A. Treat this report as a clarification package: blocking reasons and pending questions must be resolved before any formal classification or operational index.',
        ), 'justify')

    doc.moveDown(0.55)
    heading(doc, '9. ' + L('Referência metodológica', 'Methodological reference'))
    body(doc, L(
      'A análise utiliza a metodologia SERA, estruturada nos eixos Percepção, Objetivo e Ação, com correspondência complementar à taxonomia HFACS quando aplicável. O resultado permanece sujeito à revisão humana.',
      'The analysis uses the SERA methodology, structured around Perception, Objective, and Action, with complementary HFACS correspondence where applicable. The result remains subject to human review.',
    ), 'justify')

    applyPageChrome(doc, analysis.title, pt)
    doc.end()
  })
}

export const generateSeraVNextPdfBuffer = generateSeraVNextDetailedPdfBuffer
