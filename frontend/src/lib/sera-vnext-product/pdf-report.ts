// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit/js/pdfkit.standalone.js') as typeof import('pdfkit')

import type { SeraCanonicalPath, SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { localizeActor, localizeAssuranceText, localizeRationale } from '@/lib/sera-vnext/engine-v0/localization'
import { SERA_PT_V1_TREE } from '@/lib/sera-vnext/canonical-tree/sera-pt-v1'
import { buildExecutiveSummary, computeCandidateAttention, friendlyAnswerLabel, friendlyNodeLabel, hfacsBridgeLevelLabel, preconditionLevelLabel, preconditionMethodologyMatchLabel } from '@/lib/sera-vnext/presentation'
import { buildCanonicalFlowVisualModel } from '@/lib/sera-vnext/canonical-flow-visual'
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

function entries(values: string[] | undefined | null): string[] {
  return (values ?? []).filter((item) => item && item.trim().length > 0)
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

function applyPageChrome(doc: Doc, title: string, analysisId: string, codeCommit: string, pt: boolean): void {
  const range = doc.bufferedPageRange()
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i)
    const left = doc.page.margins.left
    const right = doc.page.width - doc.page.margins.right
    if (i > 0) {
      doc.font('Helvetica-Bold').fontSize(7.8).fillColor('#758493')
        .text('HFA / SERA 0.3  -  ' + title, left, 18, { width: right - left, lineBreak: false })
      doc.strokeColor('#E1E7ED').lineWidth(0.6).moveTo(left, 31).lineTo(right, 31).stroke()
    }
    const footerY = pageBottom(doc) + 7
    doc.strokeColor('#E1E7ED').lineWidth(0.6).moveTo(left, footerY - 5).lineTo(right, footerY - 5).stroke()
    doc.font('Helvetica').fontSize(7.2).fillColor('#7A8996')
      .text(`ID ${analysisId.slice(0, 8)}  |  SHA ${codeCommit.slice(0, 8)}`, left, footerY, { lineBreak: false })
    doc.text(`${pt ? 'Página' : 'Page'} ${i - range.start + 1} ${pt ? 'de' : 'of'} ${range.count}`, right - 92, footerY, { width: 92, align: 'right', lineBreak: false })
  }
}

function didacticReason(nodeId: string, answer: string, fallback: string | undefined, pt: boolean): string {
  if (!pt) return fallback ?? 'The answer was determined by the usable evidence available at this node.'
  const key = nodeId + ':' + answer
  const map: Record<string, string> = {
    'P_ROOT:START': 'A Etapa 1 estabelece explicitamente o estado que o operador acreditava existir; a Etapa 2 avalia se esse estado percebido correspondia adequadamente à situação real.',
    'P_ASSESSMENT:NÃO': 'A evidência mostra que a avaliação da situação não correspondia ao estado real; por isso a árvore testa qual mecanismo perceptivo explica a divergência.',
    'P_ASSESSMENT:SIM': 'A evidência sustenta avaliação adequada da situação; não há falha perceptiva independente neste eixo.',
    'P_CAPABILITY:SIM': 'Havia capacidade e meios para perceber a situação; por isso não se encerra em limitação sensorial ou de conhecimento e a análise segue para pressão temporal e qualidade da informação.',
    'P_CAPABILITY:NÃO_SENSORIAL': 'A evidência localiza a falha em limitação sensorial/perceptiva.',
    'P_CAPABILITY:NÃO_CONHECIMENTO': 'A evidência localiza a falha em conhecimento ou familiaridade necessários para interpretar o estímulo.',
    'P_TIME_PRESSURE:NÃO': 'Não há evidência de pressão de tempo excessiva dominante; a análise segue para verificar ambiguidade e disponibilidade da informação.',
    'P_INFORMATION_AMBIGUOUS:NÃO': 'A informação relevante não era ilusória ou ambígua; a árvore segue para verificar se ela estava disponível e correta.',
    'P_INFORMATION_AMBIGUOUS:SIM': 'A evidência sustenta que a informação era ambígua ou ilusória.',
    'P_INFORMATION_AVAILABLE:SIM': 'A informação necessária estava disponível e correta, mas a avaliação permaneceu inadequada; isso conduz ao código P-G.',
    'P_INFORMATION_AVAILABLE:NÃO': 'A informação necessária não estava disponível/correta; isso conduz ao ramo de comunicação/informação.',
    'O_ROOT:START': 'A Etapa 1 explicita o objetivo que o operador pretendia alcançar; os nós seguintes testam esse objetivo quanto a regras e gerenciamento do risco.',
    'O_RULES:SIM': 'O objetivo pretendido era compatível com regras/procedimentos e com a finalidade operacional declarada; a árvore testa se havia um objetivo de risco independente.',
    'O_RULES:NÃO': 'Há evidência de objetivo incompatível com regras/procedimentos; a árvore passa a distinguir violação rotineira de excepcional.',
    'O_MANAGED_RISK:NÃO': 'Não foi demonstrado um objetivo inseguro independente; mantém-se O-A, sem falha de objetivo.',
    'O_MANAGED_RISK:SIM': 'Há evidência de objetivo que, embora compatível com regras gerais, não gerenciava adequadamente o risco operacional.',
    'A_ROOT:START': 'A Etapa 1 explicita como o operador tentou alcançar o objetivo; os nós seguintes avaliam implementação e adequação dessa ação.',
    'A_IMPLEMENTED:SIM': 'A ação foi implementada de forma coerente com o estado percebido pelo ator; a árvore então verifica se existia falha de ação independente.',
    'A_IMPLEMENTED:NÃO_DESLIZE_LAPSO_ERRO': 'Há evidência de deslize, lapso ou erro específico de implementação da ação.',
    'A_IMPLEMENTED:NÃO_FEEDBACK': 'Há evidência de falha de feedback/verificação da própria execução.',
    'A_CORRECT:SIM': 'Não foi demonstrado mecanismo independente de ação inadequada; a ação era coerente com a percepção/objetivo do ator, conduzindo a A-A.',
    'A_CORRECT:NÃO': 'A ação implementada era inadequada por mecanismo próprio; a árvore segue para capacidade e seleção da resposta.',
  }
  return map[key] ?? fallback ?? 'A resposta foi determinada pela evidência utilizável disponível neste nó.'
}

function confidenceLabel(value: string | undefined | null, pt: boolean): string {
  if (value === 'HIGH') return pt ? 'ALTA' : 'HIGH'
  if (value === 'MEDIUM') return pt ? 'MÉDIA' : 'MEDIUM'
  if (value === 'LOW') return pt ? 'BAIXA' : 'LOW'
  return value ?? '-'
}


