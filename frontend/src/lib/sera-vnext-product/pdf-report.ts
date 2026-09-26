// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit/js/pdfkit.standalone.js') as typeof import('pdfkit')

import type { SeraCanonicalPath, SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { localizeActor, localizeAssuranceText, localizeRationale } from '@/lib/sera-vnext/engine-v0/localization'
import { SERA_PT_V1_TREE } from '@/lib/sera-vnext/canonical-tree/sera-pt-v1'
import { buildExecutiveSummary, computeCandidateAttention, friendlyAnswerLabel, friendlyNodeLabel } from '@/lib/sera-vnext/presentation'
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
    'P_ROOT:START': 'Início da árvore de Percepção: primeiro se estabelece o estado que o operador acreditava existir no ponto de fuga.',
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
    'O_ROOT:START': 'Início da árvore de Objetivo: identifica-se o que o operador pretendia alcançar no ponto de fuga.',
    'O_RULES:SIM': 'O objetivo pretendido era compatível com regras/procedimentos e com a finalidade operacional declarada; a árvore testa se havia um objetivo de risco independente.',
    'O_RULES:NÃO': 'Há evidência de objetivo incompatível com regras/procedimentos; a árvore passa a distinguir violação rotineira de excepcional.',
    'O_MANAGED_RISK:NÃO': 'Não foi demonstrado um objetivo inseguro independente; mantém-se O-A, sem falha de objetivo.',
    'O_MANAGED_RISK:SIM': 'Há evidência de objetivo que, embora compatível com regras gerais, não gerenciava adequadamente o risco operacional.',
    'A_ROOT:START': 'Início da árvore de Ação: identifica-se como o operador tentou executar o objetivo no ponto de fuga.',
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

function guardrailLabel(name: string, pt: boolean): string {
  const ptMap: Record<string, string> = {
    consequenceUsedAsCause: 'Consequência utilizada indevidamente como causa', postEscapeHuntingDetected: 'Busca causal após o ponto de fuga',
    postEscapeEvidenceUsed: 'Evidência pós-ponto de fuga usada na causalidade', oeUsed: 'Código O-E inexistente utilizado',
    inventedQuestionDetected: 'Pergunta canônica inventada ou reconstruída', actorMigrationDetected: 'Migração indevida do ator causal',
    preconditionUsedAsEscapePoint: 'Pré-condição utilizada como ponto de fuga', codeFirstPathDetected: 'Código definido antes da travessia metodológica',
    awarenessMissingForViolation: 'Violação atribuída sem evidência de consciência da regra',
  }
  const enMap: Record<string, string> = {
    consequenceUsedAsCause: 'Consequence improperly used as cause', postEscapeHuntingDetected: 'Post-escape causal hunting',
    postEscapeEvidenceUsed: 'Post-escape evidence used causally', oeUsed: 'Nonexistent O-E code used',
    inventedQuestionDetected: 'Canonical question invented or reconstructed', actorMigrationDetected: 'Improper causal actor migration',
    preconditionUsedAsEscapePoint: 'Precondition used as escape point', codeFirstPathDetected: 'Code selected before methodological traversal',
    awarenessMissingForViolation: 'Violation attributed without rule-awareness evidence',
  }
  return (pt ? ptMap : enMap)[name] ?? name
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

function renderPathMap(doc: Doc, path: SeraCanonicalPath, pt: boolean): void {
  if (!path.answers.length) return
  const x = doc.page.margins.left
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right
  const cols = 3
  const gap = 8
  const boxHeight = 43
  const rowGap = 14
  const boxWidth = (width - gap * (cols - 1)) / cols
  const rows = Math.ceil(path.answers.length / cols)
  const totalHeight = rows * boxHeight + (rows - 1) * rowGap
  keepTogether(doc, totalHeight + 16)
  const y0 = doc.y

  path.answers.forEach((node, index) => {
    const row = Math.floor(index / cols)
    const col = index % cols
    const bx = x + col * (boxWidth + gap)
    const by = y0 + row * (boxHeight + rowGap)
    doc.roundedRect(bx, by, boxWidth, boxHeight, 5).fillAndStroke('#eef6fb', '#b9d2e4')
    doc.font('Helvetica-Bold').fontSize(7.1).fillColor('#1d4f73')
      .text(String(index + 1) + '. ' + friendlyNodeLabel(node.nodeId, pt), bx + 6, by + 7, { width: boxWidth - 12, lineBreak: false, ellipsis: true })
    doc.font('Helvetica').fontSize(7).fillColor('#536676')
      .text((pt ? 'Resposta: ' : 'Answer: ') + friendlyAnswerLabel(node.answer, pt), bx + 6, by + 23, { width: boxWidth - 12, lineBreak: false, ellipsis: true })
    if (node.terminalCode) {
      doc.font('Helvetica-Bold').fontSize(7).fillColor('#1d4f73')
        .text('> ' + node.terminalCode, bx + 6, by + 33, { width: boxWidth - 12, lineBreak: false })
    }

    const sameRowNext = index < path.answers.length - 1 && (index + 1) % cols !== 0
    if (sameRowNext) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#6f8fa6')
        .text('>', bx + boxWidth + 1, by + 15, { width: gap - 2, align: 'center' })
    }
  })
  doc.y = y0 + totalHeight + 7
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

  renderPathMap(doc, path, pt)
  doc.moveDown(0.2)

  path.answers.forEach((node, index) => {
    keepTogether(doc, 128)
    const nodeY = doc.y
    doc.roundedRect(x, nodeY, width, 18, 4).fill('#e7f0f7')
    doc.font('Helvetica-Bold').fontSize(8.7).fillColor('#1d4f73')
      .text(L('Etapa ', 'Step ') + String(index + 1) + ' - ' + friendlyNodeLabel(node.nodeId, pt), x + 8, nodeY + 5)
    doc.y = nodeY + 24

    body(doc, L('Pergunta canônica: ', 'Canonical question: ') + (pt ? (SERA_PT_V1_TREE.nodes.find((item) => item.nodeId === node.nodeId)?.question ?? node.question) : (node.exactQuestionTextENAnchor ?? node.question)))
    doc.moveDown(0.12)
    body(doc, L('Resposta: ', 'Answer: ') + friendlyAnswerLabel(node.answer, pt))

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
  bullets(doc, axis.excludedPostEscapeEvidence)
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

    const candidateAttention = computeCandidateAttention(
      output.axes.perception.proposedCode,
      output.axes.objective.proposedCode,
      output.axes.action.proposedCode,
    )
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
    subheading(doc, L('Evidências centrais do ponto de fuga', 'Core escape-point evidence'))
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
    bullets(doc, output.escapePoint.supportingEvidence, L('Nenhuma evidência registrada.', 'No evidence recorded.'))
    subheading(doc, L('Contraevidência / incertezas do limite', 'Counter-evidence / boundary uncertainty'))
    bullets(doc, output.escapePoint.counterEvidence, L('Nenhuma contraevidência registrada.', 'No counter-evidence recorded.'))
    subheading(doc, L('Evidência posterior excluída da cadeia causal', 'Post-escape evidence excluded from the causal chain'))
    bullets(doc, output.escapePoint.excludedPostEscapeEvidence, L('Nenhum item registrado.', 'No item recorded.'))

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
    body(
      doc,
      L(
        'Esta seção mostra, em linguagem operacional, o caminho efetivamente percorrido. Cada etapa apresenta a pergunta, a resposta, a justificativa e as evidências que sustentaram o ramo seguinte.',
        'This section shows, in operational language, the path actually traversed. Each step presents the question, answer, rationale, and evidence supporting the next branch.',
      ),
      'justify',
    )
    doc.moveDown(0.45)
    for (const path of output.canonicalTraversal.paths) renderPath(doc, path, output, pt)

    heading(doc, '7. ' + L('Pré-condições e hipóteses contextuais', 'Preconditions and contextual hypotheses'))
    const supportedPreconditions = output.preconditions.filter((pc) =>
      pc.relationship === 'CONTEXTUAL_PRECONDITION' || pc.relationship === 'ENABLING_PRECONDITION',
    )
    const hypothesisPreconditions = output.preconditions.filter((pc) =>
      pc.relationship !== 'CONTEXTUAL_PRECONDITION' && pc.relationship !== 'ENABLING_PRECONDITION',
    )
    const renderPrecondition = (pc: typeof output.preconditions[number], hypothesis: boolean) => {
      keepTogether(doc, 110)
      const reviewCard = reviewerOutput.preconditionReview.cards.find((card) => card.category === pc.category)
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(hypothesis ? '#8a5a00' : '#1d4f73')
        .text(categoryLabel(pc.category) + ' - ' + confidenceLabel(pc.confidence, pt))
      body(doc, pc.description)
      meta(doc, L('Relação com a falha', 'Relationship to the failure'), relationshipLabel(pc.relationship))
      meta(doc, L('Ator associado', 'Associated actor'), value(localizeActor(pc.linkedActor, locale)))
      meta(doc, L('Regra(s) de origem', 'Source rule(s)'), pc.sourceRuleIds.join(', '))
      meta(doc, L('É ponto de fuga?', 'Is it the escape point?'), L('NÃO - mantida separadamente da falha ativa', 'NO - kept separate from the active failure'))
      if (pt && reviewCard?.reviewerQuestion) meta(doc, 'Pergunta ao revisor', reviewCard.reviewerQuestion)
      subheading(doc, hypothesis ? L('Evidência contextual', 'Contextual evidence') : L('Evidência', 'Evidence'))
      bullets(doc, pc.evidence)
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

    const operationalObservations = output.factualExtraction.evidence
      .filter((item) =>
        item.sourceSection === 'REPORT_ANALYSIS' &&
        item.assertionStatus === 'AFFIRMED' &&
        /\b(reconfirma[cç][aã]o|c[oó]digo 9p|cross-check|checklist|barreira|monitoramento|monitoring|verification|coordena[cç][aã]o|coordination)\b/i.test(item.statement),
      )
      .map((item) => item.statement)
      .filter((item, index, all) => all.indexOf(item) === index)
      .slice(0, 6)

    if (operationalObservations.length) {
      heading(doc, '8. ' + L('Barreiras e observações operacionais', 'Operational barriers and observations'))
      body(doc, L(
        'Itens explicitamente registrados pela investigação e preservados para revisão humana, sem convertê-los automaticamente em pré-condições causais.',
        'Items explicitly recorded by the investigation and retained for human review without automatically converting them into causal preconditions.',
      ), 'justify')
      bullets(doc, operationalObservations)
    }

    heading(doc, '9. ' + L('Conclusão e próximos passos', 'Conclusion and next steps'))
    body(doc, L(
      'A análise identifica um ponto de fuga, ator direto e candidatos P/O/A com rastreabilidade explícita. Antes do uso formal, a revisão humana deve confirmar essas decisões, revisar as pré-condições e registrar as ações corretivas aplicáveis. O acompanhamento das ações e da recorrência dos padrões deve ser feito no Perfil de Risco.',
      'The analysis identifies an escape point, direct actor, and P/O/A candidates with explicit traceability. Before formal use, human review should confirm these decisions, review preconditions, and record applicable corrective actions. Corrective-action follow-up and pattern recurrence should be monitored in the Risk Profile.',
    ), 'justify')

    doc.addPage()
    heading(doc, L('Apêndice técnico - rastreabilidade e auditoria', 'Technical appendix - traceability and audit'))
    body(doc, L(
      'As seções seguintes preservam os dados necessários para auditoria metodológica e reprodutibilidade. Elas não fazem parte da leitura executiva principal.',
      'The following sections preserve data required for methodological audit and reproducibility. They are not part of the main executive reading.',
    ), 'justify')

    heading(doc, 'A.1 ' + L('Proveniência e controle metodológico', 'Provenance and methodological control'))
    meta(doc, L('ID da análise', 'Analysis ID'), analysis.id)
    meta(doc, L('Motor', 'Engine'), analysis.engine_version)
    meta(doc, 'Runtime', value(analysis.engine_runtime_version))
    meta(doc, L('Metodologia', 'Methodology'), analysis.methodology_version)
    meta(doc, 'Baseline', analysis.baseline_id)
    meta(doc, 'Fixture set', analysis.fixture_set_id)
    meta(doc, L('Árvore canônica', 'Canonical tree'), value(analysis.canonical_tree_version))
    meta(doc, 'Commit', analysis.code_commit)
    meta(doc, L('Hash do relato', 'Narrative hash'), analysis.narrative_hash)
    meta(doc, L('Hash da saída', 'Output hash'), analysis.engine_output_hash)
    meta(doc, 'Status', analysis.status + ' / ' + analysis.review_status)
    meta(doc, L('Revisão corrente', 'Current revision'), String(analysis.current_revision))
    meta(doc, L('Motor do produto', 'Product engine'), input.versions.engineVersion)
    meta(doc, L('Runtime do produto', 'Product runtime'), input.versions.engineRuntimeVersion)
    meta(doc, L('Schema de entrada', 'Input schema'), input.versions.inputSchemaVersion)
    meta(doc, L('Schema de saída', 'Output schema'), input.versions.outputSchemaVersion)

    heading(doc, 'A.2 ' + L('Rastreabilidade e polaridade da evidência', 'Evidence traceability and polarity'))
    const evidenceItems = output.factualExtraction.evidence
    const rejected = evidenceItems.filter((item) => item.assertionStatus === 'REJECTED_AS_FACTOR')
    const uncertain = evidenceItems.filter((item) => item.assertionStatus === 'UNCERTAIN')
    const postEscape = evidenceItems.filter((item) => item.temporalRelation === 'POST_ESCAPE')
    const analysisOnly = evidenceItems.filter((item) => item.sourceSection === 'REPORT_ANALYSIS' || item.sourceSection === 'RECOMMENDATION')
    meta(doc, L('Itens factuais indexados', 'Indexed factual items'), String(evidenceItems.length))
    meta(doc, L('Fatores explicitamente rejeitados no relatório-fonte', 'Factors explicitly rejected by the source report'), String(rejected.length))
    meta(doc, L('Afirmações incertas/hipotéticas', 'Uncertain/hypothetical statements'), String(uncertain.length))
    meta(doc, L('Itens pós-ponto de fuga', 'Post-escape items'), String(postEscape.length))
    meta(doc, L('Itens de análise/recomendação não usados como fato causal', 'Analysis/recommendation items not used as causal facts'), String(analysisOnly.length))
    subheading(doc, L('Fatores que o relatório-fonte declarou como não contribuintes', 'Factors the source report declared non-contributory'))
    bullets(doc, rejected.map((item) => item.statement))
    subheading(doc, L('Hipóteses ou formulações incertas preservadas como incerteza', 'Hypotheses or uncertain formulations retained as uncertainty'))
    bullets(doc, uncertain.map((item) => item.statement))
    subheading(doc, L('Fatos posteriores ao ponto de fuga, mantidos em quarentena causal', 'Post-escape facts kept in causal quarantine'))
    bullets(doc, postEscape.map((item) => item.statement))

    heading(doc, 'A.3 ' + L('Salvaguardas metodológicas', 'Methodological safeguards'))
    for (const [name, violated] of Object.entries(output.guardrails)) {
      const evidence = output.guardrailEvidence[name] ?? []
      doc.font('Helvetica-Bold').fontSize(8.8)
        .fillColor(violated ? '#9b2c2c' : '#2f6f4e')
        .text((violated ? L('VIOLAÇÃO', 'VIOLATION') : 'OK') + ' - ' + guardrailLabel(name, pt))
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
