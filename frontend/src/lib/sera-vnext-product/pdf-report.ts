// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit/js/pdfkit.standalone.js') as typeof import('pdfkit')

import type { SeraCanonicalPath, SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { localizeActor, localizeAssuranceText, localizeRationale } from '@/lib/sera-vnext/engine-v0/localization'
import { SERA_PT_V1_TREE } from '@/lib/sera-vnext/canonical-tree/sera-pt-v1'
import { buildExecutiveSummary, computeCandidateAttention, friendlyAnswerLabel, friendlyNodeLabel } from '@/lib/sera-vnext/presentation'
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

function keepTogether(doc: Doc, height = 110): void {
  if (doc.y + height > doc.page.height - doc.page.margins.bottom - 18) doc.addPage()
}

function heading(doc: Doc, title: string): void {
  keepTogether(doc, 56)
  doc.moveDown(0.75)
  doc.font('Helvetica-Bold').fontSize(13).fillColor('#173f67').text(title)
  doc.moveDown(0.22)
  doc.strokeColor('#b9c8d6').lineWidth(0.6)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke()
  doc.moveDown(0.48)
}

function subheading(doc: Doc, title: string): void {
  keepTogether(doc, 35)
  doc.font('Helvetica-Bold').fontSize(10.2).fillColor('#31485e').text(title)
  doc.moveDown(0.15)
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
  doc.font('Helvetica').fontSize(9).fillColor('#263746').text(cleanDisplayText(text || '-'), {
    align,
    lineGap: 1.6,
  })
}

function meta(doc: Doc, label: string, data: string): void {
  keepTogether(doc, 24)
  doc.font('Helvetica-Bold').fontSize(8.3).fillColor('#5c6d7b').text(label + ': ', { continued: true })
  doc.font('Helvetica').fillColor('#263746').text(data || '-')
}

function bullets(doc: Doc, items: string[], empty = '-'): void {
  if (!items.length) {
    doc.font('Helvetica-Oblique').fontSize(8.5).fillColor('#748390').text(empty)
    return
  }

  for (const item of items) {
    keepTogether(doc, 34)
    doc.font('Helvetica').fontSize(8.5).fillColor('#33475a').text('- ' + cleanDisplayText(item), {
      indent: 10,
      lineGap: 1.2,
    })
    doc.moveDown(0.1)
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
  }
  if (pt) return ptMap[localized] ?? ptMap[value] ?? localized
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

function renderCanonicalTreePage(doc: Doc, path: SeraCanonicalPath, output: SeraVNextEngineOutput, pt: boolean): void {
  const model = buildCanonicalFlowVisualModel(path, pt)
  const title = path.axis === 'P'
    ? (pt ? 'Percepção' : 'Perception')
    : path.axis === 'O'
      ? (pt ? 'Objetivo' : 'Objective')
      : (pt ? 'Ação' : 'Action')
  const accent = path.axis === 'P' ? '#0e7490' : path.axis === 'O' ? '#b45309' : '#be123c'
  const accentLight = path.axis === 'P' ? '#ecfeff' : path.axis === 'O' ? '#fffbeb' : '#fff1f2'

  doc.addPage({ size: 'A4', layout: 'landscape', margin: 32 })
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const top = 30
  const width = right - left
  const bottom = doc.page.height - doc.page.margins.bottom

  doc.font('Helvetica-Bold').fontSize(14).fillColor('#173f67')
    .text((pt ? 'Árvore SERA — ' : 'SERA tree — ') + title, left, top, { width })
  doc.font('Helvetica').fontSize(8).fillColor('#5d6e7c')
    .text(
      pt
        ? `Topologia canônica preservada. À esquerda, a árvore completa; à direita, as perguntas e respostas do percurso até ${path.candidateCode ?? 'resultado não resolvido'}.`
        : `Canonical topology preserved. The full tree is on the left; traversed questions and answers are on the right through ${path.candidateCode ?? 'an unresolved result'}.`,
      left,
      top + 21,
      { width },
    )

  const legendY = top + 43
  const legendItems = [
    { fill: accentLight, stroke: accent, label: pt ? 'Caminho seguido' : 'Traversed path' },
    { fill: '#ffffff', stroke: '#a8b3bf', label: pt ? 'Caminho não seguido' : 'Path not taken' },
    { fill: '#ecfdf5', stroke: '#15803d', label: pt ? 'Classificação alcançada' : 'Reached classification' },
  ]
  let legendX = left
  for (const item of legendItems) {
    doc.roundedRect(legendX, legendY, 19, 9, 2).fillAndStroke(item.fill, item.stroke)
    doc.font('Helvetica').fontSize(7).fillColor('#536676').text(item.label, legendX + 25, legendY + 1, { width: 112, lineBreak: false })
    legendX += 148
  }

  const diagramLeft = left
  const diagramWidth = width * 0.59
  const panelGap = 20
  const panelLeft = diagramLeft + diagramWidth + panelGap
  const panelWidth = right - panelLeft
  const treeTop = legendY + 30
  const treeBottom = bottom - 8

  // Right-side didactic panel: full question + substantive/branch response.
  doc.roundedRect(panelLeft, treeTop - 7, panelWidth, treeBottom - treeTop + 14, 7)
    .fillAndStroke('#fbfdff', '#d8e1e8')
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#31485e')
    .text(pt ? 'Trajetória percorrida' : 'Traversed route', panelLeft + 10, treeTop + 3, { width: panelWidth - 20 })
  doc.font('Helvetica').fontSize(6.5).fillColor('#657583')
    .text(pt ? 'A numeração corresponde aos nós destacados na árvore.' : 'Numbers match the highlighted tree nodes.', panelLeft + 10, treeTop + 16, { width: panelWidth - 20 })

  const panelCardsTop = treeTop + 33
  const answerCount = Math.max(path.answers.length, 1)
  const panelAvailable = treeBottom - panelCardsTop - 5
  const cardGap = 5
  const cardH = Math.min(108, Math.max(54, (panelAvailable - cardGap * (answerCount - 1)) / answerCount))
  path.answers.forEach((answer, index) => {
    const y = panelCardsTop + index * (cardH + cardGap)
    const terminal = Boolean(answer.terminalCode)
    doc.roundedRect(panelLeft + 8, y, panelWidth - 16, cardH, 5)
      .fillAndStroke(terminal ? '#f0fdf4' : '#ffffff', terminal ? '#86b99a' : '#cbd5e1')
    doc.circle(panelLeft + 20, y + 13, 7).fill(accent)
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff')
      .text(String(index + 1), panelLeft + 16, y + 9.2, { width: 8, align: 'center', lineBreak: false })
    doc.font('Helvetica-Bold').fontSize(6.8).fillColor('#31485e')
      .text(friendlyNodeLabel(answer.nodeId, pt), panelLeft + 32, y + 5, { width: panelWidth - 48, height: 10 })

    const canonicalQuestion = pt
      ? (SERA_PT_V1_TREE.nodes.find((item) => item.nodeId === answer.nodeId)?.question ?? answer.question)
      : (answer.exactQuestionTextENAnchor ?? answer.question)
    const response = pathAnswerText(answer, path, output, pt)
    const qFont = canonicalQuestion.length > 175 ? 5.7 : canonicalQuestion.length > 110 ? 6.1 : 6.4
    const responseFont = response.length > 170 ? 5.6 : response.length > 100 ? 6.0 : 6.4
    const qTop = y + 18
    const qHeight = Math.max(18, cardH * 0.43)
    doc.font('Helvetica').fontSize(qFont).fillColor('#536676')
      .text((pt ? 'Pergunta: ' : 'Question: ') + canonicalQuestion, panelLeft + 14, qTop, { width: panelWidth - 28, height: qHeight })
    doc.font('Helvetica-Bold').fontSize(responseFont).fillColor(terminal ? '#166534' : '#263746')
      .text((pt ? 'Resposta: ' : 'Answer: ') + response, panelLeft + 14, qTop + qHeight, { width: panelWidth - 28, height: Math.max(16, cardH - qHeight - 23) })
  })

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
  const nodeTop = treeTop + 6
  const nodeBottom = treeBottom - 5
  const levelGap = Math.max(48, (nodeBottom - nodeTop - 30) / maxDepth)
  const leafStep = diagramWidth / Math.max(leafOrder.length, 1)
  const xCenter = new Map<string, number>()
  leafOrder.forEach((id, index) => xCenter.set(id, diagramLeft + leafStep * (index + 0.5)))
  const resolveX = (id: string): number => {
    const cached = xCenter.get(id)
    if (cached !== undefined) return cached
    const outgoing = children.get(id) ?? []
    const xs = outgoing.map((edge) => resolveX(edge.to))
    const value = xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : diagramLeft + diagramWidth / 2
    xCenter.set(id, value)
    return value
  }
  resolveX(root.id)

  const geom = new Map<string, { x: number; y: number; w: number; h: number }>()
  for (const node of model.nodes) {
    const d = depth.get(node.id)
    if (d === undefined) continue
    const isTerminal = node.kind === 'terminal'
    const isRoot = node.sourceId.endsWith('_ROOT')
    const w = isTerminal ? Math.min(54, Math.max(38, leafStep - 5)) : isRoot ? 96 : 80
    const h = isTerminal ? 28 : isRoot ? 30 : 44
    const cx = resolveX(node.id)
    const y = nodeTop + d * levelGap
    geom.set(node.id, { x: cx - w / 2, y, w, h })
  }

  // Edges first so nodes remain visually crisp.
  for (const edge of model.edges) {
    const a = geom.get(edge.from)
    const b = geom.get(edge.to)
    if (!a || !b) continue
    const x1 = a.x + a.w / 2
    const y1 = a.y + a.h
    const x2 = b.x + b.w / 2
    const y2 = b.y
    const color = edge.active ? accent : '#b6c0c9'
    doc.strokeColor(color).lineWidth(edge.active ? 2.1 : 0.8)
      .moveTo(x1, y1).lineTo(x1, y1 + 7).lineTo(x2, y2 - 7).lineTo(x2, y2).stroke()
    doc.fillColor(color).polygon([x2 - 2.6, y2 - 4.5], [x2 + 2.6, y2 - 4.5], [x2, y2]).fill()
    if (edge.label) {
      const labelX = x1 + (x2 - x1) * 0.70
      const labelY = y1 + (y2 - y1) * 0.58 - 3
      doc.font(edge.active ? 'Helvetica-Bold' : 'Helvetica').fontSize(5.1)
        .fillColor(edge.active ? accent : '#6f7d89')
        .text(edge.label, labelX - 22, labelY, { width: 44, align: 'center', lineBreak: false })
    }
  }

  for (const node of model.nodes) {
    const g = geom.get(node.id)
    if (!g) continue
    const isRoot = node.sourceId.endsWith('_ROOT')
    const fill = node.selected ? '#ecfdf5' : node.active ? accentLight : '#ffffff'
    const stroke = node.selected ? '#15803d' : node.active ? accent : '#a8b3bf'
    doc.lineWidth(node.active || node.selected ? 1.8 : 0.8)
    if (node.kind === 'terminal') {
      doc.roundedRect(g.x, g.y, g.w, g.h, 8).fillAndStroke(fill, stroke)
    } else if (isRoot) {
      doc.roundedRect(g.x, g.y, g.w, g.h, 7).fillAndStroke(fill, stroke)
    } else {
      doc.polygon(
        [g.x + g.w / 2, g.y],
        [g.x + g.w, g.y + g.h / 2],
        [g.x + g.w / 2, g.y + g.h],
        [g.x, g.y + g.h / 2],
      ).fillAndStroke(fill, stroke)
    }

    if (node.kind === 'terminal') {
      doc.font('Helvetica-Bold').fontSize(6.7).fillColor(node.selected ? '#166534' : '#334155')
        .text(node.code ?? '', g.x + 3, g.y + 4, { width: g.w - 6, align: 'center', lineBreak: false })
      doc.font('Helvetica').fontSize(4.8).fillColor(node.selected ? '#166534' : '#64748b')
        .text(node.label, g.x + 2, g.y + 14, { width: g.w - 4, align: 'center', height: 11 })
      continue
    }

    if (node.stepNumber) {
      doc.circle(g.x + 8, g.y + 7, 5.3).fill(accent)
      doc.font('Helvetica-Bold').fontSize(5.6).fillColor('#ffffff')
        .text(String(node.stepNumber), g.x + 5, g.y + 3.8, { width: 6, align: 'center', lineBreak: false })
    }
    const labelFont = node.label.length > 28 ? 5.4 : 5.9
    doc.font('Helvetica-Bold').fontSize(labelFont).fillColor(node.active ? accent : '#475569')
      .text(node.label, g.x + 10, g.y + (isRoot ? 9 : 12), { width: g.w - 20, align: 'center', height: isRoot ? 13 : 20 })
  }
}

function renderPath(
  doc: Doc,
  path: SeraCanonicalPath,
  output: SeraVNextEngineOutput,
  pt: boolean,
): void {
  const axis = axisOutput(output, path.axis)
  const locale = pt ? 'pt-BR' : 'en'
  const L = (ptText: string, enText: string) => pt ? ptText : enText
  const x = doc.page.margins.left
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right

  keepTogether(doc, 78)
  const y = doc.y
  doc.roundedRect(x, y, width, 42, 5).fillAndStroke('#f2f7fb', '#cad8e5')
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1b4c72')
    .text(axisLabel(path.axis, pt) + ' - ' + L('código candidato: ', 'candidate code: ') + value(axis.proposedCode, L('não resolvido', 'unresolved')), x + 9, y + 8)
  doc.font('Helvetica').fontSize(8.1).fillColor('#536676')
    .text(
      'Status: ' + candidateStatusLabel(axis.status, pt) +
      ' | ' + L('Confiança: ', 'Confidence: ') + (axis.proposedCode ? confidenceLabel(axis.confidence, pt) : L('NÃO APLICÁVEL', 'NOT APPLICABLE')) +
      ' | ' + L('Ator: ', 'Actor: ') + value(localizeActor(axis.actor, locale)),
      x + 9,
      y + 24,
    )
  doc.y = y + 51

  if (axis.statementAtEscapePoint) {
    subheading(doc, L('Enunciado no ponto de fuga', 'Statement at the escape point'))
    body(doc, axis.statementAtEscapePoint)
    doc.moveDown(0.25)
  }

  const conditionalAlternatives = axis.alternativesConsidered.filter((item) => /^[POA]-[A-Z]$/.test(item))
  if (!axis.proposedCode && conditionalAlternatives.length) {
    subheading(doc, L('Hipóteses ainda compatíveis — dependem das respostas', 'Still-compatible hypotheses — dependent on clarification'))
    bullets(doc, conditionalAlternatives)
    body(doc, L('Não são códigos concluídos nem liberados.', 'These are not concluded or released codes.'))
    doc.moveDown(0.25)
  }

  subheading(doc, L('Caminho percorrido', 'Path traversed'))
  if (!path.answers.length) {
    body(doc, L('Nenhuma etapa percorrida.', 'No step traversed.'))
    return
  }

  body(doc, L('A árvore completa deste eixo está apresentada imediatamente antes deste detalhamento. Abaixo ficam apenas os nós efetivamente percorridos, com sua rastreabilidade.', 'The complete tree for this axis is shown immediately before this detail. Below are only the nodes actually traversed, with their traceability.'))
  doc.moveDown(0.35)

  path.answers.forEach((node, index) => {
    keepTogether(doc, 128)
    const nodeY = doc.y
    doc.roundedRect(x, nodeY, width, 18, 4).fill('#e7f0f7')
    doc.font('Helvetica-Bold').fontSize(8.7).fillColor('#1d4f73')
      .text(L('Etapa ', 'Step ') + String(index + 1) + ' - ' + friendlyNodeLabel(node.nodeId, pt), x + 8, nodeY + 5)
    doc.y = nodeY + 24

    body(doc, L('Pergunta canônica: ', 'Canonical question: ') + (pt ? (SERA_PT_V1_TREE.nodes.find((item) => item.nodeId === node.nodeId)?.question ?? node.question) : (node.exactQuestionTextENAnchor ?? node.question)))
    doc.moveDown(0.12)
    body(doc, L('Resposta: ', 'Answer: ') + pathAnswerText(node, path, output, pt))

    if (node.rationale) {
      doc.moveDown(0.12)
      body(doc, L('Por que este ramo foi seguido: ', 'Why this branch was followed: ') + didacticReason(node.nodeId, node.answer, localizeRationale(node.rationale, locale), pt))
    }

    const destination = node.terminalCode
      ? L('Código terminal ', 'Terminal code ') + node.terminalCode
      : node.nextNodeId
        ? L('Próxima etapa: ', 'Next step: ') + friendlyNodeLabel(node.nextNodeId, pt)
        : L('Travessia interrompida', 'Traversal stopped')

    doc.moveDown(0.12)
    body(doc, L('Resultado do nó: ', 'Node result: ') + destination)

    const support = entries(node.supportingEvidence)
    if (support.length) {
      doc.moveDown(0.25)
      subheading(doc, L('Evidência usada neste nó', 'Evidence used at this node'))
      bullets(doc, support.slice(0, 2))
    }

    const counter = entries(node.counterEvidence)
    if (counter.length) {
      doc.moveDown(0.2)
      subheading(doc, L('Contraevidência / ressalvas', 'Counter-evidence / caveats'))
      bullets(doc, counter.slice(0, 2))
    }

    meta(doc, L('Confiança do nó', 'Node confidence'), confidenceLabel(node.confidence, pt))
    doc.moveDown(0.55)
  })

  subheading(doc, L('Evidência posterior ao ponto de fuga excluída', 'Excluded post-escape evidence'))
  bullets(doc, axis.excludedPostEscapeEvidence.slice(0, 5))
  doc.moveDown(0.35)
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
    const postEscapeStatements = new Set(
      output.factualExtraction.evidence
        .filter((item) => item.temporalRelation === 'POST_ESCAPE' || item.relationshipToFailure === 'POST_ESCAPE_CONSEQUENCE')
        .map((item) => item.statement.trim()),
    )
    const safeOperationEvidence = output.safeOperationModel.evidence.filter((item) => !postEscapeStatements.has(item.trim()))

    const doc = new PDFDocument({
      margin: 46,
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

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#173f67')
      .text(L('Relatório Metodológico HFA / SERA', 'HFA / SERA Methodological Report'), { align: 'center' })
    doc.moveDown(0.2)
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#5d6e7c')
      .text(L('Análise SERA 0.3 — revisão humana requerida', 'SERA 0.3 analysis — human review required'), { align: 'center' })
    doc.moveDown(0.55)
    doc.font('Helvetica').fontSize(9).fillColor('#263746').text(analysis.title, { align: 'center' })
    doc.moveDown(0.65)

    const bannerY = doc.y
    doc.roundedRect(46, bannerY, doc.page.width - 92, 54, 5).fillAndStroke('#fff8e7', '#d5b96f')
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#775015')
      .text(L('ATENÇÃO - RESULTADO NÃO FINAL', 'NOTICE - NON-FINAL RESULT'), 56, bannerY + 10)
    doc.font('Helvetica').fontSize(8.2).fillColor('#6e571f')
      .text(
        L(
          'Este documento apresenta uma análise candidata. O ponto de fuga, o ator, os códigos P/O/A e as pré-condições devem ser confirmados por revisão humana antes do uso formal.',
          'This document presents a candidate analysis. The escape point, actor, P/O/A codes, and preconditions must be confirmed by human review before formal use.',
        ),
        56,
        bannerY + 25,
        { width: doc.page.width - 112, lineGap: 1.4 },
      )
    doc.y = bannerY + 65

    heading(doc, '1. ' + L('Resumo executivo', 'Executive summary'))
    body(doc, buildExecutiveSummary({ title: analysis.title, output, pt }), 'justify')
    doc.moveDown(0.4)
    meta(doc, L('Ator direto candidato', 'Candidate direct actor'), value(localizeActor(output.directActor.actor, locale), L('Não resolvido', 'Unresolved')))
    meta(doc, L('Classificação candidata', 'Candidate classification'), [output.axes.perception.proposedCode, output.axes.objective.proposedCode, output.axes.action.proposedCode].map((item) => value(item, '—')).join(' / '))
    meta(doc, L('Status da revisão', 'Review status'), analysis.review_status)

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
    if (candidateAttention) {
      keepTogether(doc, 64)
      const riskY = doc.y + 6
      doc.roundedRect(doc.page.margins.left, riskY, doc.page.width - doc.page.margins.left - doc.page.margins.right, 48, 5)
        .fillAndStroke('#eef6ff', '#bfd4ea')
      doc.font('Helvetica-Bold').fontSize(9).fillColor('#174d78')
        .text(L('Índice HFA de atenção operacional', 'HFA operational-attention index'), doc.page.margins.left + 10, riskY + 8)
      doc.font('Helvetica-Bold').fontSize(17).fillColor('#174d78')
        .text(String(candidateAttention.score) + '/100', doc.page.margins.left + 10, riskY + 21, { continued: true })
      doc.font('Helvetica').fontSize(8.5).fillColor('#536676')
        .text('  -  ' + (pt ? candidateAttention.labelPt : candidateAttention.labelEn))
      doc.y = riskY + 58
      body(doc, L(
        'Indicador provisório de priorização com base nos candidatos P/O/A. Não é ERC/ARMS canônico, não estima probabilidade de acidente e não substitui a avaliação operacional de risco.',
        'Provisional prioritization indicator based on P/O/A candidates. It is not canonical ERC/ARMS, does not estimate accident probability, and does not replace operational risk assessment.',
      ))
    }

    heading(doc, '2. ' + L('Fatos-chave utilizados na análise', 'Key facts used in the analysis'))
    subheading(doc, L('Episódio operacional reconstruído ao redor do ponto de fuga', 'Operational episode reconstructed around the escape point'))
    bullets(doc, output.escapePoint.supportingEvidence.slice(0, 5), L('Nenhuma evidência central registrada.', 'No core evidence recorded.'))
    if (output.escapePoint.excludedPostEscapeEvidence.length) {
      subheading(doc, L('Fatos posteriores preservados, mas não usados como causa', 'Later facts retained but not used as causes'))
      bullets(doc, output.escapePoint.excludedPostEscapeEvidence.slice(0, 4))
    }

    heading(doc, '3. ' + L('Modelo da operação segura', 'Safe-operation model'))
    meta(doc, L('Estado seguro esperado', 'Expected safe state'), value(output.safeOperationModel.expectedSafeState))
    meta(doc, L('Ação segura esperada', 'Expected safe action'), value(output.safeOperationModel.expectedSafeAction))
    meta(doc, L('Confiança', 'Confidence'), confidenceLabel(output.safeOperationModel.confidence, pt))
    subheading(doc, L('Evidência considerada', 'Evidence considered'))
    bullets(doc, safeOperationEvidence, L('Nenhum item pré-ponto de fuga registrado.', 'No pre-escape item recorded.'))

    heading(doc, '4. ' + L('Ponto de fuga da operação segura', 'Safe-operation escape point'))
    body(doc, value(output.escapePoint.statement), 'justify')
    doc.moveDown(0.3)
    meta(doc, 'Status', candidateStatusLabel(output.escapePoint.status, pt))
    meta(doc, L('Confiança', 'Confidence'), confidenceLabel(output.escapePoint.confidence, pt))
    meta(doc, L('Ator direto', 'Direct actor'), value(localizeActor(output.directActor.actor, locale), L('Não resolvido', 'Unresolved')))
    meta(doc, L('Status do ator', 'Actor status'), output.directActor.status)
    if (output.directActor.alternatives.length) {
      subheading(doc, L('Atores alternativos / contributivos', 'Alternative / contributory actors'))
      bullets(doc, output.directActor.alternatives.map((actor) => localizeActor(actor, locale) ?? actor))
    }
    if (output.directActor.actorMigrationWarnings.length) {
      subheading(doc, L('Avisos de fronteira de ator', 'Actor-boundary warnings'))
      bullets(doc, output.directActor.actorMigrationWarnings)
    }
    subheading(doc, L('Evidência de suporte ao ponto de fuga', 'Escape-point supporting evidence'))
    bullets(doc, output.escapePoint.supportingEvidence.slice(0, 6), L('Nenhuma evidência registrada.', 'No evidence recorded.'))
    if (output.escapePoint.humanFactorGate) {
      meta(doc, L('Gate de âncora de Fatores Humanos', 'Human-Factor anchor gate'), output.escapePoint.humanFactorGate.status)
      meta(doc, L('Tipo de âncora SERA', 'SERA anchor type'), value(output.escapePoint.humanFactorGate.anchorType, L('não estabelecida', 'not established')))
      bullets(doc, output.escapePoint.humanFactorGate.rationale)
    }
    const alternativeEpisodes = (output.escapePoint.episodeCandidates ?? []).filter((episode) => !episode.selected)
    if (alternativeEpisodes.length) {
      subheading(doc, L('Outras sequências humanas/contextuais detectadas — não são pontos de fuga automáticos', 'Other human/contextual sequences detected — not automatic escape points'))
      bullets(doc, alternativeEpisodes.slice(0, 5).map((episode) => `${episode.phase} / ${episode.seraRole ?? 'UNRESOLVED'}: ${episode.anchorStatement}`))
      body(doc, L(
        'A visão global serve para localizar o ato/condição humana relevante e suas pré-condições. O SERA analisa um ato inseguro por vez: outra sequência só pode receber P/O/A após estabelecer sua própria âncora humana, ator direto e travessia canônica completa. Falhas técnicas, meteorologia e condições organizacionais permanecem contexto/pré-condições quando não constituem essa âncora.',
        'The global view is used to locate the relevant human act/condition and its preconditions. SERA analyses one unsafe act at a time: another sequence can receive P/O/A only after establishing its own human-factor anchor, direct actor, and complete canonical traversal. Technical failures, weather, and organizational conditions remain context/preconditions when they do not constitute that anchor.',
      ))
    }
    subheading(doc, L('Contraevidência / incertezas do limite', 'Counter-evidence / boundary uncertainty'))
    bullets(doc, output.escapePoint.counterEvidence.slice(0, 6), L('Nenhuma contraevidência registrada.', 'No counter-evidence recorded.'))
    subheading(doc, L('Evidência posterior excluída da cadeia causal', 'Post-escape evidence excluded from the causal chain'))
    bullets(doc, output.escapePoint.excludedPostEscapeEvidence.slice(0, 6), L('Nenhum item registrado.', 'No item recorded.'))

    heading(doc, '5. ' + L('Resultado P / O / A - visão sintética', 'P / O / A result - summary view'))
    const axes = [
      ['P', output.axes.perception],
      ['O', output.axes.objective],
      ['A', output.axes.action],
    ] as const

    for (const [axisId, axis] of axes) {
      keepTogether(doc, 95)
      doc.font('Helvetica-Bold').fontSize(9.7).fillColor('#1d4f73')
        .text(axisLabel(axisId, pt) + ': ' + value(axis.proposedCode, L('não resolvido', 'unresolved')) + ' - ' + candidateStatusLabel(axis.status, pt))
      body(doc, value(axis.statementAtEscapePoint, L('Eixo não resolvido pela evidência disponível.', 'Axis unresolved by the available evidence.')))
      meta(doc, L('Confiança da classificação', 'Classification confidence'), axis.proposedCode ? confidenceLabel(axis.confidence, pt) : L('NÃO APLICÁVEL', 'NOT APPLICABLE'))
      const conditional = axis.alternativesConsidered.filter((item) => /^[POA]-[A-Z]$/.test(item))
      if (!axis.proposedCode && conditional.length) {
        subheading(doc, L('Hipóteses ainda compatíveis — dependem das respostas', 'Still-compatible hypotheses — dependent on clarification'))
        bullets(doc, conditional)
        body(doc, L('Não são códigos concluídos nem liberados.', 'These are not concluded or released codes.'))
      }
      if (pt && axis.proposedCode) {
        const card = axisId === 'P'
          ? reviewerOutput.axisReviews.perception
          : axisId === 'O'
            ? reviewerOutput.axisReviews.objective
            : reviewerOutput.axisReviews.action
        if (card.candidateMeaning) meta(doc, 'Significado metodológico', card.candidateMeaning)
      }
      doc.moveDown(0.35)
    }

    heading(doc, '6. ' + L('Como o sistema chegou à classificação', 'How the system reached the classification'))
    if (output.canonicalTraversal.paths.length === 0) {
      body(doc, L(
        'A travessia canônica P/O/A não foi iniciada porque o ator direto ainda não está resolvido no ponto de fuga. Nenhuma árvore ou caminho deve ser interpretado como percorrido até que essa fronteira de ator seja esclarecida.',
        'Canonical P/O/A traversal was not started because the direct actor remains unresolved at the escape point. No tree or path should be interpreted as traversed until that actor boundary is clarified.',
      ), 'justify')
    } else {
      body(doc, L(
        'Primeiro são apresentadas as árvores completas de Percepção, Objetivo e Ação, preservando inclusive os ramos não seguidos. O caminho usado nesta análise é destacado por cor até o código terminal. Em seguida, cada nó efetivamente percorrido é explicado com pergunta, resposta, justificativa e evidências.',
        'The complete Perception, Objective, and Action trees are presented first, including paths not taken. The route used in this analysis is highlighted through the terminal code. Each traversed node is then explained with its question, answer, rationale, and evidence.',
      ), 'justify')
      doc.moveDown(0.45)
      for (const path of output.canonicalTraversal.paths) renderCanonicalTreePage(doc, path, output, pt)
    }
    if (output.canonicalTraversal.paths.length) {
      doc.addPage({ size: 'A4', layout: 'portrait', margin: 46 })
      heading(doc, '6.1 ' + L('Detalhamento do caminho percorrido', 'Traversed-path detail'))
      for (const path of output.canonicalTraversal.paths) renderPath(doc, path, output, pt)
    }

    heading(doc, '7. ' + L('Pré-condições e hipóteses contextuais', 'Preconditions and contextual hypotheses'))
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
      keepTogether(doc, 110)
      const reviewCard = reviewerOutput.preconditionReview.cards.find((card) => card.category === pc.category)
      const canonicalMeta = pc.canonicalCategory ? SERA_PRECONDITION_META[pc.canonicalCategory] : null
      const canonicalName = canonicalMeta ? (pt ? canonicalMeta.pt : canonicalMeta.en) : categoryLabel(pc.category)
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(hypothesis ? '#8a5a00' : '#1d4f73')
        .text(canonicalName + ' - ' + confidenceLabel(pc.confidence, pt))
      body(doc, pc.description)
      if (canonicalMeta) meta(doc, L('Nível SERA', 'SERA level'), canonicalMeta.level)
      if (pc.methodologyMatch) meta(doc, L('Relação com a tabela de pré-condições prováveis', 'Relationship to the most-likely preconditions table'), pc.methodologyMatch)
      if (pc.likelyForActiveFailureCodes?.length) meta(doc, L('Pré-condição provável para', 'Most likely for'), pc.likelyForActiveFailureCodes.join(', '))
      meta(doc, L('Relação com a falha', 'Relationship to the failure'), relationshipLabel(pc.relationship))
      meta(doc, L('Ator associado', 'Associated actor'), value(localizeActor(pc.linkedActor, locale)))
      meta(doc, L('Regra(s) de origem', 'Source rule(s)'), pc.sourceRuleIds.join(', '))
      meta(doc, L('É ponto de fuga?', 'Is it the escape point?'), L('NÃO - mantida separadamente da falha ativa', 'NO - kept separate from the active failure'))
      if (pt && reviewCard?.reviewerQuestion) meta(doc, 'Pergunta ao revisor', reviewCard.reviewerQuestion)
      subheading(doc, hypothesis ? L('Evidência contextual', 'Contextual evidence') : L('Evidência', 'Evidence'))
      bullets(doc, pc.evidence.slice(0, 6))
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

    heading(doc, '8. ' + L('Correspondência SERA / HFACS', 'SERA / HFACS correspondence'))
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
    bullets(doc, hfacsBridge.activeFailures.map((item) => `${item.level}: ${item.hfacs}`), L('Nenhuma correspondência disponível enquanto P/O/A permanecer não resolvido.', 'No correspondence is available while P/O/A remains unresolved.'))
    subheading(doc, L('Pré-condições SERA — melhor correspondência HFACS/AGA135', 'SERA preconditions — best-fit HFACS/AGA135 correspondence'))
    bullets(doc, hfacsBridge.preconditions.map((item) => `${item.level}: ${item.hfacs}`), L('Nenhuma pré-condição confirmada para mapeamento.', 'No confirmed precondition available for mapping.'))

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

    heading(doc, '9. ' + L('Barreiras e observações operacionais', 'Operational barriers and observations'))
    body(doc, L(
      'Itens explicitamente registrados pela investigação e preservados para revisão humana, sem convertê-los automaticamente em pré-condições causais.',
      'Items explicitly recorded by the investigation and retained for human review without automatically converting them into causal preconditions.',
    ), 'justify')
    bullets(doc, operationalObservations, L('Nenhuma barreira ou observação operacional adicional foi identificada nesta análise.', 'No additional operational barrier or observation was identified in this analysis.'))

    heading(doc, '10. ' + L('Conclusão e próximos passos', 'Conclusion and next steps'))
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

    doc.addPage()
    heading(doc, L('Apêndice técnico - rastreabilidade e auditoria', 'Technical appendix - traceability and audit'))
    body(doc, L(
      'As seções seguintes preservam os dados necessários para auditoria metodológica e reprodutibilidade. Elas não fazem parte da leitura executiva principal.',
      'The following sections preserve data required for methodological audit and reproducibility. They are not part of the main executive reading.',
    ), 'justify')

    heading(doc, 'A.1 ' + L('Proveniência e controle metodológico', 'Provenance and methodological control'))
    meta(doc, L('ID da análise', 'Analysis ID'), analysis.id)
    meta(doc, L('Motor SERA (runtime)', 'SERA engine (runtime)'), value(analysis.engine_runtime_version, input.versions.engineRuntimeVersion))
    meta(doc, L('Contrato de persistência do motor', 'Engine persistence contract'), analysis.engine_version)
    meta(doc, L('Metodologia', 'Methodology'), analysis.methodology_version)
    meta(doc, 'Baseline', analysis.baseline_id)
    meta(doc, 'Fixture set', analysis.fixture_set_id)
    meta(doc, L('Árvore canônica', 'Canonical tree'), value(analysis.canonical_tree_version))
    meta(doc, 'Commit', analysis.code_commit)
    meta(doc, L('Hash do relato', 'Narrative hash'), analysis.narrative_hash)
    meta(doc, L('Hash da saída', 'Output hash'), analysis.engine_output_hash)
    meta(doc, 'Status', analysis.status + ' / ' + analysis.review_status)
    meta(doc, L('Revisão corrente', 'Current revision'), String(analysis.current_revision))
    meta(doc, L('Contrato do produto', 'Product contract'), input.versions.engineVersion)
    meta(doc, L('Runtime executável', 'Executable runtime'), input.versions.engineRuntimeVersion)
    meta(doc, L('Schema de entrada', 'Input schema'), input.versions.inputSchemaVersion)
    meta(doc, L('Schema de saída', 'Output schema'), input.versions.outputSchemaVersion)

    heading(doc, 'A.2 ' + L('Rastreabilidade e polaridade da evidência', 'Evidence traceability and polarity'))
    const evidenceItems = output.factualExtraction.evidence
    const rejected = evidenceItems.filter((item) => item.assertionStatus === 'REJECTED_AS_FACTOR')
    const uncertain = evidenceItems.filter((item) => item.assertionStatus === 'UNCERTAIN')
    const postEscape = evidenceItems.filter((item) => item.temporalRelation === 'POST_ESCAPE')
    const analysisOnly = evidenceItems.filter((item) => item.sourceSection === 'REPORT_ANALYSIS' || item.sourceSection === 'RECOMMENDATION')
    const referenceOnly = evidenceItems.filter((item) => ['NON_CAUSAL_DOCUMENT', 'REFERENCE_PROCEDURE', 'SYSTEM_DESCRIPTION'].includes(item.evidenceType))
    const historicalComparators = evidenceItems.filter((item) => item.occurrenceScope === 'HISTORICAL_COMPARATOR')
    const currentEventItems = evidenceItems.filter((item) => item.occurrenceScope === 'CURRENT_EVENT')
    meta(doc, L('Itens de evidência indexados', 'Indexed evidence items'), String(evidenceItems.length))
    meta(doc, L('Fatores explicitamente rejeitados no relatório-fonte', 'Factors explicitly rejected by the source report'), String(rejected.length))
    meta(doc, L('Afirmações incertas/hipotéticas', 'Uncertain/hypothetical statements'), String(uncertain.length))
    meta(doc, L('Itens pós-ponto de fuga', 'Post-escape items'), String(postEscape.length))
    meta(doc, L('Itens de análise/recomendação não usados como fato causal', 'Analysis/recommendation items not used as causal facts'), String(analysisOnly.length))
    meta(doc, L('Material documental/de referência excluído da causalidade', 'Document/reference material excluded from causality'), String(referenceOnly.length))
    meta(doc, L('Itens do evento atual', 'Current-event items'), String(currentEventItems.length))
    meta(doc, L('Itens históricos/comparadores proibidos como causa direta', 'Historical/comparator items prohibited as direct causes'), String(historicalComparators.length))
    subheading(doc, L('Fatores que o relatório-fonte declarou como não contribuintes', 'Factors the source report declared non-contributory'))
    bullets(doc, rejected.slice(0, 8).map((item) => item.statement))
    subheading(doc, L('Hipóteses ou formulações incertas preservadas como incerteza', 'Hypotheses or uncertain formulations retained as uncertainty'))
    bullets(doc, uncertain.slice(0, 8).map((item) => item.statement))
    subheading(doc, L('Fatos posteriores ao ponto de fuga, mantidos em quarentena causal', 'Post-escape facts kept in causal quarantine'))
    bullets(doc, postEscape.slice(0, 8).map((item) => item.statement))

    heading(doc, 'A.3 ' + L('Salvaguardas metodológicas', 'Methodological safeguards'))
    for (const [name, violated] of Object.entries(output.guardrails)) {
      const evidence = output.guardrailEvidence[name] ?? []
      doc.font('Helvetica-Bold').fontSize(8.8)
        .fillColor(violated ? '#9b2c2c' : '#2f6f4e')
        .text((violated ? L('VIOLAÇÃO', 'VIOLATION') : 'OK') + ' - ' + guardrailLabel(name, violated, pt))
      if (evidence.length) bullets(doc, evidence)
      doc.moveDown(0.22)
    }

    heading(doc, 'A.4 ' + L('Suficiência da evidência', 'Evidence sufficiency'))
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

    heading(doc, 'A.5 ' + L('Incertezas, limitações e perguntas em aberto', 'Uncertainties, limitations, and open questions'))
    subheading(doc, L('Incertezas', 'Uncertainties'))
    bullets(doc, output.uncertainties.map((item) => translateReportText(item, pt)))
    subheading(doc, L('Limitações', 'Limitations'))
    bullets(doc, output.limitations.map((item) => translateReportText(item, pt)))
    subheading(doc, L('Perguntas canônicas ainda não respondidas', 'Canonical questions not yet answered'))
    bullets(doc, output.canonicalTraversal.unansweredQuestions.map((item) => translateReportText(item, pt)))

    heading(doc, 'A.6 ' + L('Pacote de revisão humana', 'Human review package'))
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

    heading(doc, 'A.7 ' + L('Nota de uso e revisão', 'Use and review note'))
    body(
      doc,
      L(
        'Este relatório documenta a análise metodológica produzida pelo motor SERA 0.3 e sua trilha de decisão. A liberação formal continua condicionada à revisão humana. O revisor deve confirmar o ponto de fuga, o ator direto, cada eixo P/O/A, as pré-condições e qualquer evidência conflitante antes do uso formal.',
        'This report documents the methodological analysis produced by SERA engine 0.3 and its decision trace. Formal release remains subject to human review. The reviewer must confirm the escape point, direct actor, each P/O/A axis, preconditions, and any conflicting evidence before formal use.',
      ),
      'justify',
    )

    doc.end()
  })
}

export const generateSeraVNextPdfBuffer = generateSeraVNextDetailedPdfBuffer