function landmarkRelationshipLabel(value: SeraVNextEngineOutput['escapePoint']['anchorBasis'], pt: boolean): string {
  if (value === 'FIRST_DEPARTURE_AND_CRITICAL_ACT') return pt ? 'Os dois marcos coincidem no mesmo ato/condição.' : 'Both landmarks coincide in the same act/condition.'
  if (value === 'CRITICAL_UNSAFE_ACT') return pt ? 'Marcos distintos: o primeiro desvio antecede o ato crítico; P/O/A é ancorado no ato crítico.' : 'Distinct landmarks: the first departure precedes the critical act; P/O/A is anchored to the critical act.'
  if (value === 'FIRST_DEPARTURE_ONLY') return pt ? 'Somente a primeira saída da operação segura foi estabelecida.' : 'Only the first departure from safe operation was established.'
  return pt ? 'Relação ainda não resolvida.' : 'Relationship not yet resolved.'
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

function translateReportText(value: string, pt: boolean): string {
  const locale = pt ? 'pt-BR' : 'en'
  const localized = localizeAssuranceText(value, locale)
  const ptMap: Record<string, string> = {
    'Confirm or reject the candidate escape point boundary.': 'Confirmar ou rejeitar o limite candidato do ponto de fuga.',
    'Confirm or reject the direct actor attribution.': 'Confirmar ou rejeitar a atribuição do ator direto.',
    'Review P/O/A candidate code alternatives and retained uncertainties.': 'Revisar os códigos candidatos P/O/A, as alternativas consideradas e as incertezas mantidas.',
    'Confirm whether each precondition is distinct from the active failure.': 'Confirmar se cada pré-condição é distinta da falha ativa.',
    'Hendy gate: the anchor is an observable operator unsafe act/inaction or operator-controlled unsafe condition on the occurrence trajectory.': 'Gate Hendy: a âncora é um ato/omissão inseguro observável do operador ou uma condição insegura controlada pelo operador na trajetória da ocorrência.',
    'The first departure from safe operation and the critical unsafe act are retained separately when they do not coincide; P/O/A uses the critical act as the primary anchor.': 'A primeira saída da operação segura e o ato inseguro crítico são preservados separadamente quando não coincidem; P/O/A usa o ato crítico como âncora primária.',
    'Technical, environmental, maintenance, dispatch and organizational facts that only set the scene remain context/preconditions rather than displacing the directly outcome-linked unsafe act.': 'Fatos técnicos, ambientais, de manutenção, despacho e organização que apenas compõem o cenário permanecem como contexto/pré-condições e não substituem o ato inseguro diretamente ligado ao desfecho.',
    'Hendy boundary split: the first departure from safe operation and the most critical unsafe act/condition are different supported landmarks. P/O/A is anchored to the critical act while the earlier departure remains causal-window context.': 'Separação da fronteira Hendy: a primeira saída da operação segura e o ato/condição insegura crítica são marcos distintos sustentados por evidência. P/O/A é ancorado no ato crítico; o desvio anterior permanece contexto da janela causal.',
    'Multiple human-factor unsafe-act/condition candidates were identified across the event. SERA analyses one unsafe act at a time; the proposed critical-act anchor is provisional and requires human confirmation of the Hendy boundary.': 'Foram identificados múltiplos candidatos a ato/condição insegura de fatores humanos. O SERA analisa um ato inseguro por vez; a âncora crítica proposta é provisória e requer confirmação humana da fronteira Hendy.',
  }
  if (pt) {
    const exact = ptMap[localized] ?? ptMap[value]
    if (exact) return exact
    const dynamic = localized
      .replace(/^Explicit no-return\/irreversibility boundary preserved from the source:\s*/i, 'Marco explícito de irreversibilidade/sem retorno preservado da fonte: ')
      .replace(/^Critical-act alternatives remain close in trajectory support and require human review:\s*/i, 'Alternativas de ato crítico permanecem próximas em suporte causal e exigem revisão humana: ')
      .replace(/^Multiple departure candidates remain inside the selected operational episode; Hendy first-departure and critical-act landmarks are retained separately for review\.?$/i, 'Permanecem múltiplos candidatos de desvio no episódio operacional selecionado; os marcos Hendy de primeira saída e ato crítico são preservados separadamente para revisão.')
      .replace(/^No explicit consequence boundary was detected inside the selected operational episode; multiple departure moments require review\.?$/i, 'Não foi detectada uma fronteira explícita de consequência no episódio operacional selecionado; múltiplos momentos de desvio exigem revisão.')
      .replace(/^No explicit pre-outcome controllable departure statement was found in admissible factual evidence\.?$/i, 'Nenhuma saída controlável anterior ao desfecho foi encontrada na evidência factual admissível.')
      .replace(/^The narrative explicitly describes the departure as progressive across multiple moments; retain a progressive-zone boundary for human review\.?$/i, 'O relato descreve explicitamente o desvio como progressivo ao longo de vários momentos; manter uma fronteira de zona progressiva para revisão humana.')
      .replace(/^Visual continuation was followed by a developing unsafe energy state; the safe-operation boundary is retained as a progressive zone\.?$/i, 'A continuação visual foi seguida por desenvolvimento de estado energético inseguro; a fronteira da operação segura é mantida como zona progressiva.')
      .replace(/^Human clarification identifies an observable unsafe act\/inaction or operator-controlled unsafe condition\.?$/i, 'O esclarecimento humano identifica um ato/omissão inseguro observável ou uma condição insegura controlada pelo operador.')
    return dynamic
  }
  const reverse = new Map(Object.entries(ptMap).map(([en, ptText]) => [ptText, en]))
  return reverse.get(localized) ?? localized
}

function guardrailLabel(name: string, violated: boolean, pt: boolean): string {
  const violationPt: Record<string, string> = {
    consequenceUsedAsCause: 'Consequência utilizada indevidamente como causa', postEscapeHuntingDetected: 'Busca causal após o ponto de fuga',
    postEscapeEvidenceUsed: 'Evidência pós-ponto de fuga usada na causalidade', oeUsed: 'Código O-E inexistente utilizado',
    inventedQuestionDetected: 'Pergunta canônica inventada ou reconstruída', actorMigrationDetected: 'Migração indevida do ator causal',
    preconditionUsedAsEscapePoint: 'Pré-condição utilizada como ponto de fuga', codeFirstPathDetected: 'Código definido antes da travessia metodológica',
    awarenessMissingForViolation: 'Violação atribuída sem evidência de consciência da regra',
    nonCausalEvidenceUsed: 'Evidência documental não causal utilizada na classificação',
    escapePointReferenceContamination: 'Material de referência utilizado como ponto de fuga',
    candidateEvidenceMinimumMissing: 'Código candidato sem evidência mínima específica',
  }
  const safePt: Record<string, string> = {
    consequenceUsedAsCause: 'Consequência não utilizada como causa', postEscapeHuntingDetected: 'Nenhuma busca causal após o ponto de fuga',
    postEscapeEvidenceUsed: 'Evidência pós-ponto de fuga não utilizada na causalidade', oeUsed: 'Código O-E inexistente não utilizado',
    inventedQuestionDetected: 'Nenhuma pergunta canônica inventada ou reconstruída', actorMigrationDetected: 'Nenhuma migração indevida do ator causal',
    preconditionUsedAsEscapePoint: 'Pré-condição não utilizada como ponto de fuga', codeFirstPathDetected: 'Código não definido antes da travessia metodológica',
    awarenessMissingForViolation: 'Nenhuma violação atribuída sem evidência de consciência da regra',
    nonCausalEvidenceUsed: 'Evidência documental não causal não utilizada na classificação',
    escapePointReferenceContamination: 'Material de referência não utilizado como ponto de fuga',
    candidateEvidenceMinimumMissing: 'Nenhum código candidato sem evidência mínima específica',
  }
  const violationEn: Record<string, string> = {
    consequenceUsedAsCause: 'Consequence improperly used as cause', postEscapeHuntingDetected: 'Post-escape causal hunting',
    postEscapeEvidenceUsed: 'Post-escape evidence used causally', oeUsed: 'Nonexistent O-E code used',
    inventedQuestionDetected: 'Canonical question invented or reconstructed', actorMigrationDetected: 'Improper causal actor migration',
    preconditionUsedAsEscapePoint: 'Precondition used as escape point', codeFirstPathDetected: 'Code selected before methodological traversal',
    awarenessMissingForViolation: 'Violation attributed without rule-awareness evidence',
    nonCausalEvidenceUsed: 'Non-causal document evidence used in classification',
    escapePointReferenceContamination: 'Reference material used as the escape point',
    candidateEvidenceMinimumMissing: 'Candidate code lacks code-specific minimum evidence',
  }
  const safeEn: Record<string, string> = {
    consequenceUsedAsCause: 'Consequence not used as cause', postEscapeHuntingDetected: 'No post-escape causal hunting detected',
    postEscapeEvidenceUsed: 'Post-escape evidence not used causally', oeUsed: 'Nonexistent O-E code not used',
    inventedQuestionDetected: 'No canonical question invented or reconstructed', actorMigrationDetected: 'No improper causal actor migration',
    preconditionUsedAsEscapePoint: 'Precondition not used as escape point', codeFirstPathDetected: 'Code not selected before methodological traversal',
    awarenessMissingForViolation: 'No violation attributed without rule-awareness evidence',
    nonCausalEvidenceUsed: 'Non-causal document evidence not used in classification',
    escapePointReferenceContamination: 'Reference material not used as the escape point',
    candidateEvidenceMinimumMissing: 'No candidate code lacks code-specific minimum evidence',
  }
  const map = pt ? (violated ? violationPt : safePt) : (violated ? violationEn : safeEn)
  return map[name] ?? name
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

  doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
  doc.font('Helvetica-Bold').fontSize(9).fillColor(accent).text(L('PARTE I  -  LEITURA OPERACIONAL', 'PART I  -  OPERATIONAL READING'))
  doc.moveDown(0.35)
  doc.font('Helvetica-Bold').fontSize(20).fillColor(PDF_COLORS.navy).text(`${title}  -  ${code}`)
  doc.font('Helvetica').fontSize(10).fillColor(PDF_COLORS.muted)
    .text(L('Caminho SERA explicado passo a passo, sem repetir a árvore completa.', 'SERA path explained step by step without repeating the full tree.'), { lineGap: 2 })
  doc.moveDown(0.6)

  const rootAnswer = path.answers[0] ? pathAnswerText(path.answers[0], path, output, pt) : L('Não estabelecido pela evidência disponível.', 'Not established by the available evidence.')
  const x = doc.page.margins.left
  const w = pageContentWidth(doc)
  const cardText = meaning ? `${rootAnswer}\n\n${meaning}` : rootAnswer
  doc.font('Helvetica').fontSize(10.6)
  const cardH = Math.max(112, doc.heightOfString(cardText, { width: w - 32, lineGap: 3 }) + 62)
  const resultY = doc.y
  doc.roundedRect(x, resultY, w, cardH, 9).fillAndStroke(fill, '#D5DEE6')
  doc.font('Helvetica-Bold').fontSize(8.8).fillColor(accent).text(L('RESULTADO DO EIXO', 'AXIS RESULT'), x + 16, resultY + 13)
  doc.font('Helvetica-Bold').fontSize(24).fillColor(PDF_COLORS.navy).text(code, x + 16, resultY + 31, { width: 90 })
  doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF_COLORS.ink)
    .text(candidateStatusLabel(axis.status, pt), x + 108, resultY + 36, { width: w - 124 })
  let cy = resultY + 63
  doc.font('Helvetica-Bold').fontSize(9.2).fillColor(accent).text(L('Resposta inicial SERA', 'Initial SERA answer'), x + 16, cy)
  cy += 15
  doc.font('Helvetica').fontSize(10.6).fillColor(PDF_COLORS.ink).text(rootAnswer, x + 16, cy, { width: w - 32, lineGap: 3 })
  cy += doc.heightOfString(rootAnswer, { width: w - 32, lineGap: 3 }) + 8
  if (meaning) {
    doc.font('Helvetica').fontSize(9.5).fillColor(PDF_COLORS.muted).text(meaning, x + 16, cy, { width: w - 32, lineGap: 2.4 })
  }
  doc.y = resultY + cardH + 16
  doc.x = x

  doc.font('Helvetica-Bold').fontSize(12).fillColor(PDF_COLORS.navy).text(L('Trajetória percorrida', 'Traversed path'))
  doc.moveDown(0.25)
  doc.font('Helvetica').fontSize(9.5).fillColor(PDF_COLORS.muted)
    .text(L('Cada etapa mostra a pergunta canônica, a resposta e o motivo do ramo. A evidência completa de cada nó fica no apêndice técnico.', 'Each step shows the canonical question, answer, and branch rationale. Full evidence for every node is kept in the technical appendix.'), { lineGap: 2.3 })
  doc.moveDown(0.6)

  for (let index = 0; index < path.answers.length; index += 1) {
    const answer = path.answers[index]
    const q = canonicalQuestion(answer, pt)
    const response = pathAnswerText(answer, path, output, pt)
    const rationale = didacticReason(answer.nodeId, answer.answer, localizeRationale(answer.rationale ?? '', pt ? 'pt-BR' : 'en'), pt)
    const cardW = w - 38
    doc.font('Helvetica').fontSize(9.6)
    const qH = doc.heightOfString(q, { width: cardW - 28, lineGap: 2.2 })
    doc.font('Helvetica-Bold').fontSize(10.1)
    const aH = doc.heightOfString(response, { width: cardW - 28, lineGap: 2.3 })
    doc.font('Helvetica').fontSize(9.2)
    const rH = doc.heightOfString(rationale, { width: cardW - 28, lineGap: 2.1 })
    const h = Math.max(88, 50 + qH + aH + rH)
    if (doc.y + h > pageBottom(doc)) {
      doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
      doc.font('Helvetica-Bold').fontSize(9).fillColor(accent).text(`${title}  -  ${code}  |  ${L('continuação', 'continued')}`)
      doc.moveDown(0.65)
    }
    const y = doc.y
    doc.strokeColor('#D5DEE6').lineWidth(2).moveTo(x + 13, y + 20).lineTo(x + 13, y + h + 6).stroke()
    doc.circle(x + 13, y + 18, 11).fill(accent)
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#FFFFFF')
      .text(String(index + 1), x + 6.5, y + 12.5, { width: 13, align: 'center', lineBreak: false })
    const cx = x + 34
    doc.roundedRect(cx, y, cardW, h, 8).fillAndStroke('#FFFFFF', '#D5DEE6')
    doc.font('Helvetica-Bold').fontSize(11.2).fillColor(PDF_COLORS.navy)
      .text(friendlyNodeLabel(answer.nodeId, pt), cx + 14, y + 12, { width: cardW - 28 })
    let ty = y + 31
    doc.font('Helvetica').fontSize(9.6).fillColor(PDF_COLORS.muted)
      .text(q, cx + 14, ty, { width: cardW - 28, lineGap: 2.2 })
    ty += qH + 7
    doc.font('Helvetica-Bold').fontSize(10.1).fillColor(answer.terminalCode ? PDF_COLORS.green : PDF_COLORS.ink)
      .text(`${L('Resposta', 'Answer')}: ${response}`, cx + 14, ty, { width: cardW - 28, lineGap: 2.3 })
    ty += aH + 8
    doc.font('Helvetica').fontSize(9.2).fillColor('#536676')
      .text(`${L('Por quê', 'Why')}: ${rationale}`, cx + 14, ty, { width: cardW - 28, lineGap: 2.1 })
    doc.y = y + h + 13
  }
}

function renderCanonicalTreePage(doc: Doc, path: SeraCanonicalPath, output: SeraVNextEngineOutput, pt: boolean): void {
  const model = buildCanonicalFlowVisualModel(path, pt)
  const title = path.axis === 'P' ? (pt ? 'Percepção' : 'Perception') : path.axis === 'O' ? (pt ? 'Objetivo' : 'Objective') : (pt ? 'Ação' : 'Action')
  const { accent, fill: accentLight } = axisAccent(path.axis)
  doc.addPage({ size: 'A4', layout: 'landscape', margin: 34 })
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const width = right - left
  const top = 43
  const bottom = doc.page.height - doc.page.margins.bottom - 38

  doc.font('Helvetica-Bold').fontSize(18).fillColor(PDF_COLORS.navy).text((pt ? 'Árvore canônica SERA  -  ' : 'Canonical SERA tree  -  ') + title, left, top, { width })
  doc.font('Helvetica').fontSize(9.5).fillColor(PDF_COLORS.muted)
    .text(pt ? 'Apêndice técnico. A árvore completa é preservada aqui em página horizontal para manter a topologia legível sem reduzir a tipografia do relatório principal.' : 'Technical appendix. The full tree is preserved here in landscape format to keep the topology legible without shrinking the main report typography.', left, top + 25, { width, lineGap: 2 })

  const legendY = top + 55
  const legendItems = [
    { fill: accentLight, stroke: accent, label: pt ? 'Caminho seguido' : 'Traversed path' },
    { fill: '#FFFFFF', stroke: '#A8B3BF', label: pt ? 'Caminho não seguido' : 'Path not taken' },
    { fill: PDF_COLORS.greenSoft, stroke: PDF_COLORS.green, label: pt ? 'Classificação alcançada' : 'Reached classification' },
  ]
  let lx = left
  for (const item of legendItems) {
    doc.roundedRect(lx, legendY, 22, 10, 2).fillAndStroke(item.fill, item.stroke)
    doc.font('Helvetica').fontSize(8).fillColor(PDF_COLORS.muted).text(item.label, lx + 29, legendY + 1, { width: 130, lineBreak: false })
    lx += 175
  }

  const diagramLeft = left
  const diagramWidth = width
  const treeTop = legendY + 34
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
    if (!outgoing.length) { if (!leafOrder.includes(id)) leafOrder.push(id); return }
    for (const edge of outgoing) collectLeaves(edge.to)
  }
  collectLeaves(root.id)
  for (const leaf of leaves) if (!leafOrder.includes(leaf.id)) leafOrder.push(leaf.id)
  const maxDepth = Math.max(...depth.values(), 1)
  const nodeTop = treeTop + 8
  const nodeBottom = treeBottom - 5
  const levelGap = Math.max(48, (nodeBottom - nodeTop - 52) / maxDepth)
  const leafStep = diagramWidth / Math.max(leafOrder.length, 1)
  const xCenter = new Map<string, number>()
  leafOrder.forEach((id, index) => xCenter.set(id, diagramLeft + leafStep * (index + 0.5)))
  const resolveX = (id: string): number => {
    const cached = xCenter.get(id)
    if (cached !== undefined) return cached
    const xs = (children.get(id) ?? []).map((edge) => resolveX(edge.to))
    const v = xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : diagramLeft + diagramWidth / 2
    xCenter.set(id, v); return v
  }
  resolveX(root.id)
  const geom = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const node of model.nodes) {
    const d = depth.get(node.id); if (d === undefined) continue
    const terminal = node.kind === 'terminal'
    const rootNode = node.sourceId.endsWith('_ROOT')
    const w = terminal ? Math.min(82, Math.max(60, leafStep - 8)) : rootNode ? 125 : 105
    const h = terminal ? 46 : rootNode ? 38 : 54
    geom.set(node.id, { x: resolveX(node.id) - w / 2, y: nodeTop + d * levelGap, w, h })
  }
  for (const edge of model.edges) {
    const a = geom.get(edge.from); const b = geom.get(edge.to); if (!a || !b) continue
    const x1 = a.x + a.w / 2; const y1 = a.y + a.h; const x2 = b.x + b.w / 2; const y2 = b.y
    const color = edge.active ? accent : '#B7C1CB'
    doc.strokeColor(color).lineWidth(edge.active ? 2.4 : 1).moveTo(x1, y1).lineTo(x1, y1 + 9).lineTo(x2, y2 - 9).lineTo(x2, y2).stroke()
    doc.fillColor(color).polygon([x2 - 3, y2 - 5], [x2 + 3, y2 - 5], [x2, y2]).fill()
    if (edge.label) doc.font(edge.active ? 'Helvetica-Bold' : 'Helvetica').fontSize(7).fillColor(edge.active ? accent : '#71808D').text(edge.label, x1 + (x2 - x1) * 0.68 - 25, y1 + (y2 - y1) * 0.56 - 3, { width: 50, align: 'center', lineBreak: false })
  }
  for (const node of model.nodes) {
    const g = geom.get(node.id); if (!g) continue
    const rootNode = node.sourceId.endsWith('_ROOT')
    const fill = node.selected ? PDF_COLORS.greenSoft : node.active ? accentLight : '#FFFFFF'
    const stroke = node.selected ? PDF_COLORS.green : node.active ? accent : '#A8B3BF'
    doc.lineWidth(node.active || node.selected ? 2 : 1)
    if (node.kind === 'terminal') doc.roundedRect(g.x, g.y, g.w, g.h, 9).fillAndStroke(fill, stroke)
    else if (rootNode) doc.roundedRect(g.x, g.y, g.w, g.h, 8).fillAndStroke(fill, stroke)
    else doc.polygon([g.x + g.w / 2, g.y], [g.x + g.w, g.y + g.h / 2], [g.x + g.w / 2, g.y + g.h], [g.x, g.y + g.h / 2]).fillAndStroke(fill, stroke)
    if (node.kind === 'terminal') {
      doc.font('Helvetica-Bold').fontSize(8.2).fillColor(node.selected ? PDF_COLORS.green : '#334155').text(node.code ?? '', g.x + 4, g.y + 6, { width: g.w - 8, align: 'center', lineBreak: false })
      doc.font('Helvetica').fontSize(node.label.length > 24 ? 6.6 : 7.2).fillColor(node.selected ? PDF_COLORS.green : '#596B79').text(node.label, g.x + 4, g.y + 20, { width: g.w - 8, height: 22, align: 'center', lineGap: 0.5 })
    } else {
      if (node.stepNumber) {
        doc.circle(g.x + 10, g.y + 9, 6).fill(accent)
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#FFFFFF').text(String(node.stepNumber), g.x + 6, g.y + 5.2, { width: 8, align: 'center', lineBreak: false })
      }
      doc.font('Helvetica-Bold').fontSize(node.label.length > 28 ? 7.2 : 8).fillColor(node.active ? accent : '#475569').text(node.label, g.x + 12, g.y + (rootNode ? 12 : 16), { width: g.w - 24, align: 'center', height: rootNode ? 18 : 25, lineGap: 0.5 })
    }
  }
}

function renderPath(
  doc: Doc,
  path: SeraCanonicalPath,
  output: SeraVNextEngineOutput,
  pt: boolean,
): void {
  const axis = axisOutput(output, path.axis)
  const L = (ptText: string, enText: string) => pt ? ptText : enText
  const { accent, fill } = axisAccent(path.axis)
  infoCard(doc, `${axisLabel(path.axis, pt)}  -  ${axis.proposedCode ?? L('não resolvido', 'unresolved')}`, axis.statementAtEscapePoint ?? L('Eixo não resolvido pela evidência disponível.', 'Axis unresolved by the available evidence.'), { accent, fill, label: L('Rastreabilidade por nó', 'Node traceability') })
  for (let index = 0; index < path.answers.length; index += 1) {
    const node = path.answers[index]
    keepTogether(doc, 105)
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor(PDF_COLORS.navy).text(`${index + 1}. ${friendlyNodeLabel(node.nodeId, pt)}`)
    meta(doc, L('Resposta', 'Answer'), pathAnswerText(node, path, output, pt))
    meta(doc, L('Confiança do nó', 'Node confidence'), confidenceLabel(node.confidence, pt))
    const support = entries(node.supportingEvidence)
    if (support.length) {
      doc.font('Helvetica-Bold').fontSize(9.4).fillColor(accent).text(L('Evidência usada', 'Evidence used'))
      bullets(doc, support.slice(0, 4))
    }
    const counter = entries(node.counterEvidence)
    if (counter.length) {
      doc.font('Helvetica-Bold').fontSize(9.4).fillColor(PDF_COLORS.amber).text(L('Contraevidência / ressalvas', 'Counter-evidence / caveats'))
      bullets(doc, counter.slice(0, 3))
    }
    doc.moveDown(0.5)
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
        Title: 'HFA SERA 0.3 - ' + analysis.title,
        Subject: L('Relatório metodológico SERA 0.3', 'SERA 0.3 methodological report'),
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const candidateAttentionEligible =
      output.evidenceSufficiency.status === 'SUFFICIENT_FOR_CANDIDATE_ANALYSIS' &&
      output.directActor.status === 'IDENTIFIED' &&
      output.escapePoint.confidence !== 'LOW' &&
      !Object.values(output.guardrails).some(Boolean)
    const candidateAttention = candidateAttentionEligible
      ? computeCandidateAttention(
          output.axes.perception.proposedCode,
          output.axes.objective.proposedCode,
          output.axes.action.proposedCode,
        )
      : null

    doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF_COLORS.blue)
      .text(L('RELATÓRIO METODOLÓGICO HFA / SERA', 'HFA / SERA METHODOLOGICAL REPORT'), { align: 'center' })
    doc.moveDown(0.35)
    doc.font('Helvetica-Bold').fontSize(24).fillColor(PDF_COLORS.navy)
      .text(analysis.title, { align: 'center', lineGap: 2 })
    doc.moveDown(0.18)
    doc.font('Helvetica').fontSize(10.5).fillColor(PDF_COLORS.muted)
      .text(L('SERA 0.3  -  análise candidata para revisão humana', 'SERA 0.3  -  candidate analysis for human review'), { align: 'center' })
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
      L('Ponto de fuga candidato', 'Candidate escape point'),
      value(output.escapePoint.statement, L('Não estabelecido.', 'Not established.')),
      { accent: PDF_COLORS.blue, fill: '#F2F7FC', label: L('Âncora primária P/O/A', 'Primary P/O/A anchor'), minHeight: 82 },
    )

    statRow(doc, [
      { label: L('Ator direto', 'Direct actor'), value: value(localizeActor(output.directActor.actor, locale), L('Não resolvido', 'Unresolved')), accent: PDF_COLORS.blue },
      { label: L('Classificação', 'Classification'), value: [output.axes.perception.proposedCode, output.axes.objective.proposedCode, output.axes.action.proposedCode].map((item) => value(item, '—')).join(' / '), accent: PDF_COLORS.green },
      { label: L('Revisão', 'Review'), value: analysis.review_status, accent: PDF_COLORS.amber },
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
    if (candidateAttention) {
      doc.moveDown(0.45)
      infoCard(
        doc,
        `${candidateAttention.score}/100  -  ${pt ? candidateAttention.labelPt : candidateAttention.labelEn}`,
        L(
          'Índice provisório de atenção operacional baseado nos candidatos P/O/A. Não é ERC/ARMS canônico e não estima probabilidade de acidente.',
          'Provisional operational-attention index based on P/O/A candidates. It is not canonical ERC/ARMS and does not estimate accident probability.',
        ),
        { accent: PDF_COLORS.blue, fill: '#F4F8FC', label: L('Índice HFA de atenção operacional', 'HFA operational-attention index'), minHeight: 68 },
      )
    }

    doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
    heading(doc, '1. ' + L('Linha causal e marcos Hendy', 'Causal line and Hendy landmarks'))
    body(doc, L(
      'A leitura abaixo separa o estado seguro, a primeira saída da operação segura, o ato inseguro crítico que ancora P/O/A e o desfecho posterior. Os marcos não são intercambiáveis.',
      'The sequence below separates the safe state, the first departure from safe operation, the critical unsafe act anchoring P/O/A, and the later outcome. These landmarks are not interchangeable.',
    ), 'justify')
    doc.moveDown(0.55)

    infoCard(doc, L('Operação segura', 'Safe operation'), `${L('Estado', 'State')}: ${value(output.safeOperationModel.expectedSafeState)}\n${L('Ação esperada', 'Expected action')}: ${value(output.safeOperationModel.expectedSafeAction)}`, {
      accent: PDF_COLORS.green,
      fill: '#F2FAF5',
      label: L('1  -  estado esperado', '1  -  expected state'),
    })
    infoCard(doc, L('Primeira saída da operação segura', 'First departure from safe operation'), value(output.escapePoint.firstDepartureCandidate ?? output.escapePoint.earliestCandidate), {
      accent: PDF_COLORS.amber,
      fill: '#FFF9EC',
      label: L('2  -  início da janela causal', '2  -  start of causal window'),
    })
    infoCard(doc, L('Ato/condição insegura crítica', 'Critical unsafe act/condition'), value(output.escapePoint.criticalUnsafeActCandidate ?? output.escapePoint.latestCandidate), {
      accent: PDF_COLORS.red,
      fill: '#FFF4F4',
      label: L('3  -  âncora P/O/A', '3  -  P/O/A anchor'),
    })
    infoCard(doc, L('Desfecho / irreversibilidade', 'Outcome / irreversibility'), value(output.escapePoint.irreversibilityBoundaryCandidate, L('Nenhum marco explícito de irreversibilidade foi estabelecido.', 'No explicit irreversibility boundary was established.')), {
      accent: '#6B7280',
      fill: '#F7F8FA',
      label: L('4  -  posterior ao ato crítico', '4  -  after the critical act'),
    })

    statRow(doc, [
      { label: L('Relação entre os marcos', 'Landmark relationship'), value: landmarkRelationshipLabel(output.escapePoint.anchorBasis, pt), accent: PDF_COLORS.blue },
      { label: L('Ator direto', 'Direct actor'), value: value(localizeActor(output.directActor.actor, locale), L('Não resolvido', 'Unresolved')), accent: PDF_COLORS.blue },
      { label: L('Confiança do ponto', 'Anchor confidence'), value: confidenceLabel(output.escapePoint.confidence, pt), accent: PDF_COLORS.amber },
    ])

    subheading(doc, L('Evidência principal da primeira saída', 'Key evidence for the first departure'))
    bullets(doc, (output.escapePoint.firstDepartureSupportingEvidence ?? []).slice(0, 2), L('Nenhuma evidência específica registrada para este marco.', 'No landmark-specific evidence recorded.'))
    subheading(doc, L('Evidência principal do ato crítico', 'Key evidence for the critical act'))
    bullets(doc, (output.escapePoint.criticalUnsafeActSupportingEvidence ?? output.escapePoint.supportingEvidence).slice(0, 2), L('Nenhuma evidência específica registrada para este marco.', 'No landmark-specific evidence recorded.'))
    if (output.canonicalTraversal.paths.length === 0) {
      doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
      heading(doc, '2. ' + L('P / O / A - análise interrompida', 'P / O / A - analysis stopped'))
      infoCard(doc, L('Travessia canônica não iniciada', 'Canonical traversal not started'), L(
        'O ator direto ou a fronteira do ponto de fuga ainda não permite avançar P/O/A sem inferência. As perguntas de esclarecimento ficam preservadas no apêndice técnico.',
        'The direct actor or escape-point boundary does not yet allow P/O/A traversal without inference. Clarification questions are preserved in the technical appendix.',
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
      'No SERA, as pré-condições explicam por que a falha ativa se tornou mais provável. A Tabela 1 de Hendy e o Anexo B, aplicado por Daumas, indicam as pré-condições mais prováveis para cada tipo de falha. Essa lista orienta a investigação, mas não cria uma pré-condição automaticamente: cada item abaixo continua exigindo evidência do evento.',
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

    heading(doc, '6. ' + L('Correspondência SERA / HFACS', 'SERA / HFACS correspondence'))
    const hfacsBridge = buildSeraHfacsBridge(
      [output.axes.perception.proposedCode, output.axes.objective.proposedCode, output.axes.action.proposedCode],
      supportedPreconditions.map((pc) => pc.canonicalCategory ?? null),
    )
    body(doc, L(
      'Esta é uma ponte de classificação posterior ao SERA, baseada nas Tabelas 3 a 6 de Hendy. Ela não altera o caminho da árvore nem serve para escolher códigos SERA. O próprio Hendy ressalta que a correspondência não é um-para-um e deve ser resolvida pelo contexto do ato inseguro.',
      'This is a post-SERA classification bridge based on Hendy Tables 3–6. It does not alter the tree path or select SERA codes. Hendy explicitly notes that the correspondence is not one-to-one and must be resolved from the unsafe-act context.',
    ), 'justify')
    doc.moveDown(0.25)
    subheading(doc, L('Falhas ativas SERA — melhor correspondência HFACS/AGA135', 'SERA active failures — best-fit HFACS/AGA135 correspondence'))
    bullets(doc, hfacsBridge.activeFailures.map((item) => `${hfacsBridgeLevelLabel(item.level, pt)}: ${item.hfacs}`), L('Nenhuma correspondência disponível enquanto P/O/A permanecer não resolvido.', 'No correspondence is available while P/O/A remains unresolved.'))
    subheading(doc, L('Pré-condições SERA — melhor correspondência HFACS/AGA135', 'SERA preconditions — best-fit HFACS/AGA135 correspondence'))
    bullets(doc, hfacsBridge.preconditions.map((item) => `${hfacsBridgeLevelLabel(item.level, pt)}: ${item.hfacs}`), L('Nenhuma pré-condição confirmada para mapeamento.', 'No confirmed precondition available for mapping.'))

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
          'A análise candidata possui evidência mínima para revisão humana. Antes do uso formal, o revisor deve confirmar o ponto de fuga, o ator, os candidatos P/O/A e as pré-condições.',
          'The candidate analysis has minimum evidence for human review. Before formal use, the reviewer must confirm the escape point, actor, P/O/A candidates, and preconditions.',
        )
      : L(
          'A análise não possui evidência suficiente para fechar P/O/A. O relatório deve ser tratado como pacote de esclarecimento: as razões de bloqueio e perguntas pendentes precisam ser resolvidas antes de qualquer classificação formal ou índice operacional.',
          'The analysis does not have sufficient evidence to close P/O/A. Treat this report as a clarification package: blocking reasons and pending questions must be resolved before any formal classification or operational index.',
        ), 'justify')

    doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
    doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF_COLORS.blue).text(L('PARTE II', 'PART II'))
    doc.moveDown(0.35)
    doc.font('Helvetica-Bold').fontSize(23).fillColor(PDF_COLORS.navy)
      .text(L('Apêndice técnico - rastreabilidade e auditoria', 'Technical appendix - traceability and audit'))
    doc.moveDown(0.35)
    body(doc, L(
      'Esta parte preserva a topologia completa, a evidência por nó, as regras de pré-condição, a proveniência e as salvaguardas. Ela existe para auditoria e reprodutibilidade; a leitura operacional principal termina antes deste apêndice.',
      'This part preserves the full topology, node-level evidence, precondition rules, provenance, and safeguards. It exists for audit and reproducibility; the main operational reading ends before this appendix.',
    ), 'justify')
    doc.moveDown(0.6)

    if (output.canonicalTraversal.paths.length) {
      heading(doc, 'A.1 ' + L('Árvores canônicas completas', 'Full canonical trees'))
      body(doc, L(
        'As árvores aparecem em páginas A4 horizontais, com tipografia maior. O caminho percorrido permanece destacado, mas perguntas e respostas não são repetidas dentro do diagrama.',
        'Trees are shown on A4 landscape pages with larger typography. The traversed path remains highlighted, but questions and answers are not repeated inside the diagram.',
      ))
      for (const path of output.canonicalTraversal.paths) renderCanonicalTreePage(doc, path, output, pt)

      doc.addPage({ size: 'A4', layout: 'portrait', margin: 44 })
      heading(doc, 'A.2 ' + L('Rastreabilidade e evidência por nó', 'Node traceability and evidence'))
      for (const path of output.canonicalTraversal.paths) renderPath(doc, path, output, pt)
    }

    heading(doc, 'A.3 ' + L('Delimitação do ponto de fuga e fronteira causal', 'Escape-point and causal-boundary audit'))
    meta(doc, L('Primeira saída da operação segura', 'First departure from safe operation'), value(output.escapePoint.firstDepartureCandidate ?? output.escapePoint.earliestCandidate))
    meta(doc, L('Ato/condição insegura crítica', 'Critical unsafe act/condition'), value(output.escapePoint.criticalUnsafeActCandidate ?? output.escapePoint.latestCandidate))
    meta(doc, L('Âncora primária P/O/A', 'Primary P/O/A anchor'), value(output.escapePoint.statement))
    meta(doc, L('Relação entre os marcos', 'Relationship between landmarks'), landmarkRelationshipLabel(output.escapePoint.anchorBasis, pt))
    if (output.escapePoint.humanFactorGate) {
      subheading(doc, L('Gate de âncora de Fatores Humanos', 'Human-Factor anchor gate'))
      meta(doc, L('Status do gate', 'Gate status'), pt ? (output.escapePoint.humanFactorGate.status === 'PASSED' ? 'ATENDIDO' : 'BLOQUEADO') : output.escapePoint.humanFactorGate.status)
      meta(doc, L('Tipo de âncora SERA', 'SERA anchor type'), value(output.escapePoint.humanFactorGate.anchorType))
      bullets(doc, output.escapePoint.humanFactorGate.rationale.map((item) => translateReportText(item, pt)))
    }
    const appendixAlternativeEpisodes = (output.escapePoint.episodeCandidates ?? []).filter((episode) => !episode.selected)
    if (appendixAlternativeEpisodes.length) {
      subheading(doc, L('Outras sequências detectadas - não são pontos de fuga automáticos', 'Other detected sequences - not automatic escape points'))
      bullets(doc, appendixAlternativeEpisodes.slice(0, 8).map((episode) => `${episode.phase} / ${episode.seraRole ?? 'UNRESOLVED'}: ${episode.anchorStatement}`))
    }
    subheading(doc, L('Contraevidência / incertezas da fronteira', 'Counter-evidence / boundary uncertainties'))
    bullets(doc, output.escapePoint.counterEvidence.slice(0, 8).map((item) => translateReportText(item, pt)), L('Nenhuma contraevidência registrada.', 'No counter-evidence recorded.'))
    subheading(doc, L('Evidência posterior excluída da cadeia causal', 'Post-escape evidence excluded from the causal chain'))
    bullets(doc, output.escapePoint.excludedPostEscapeEvidence.slice(0, 8), L('Nenhum item registrado.', 'No item recorded.'))

    heading(doc, 'A.4 ' + L('Rastreabilidade integral das pré-condições', 'Full precondition traceability'))
    if (!output.preconditions.length) {
      body(doc, L('Nenhuma pré-condição candidata registrada.', 'No candidate precondition recorded.'))
    } else {
      for (const pc of output.preconditions) {
        const canonicalMeta = pc.canonicalCategory ? SERA_PRECONDITION_META[pc.canonicalCategory] : null
        const canonicalName = canonicalMeta ? (pt ? canonicalMeta.pt : canonicalMeta.en) : categoryLabel(pc.category)
        infoCard(doc, `${canonicalName}  -  ${confidenceLabel(pc.confidence, pt)}`, pc.description, {
          accent: pc.relationship === 'CONTEXTUAL_PRECONDITION' || pc.relationship === 'ENABLING_PRECONDITION' ? PDF_COLORS.blue : PDF_COLORS.amber,
          fill: '#F8FAFC',
        })
        if (canonicalMeta) meta(doc, L('Nível SERA', 'SERA level'), preconditionLevelLabel(canonicalMeta.level, pt))
        if (pc.methodologyMatch) meta(doc, L('Relação com a tabela de pré-condições prováveis', 'Relationship to the most-likely preconditions table'), preconditionMethodologyMatchLabel(pc.methodologyMatch, pt))
        if (pc.likelyForActiveFailureCodes?.length) meta(doc, L('Pré-condição provável para', 'Most likely for'), pc.likelyForActiveFailureCodes.join(', '))
        meta(doc, L('Relação com a falha', 'Relationship to the failure'), relationshipLabel(pc.relationship))
        meta(doc, L('Ator associado', 'Associated actor'), value(localizeActor(pc.linkedActor, locale)))
        meta(doc, L('Regra(s) de origem', 'Source rule(s)'), pc.sourceRuleIds.join(', '))
        subheading(doc, L('Evidência registrada', 'Recorded evidence'))
        bullets(doc, pc.evidence.slice(0, 8))
        doc.moveDown(0.5)
      }
    }

    heading(doc, 'A.5 ' + L('Proveniência e controle metodológico', 'Provenance and methodological control'))
    meta(doc, L('ID da análise', 'Analysis ID'), analysis.id)
    meta(doc, L('Motor SERA (runtime)', 'SERA engine (runtime)'), value(analysis.engine_runtime_version, input.versions.engineRuntimeVersion))
    meta(doc, L('Contrato de persistência do motor', 'Engine persistence contract'), analysis.engine_version)
    meta(doc, L('Metodologia', 'Methodology'), analysis.methodology_version)
    meta(doc, 'Baseline', analysis.baseline_id)
    meta(doc, 'Fixture set', analysis.fixture_set_id)
    meta(doc, L('Árvore canônica', 'Canonical tree'), value(analysis.canonical_tree_version))
    meta(doc, L('Commit da execução da análise', 'Analysis execution commit'), analysis.code_commit)
    meta(doc, L('Commit do runtime que gerou este relatório', 'Report runtime commit'), input.versions.codeCommit)
    meta(doc, L('Fonte do commit do runtime', 'Runtime commit source'), input.versions.codeCommitSource)
    meta(doc, 'Vercel deployment ID', value(input.versions.deploymentId))
    meta(doc, L('Hash do relato', 'Narrative hash'), analysis.narrative_hash)
    meta(doc, L('Hash da saída', 'Output hash'), analysis.engine_output_hash)
    meta(doc, 'Status', analysis.status + ' / ' + analysis.review_status)
    meta(doc, L('Revisão corrente', 'Current revision'), String(analysis.current_revision))
    meta(doc, L('Contrato do produto', 'Product contract'), input.versions.engineVersion)
    meta(doc, L('Runtime executável', 'Executable runtime'), input.versions.engineRuntimeVersion)
    meta(doc, L('Schema de entrada', 'Input schema'), input.versions.inputSchemaVersion)
    meta(doc, L('Schema de saída', 'Output schema'), input.versions.outputSchemaVersion)

    heading(doc, 'A.6 ' + L('Rastreabilidade e polaridade da evidência', 'Evidence traceability and polarity'))
    const evidenceItems = output.factualExtraction.evidence
    const rejected = evidenceItems.filter((item) => item.assertionStatus === 'REJECTED_AS_FACTOR')
    const uncertain = evidenceItems.filter((item) =>
      item.assertionStatus === 'UNCERTAIN' &&
      item.sourceSection !== 'RECOMMENDATION' &&
      item.occurrenceScope !== 'HISTORICAL_COMPARATOR' &&
      !['NON_CAUSAL_DOCUMENT', 'REFERENCE_PROCEDURE', 'SYSTEM_DESCRIPTION'].includes(item.evidenceType),
    )
    const postEscape = evidenceItems.filter((item) => item.temporalRelation === 'POST_ESCAPE')
    const analysisOnly = evidenceItems.filter((item) => item.sourceSection === 'REPORT_ANALYSIS' || item.sourceSection === 'RECOMMENDATION')
    const referenceOnly = evidenceItems.filter((item) => ['NON_CAUSAL_DOCUMENT', 'REFERENCE_PROCEDURE', 'SYSTEM_DESCRIPTION'].includes(item.evidenceType))
    const historicalComparators = evidenceItems.filter((item) => item.occurrenceScope === 'HISTORICAL_COMPARATOR')
    const currentEventItems = evidenceItems.filter((item) => item.occurrenceScope === 'CURRENT_EVENT')
    meta(doc, L('Itens de evidência indexados', 'Indexed evidence items'), String(evidenceItems.length))
    meta(doc, L('Fatores explicitamente rejeitados no relatório-fonte', 'Factors explicitly rejected by the source report'), String(rejected.length))
    meta(doc, L('Hipóteses/afirmações incertas do relatório-fonte', 'Source-report hypotheses/uncertain statements'), String(uncertain.length))
    meta(doc, L('Itens pós-ponto de fuga', 'Post-escape items'), String(postEscape.length))
    meta(doc, L('Itens de análise/recomendação não usados como fato causal', 'Analysis/recommendation items not used as causal facts'), String(analysisOnly.length))
    meta(doc, L('Material documental/de referência excluído da causalidade', 'Document/reference material excluded from causality'), String(referenceOnly.length))
    meta(doc, L('Itens do evento atual', 'Current-event items'), String(currentEventItems.length))
    meta(doc, L('Itens históricos/comparadores proibidos como causa direta', 'Historical/comparator items prohibited as direct causes'), String(historicalComparators.length))
    subheading(doc, L('Fatores que o relatório-fonte declarou como não contribuintes', 'Factors the source report declared non-contributory'))
    bullets(doc, rejected.slice(0, 8).map((item) => item.statement))
    subheading(doc, L('Hipóteses do relatório-fonte preservadas separadamente (não são incertezas do motor)', 'Source-report hypotheses retained separately (not engine uncertainties)'))
    bullets(doc, uncertain.slice(0, 8).map((item) => item.statement))
    subheading(doc, L('Fatos posteriores ao ponto de fuga, mantidos em quarentena causal', 'Post-escape facts kept in causal quarantine'))
    bullets(doc, postEscape.slice(0, 8).map((item) => item.statement))

    heading(doc, 'A.7 ' + L('Salvaguardas metodológicas', 'Methodological safeguards'))
    for (const [name, violated] of Object.entries(output.guardrails)) {
      const evidence = output.guardrailEvidence[name] ?? []
      doc.font('Helvetica-Bold').fontSize(8.8)
        .fillColor(violated ? '#9b2c2c' : '#2f6f4e')
        .text((violated ? L('VIOLAÇÃO', 'VIOLATION') : 'OK') + ' - ' + guardrailLabel(name, violated, pt))
      if (evidence.length) bullets(doc, evidence)
      doc.moveDown(0.22)
    }

    heading(doc, 'A.8 ' + L('Suficiência da evidência', 'Evidence sufficiency'))
    meta(doc, 'Status', output.evidenceSufficiency.status)
    meta(doc, L('Evidência mínima satisfeita', 'Minimum evidence satisfied'), output.evidenceSufficiency.minimumEvidenceSatisfied ? L('SIM', 'YES') : L('NÃO', 'NO'))
    subheading(doc, L('Razões de bloqueio', 'Blocking reasons'))
    bullets(doc, output.evidenceSufficiency.blockingReasons)
    if (output.evidenceSufficiency.questions.length) {
      subheading(doc, L('Perguntas investigativas necessárias antes de concluir', 'Investigative questions required before conclusion'))
      for (const [index, item] of output.evidenceSufficiency.questions.entries()) {
        keepTogether(doc, 90)
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#8a5a00')
          .text(`${L('Pergunta', 'Question')} ${index + 1} — ${item.stage}${item.linkedNodeId ? ` — ${L('nó', 'node')} ${item.linkedNodeId}` : ''}`)
        body(doc, item.question, 'justify')
        meta(doc, L('Por que é necessária', 'Why it is needed'), item.whyNeeded)
        subheading(doc, L('Evidência solicitada', 'Requested evidence'))
        bullets(doc, item.requestedEvidence)
        doc.moveDown(0.35)
      }
    } else {
      body(doc, L('Nenhuma pergunta adicional é necessária para a análise SERA atual.', 'No additional question is required for the current SERA analysis.'))
    }

    heading(doc, 'A.9 ' + L('Incertezas, limitações e perguntas em aberto', 'Uncertainties, limitations, and open questions'))
    subheading(doc, L('Incertezas', 'Uncertainties'))
    bullets(doc, output.uncertainties.map((item) => translateReportText(item, pt)))
    subheading(doc, L('Limitações', 'Limitations'))
    bullets(doc, output.limitations.map((item) => translateReportText(item, pt)))
    subheading(doc, L('Perguntas canônicas ainda não respondidas', 'Canonical questions not yet answered'))
    bullets(doc, output.canonicalTraversal.unansweredQuestions.map((item) => translateReportText(item, pt)))

    heading(doc, 'A.10 ' + L('Pacote de revisão humana', 'Human review package'))
    subheading(doc, L('Decisões requeridas do revisor', 'Reviewer decisions required'))
    bullets(doc, output.humanReviewPackage.reviewerDecisionsRequired.map((item) => translateReportText(item, pt)))
    subheading(doc, L('Avisos críticos', 'Critical warnings'))
    bullets(doc, output.humanReviewPackage.criticalWarnings.map((item) => translateReportText(item, pt)))

    subheading(doc, L('Revisões registradas', 'Recorded reviews'))
    if (!input.reviews.length) {
      body(doc, L('Nenhuma revisão humana registrada até o momento.', 'No human review has been recorded yet.'))
    } else {
      for (const review of input.reviews) {
        keepTogether(doc, 90)
        meta(doc, L('Decisão', 'Decision'), review.decision)
        meta(doc, L('Evidência suficiente', 'Evidence sufficient'), review.evidence_sufficiency)
        meta(doc, L('Requer mais evidência', 'Requires more evidence'), review.requires_more_evidence ? L('SIM', 'YES') : L('NÃO', 'NO'))
        meta(doc, L('Data', 'Date'), review.created_at)
        if (review.review_notes) body(doc, L('Notas: ', 'Notes: ') + review.review_notes)
        doc.moveDown(0.4)
      }
    }

    heading(doc, 'A.11 ' + L('Nota de uso e revisão', 'Use and review note'))
    body(
      doc,
      L(
        'Este relatório documenta a análise metodológica produzida pelo motor SERA 0.3 e sua trilha de decisão. A liberação formal continua condicionada à revisão humana. O revisor deve confirmar o ponto de fuga, o ator direto, cada eixo P/O/A, as pré-condições e qualquer evidência conflitante antes do uso formal.',
        'This report documents the methodological analysis produced by SERA engine 0.3 and its decision trace. Formal release remains subject to human review. The reviewer must confirm the escape point, direct actor, each P/O/A axis, preconditions, and any conflicting evidence before formal use.',
      ),
      'justify',
    )

    applyPageChrome(doc, analysis.title, analysis.id, input.versions.codeCommit, pt)
    doc.end()
  })
}

export const generateSeraVNextPdfBuffer = generateSeraVNextDetailedPdfBuffer
