// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit/js/pdfkit.standalone.js') as typeof import('pdfkit')

import type { SeraCanonicalPath, SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
import { localizeActor, localizeAssuranceText, localizeRationale } from '@/lib/sera-vnext/engine-v0/localization'
import { SERA_PT_V1_TREE } from '@/lib/sera-vnext/canonical-tree/sera-pt-v1'
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

function body(doc: Doc, text: string, align: 'left' | 'justify' = 'left'): void {
  doc.font('Helvetica').fontSize(9).fillColor('#263746').text(text || '-', {
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
    doc.font('Helvetica').fontSize(8.5).fillColor('#33475a').text('- ' + item, {
      indent: 10,
      lineGap: 1.2,
    })
    doc.moveDown(0.1)
  }
}

function answerLabel(answer: string, pt: boolean): string {
  const ptMap: Record<string, string> = {
    START: 'INÍCIO', SIM: 'SIM', 'NÃO': 'NÃO',
    'NÃO_SENSORIAL': 'NÃO - limitação sensorial', 'NÃO_CONHECIMENTO': 'NÃO - conhecimento',
    SIM_ATENCAO: 'SIM - atenção', SIM_GERENCIAMENTO: 'SIM - gerenciamento',
    'NÃO_DESLIZE_LAPSO_ERRO': 'NÃO - deslize/lapso/erro', 'NÃO_FEEDBACK': 'NÃO - feedback/verificação',
    'NÃO_INABILIDADE': 'NÃO - inabilidade', 'NÃO_SELECAO': 'NÃO - seleção',
    SIM_SELECAO: 'SIM - seleção', SIM_FEEDBACK: 'SIM - feedback', INSUFFICIENT_EVIDENCE: 'EVIDÊNCIA INSUFICIENTE',
  }
  const enMap: Record<string, string> = {
    START: 'START', SIM: 'YES', 'NÃO': 'NO',
    'NÃO_SENSORIAL': 'NO - sensory limitation', 'NÃO_CONHECIMENTO': 'NO - knowledge',
    SIM_ATENCAO: 'YES - attention', SIM_GERENCIAMENTO: 'YES - management',
    'NÃO_DESLIZE_LAPSO_ERRO': 'NO - slip/lapse/error', 'NÃO_FEEDBACK': 'NO - feedback/verification',
    'NÃO_INABILIDADE': 'NO - capability', 'NÃO_SELECAO': 'NO - selection',
    SIM_SELECAO: 'YES - selection', SIM_FEEDBACK: 'YES - feedback', INSUFFICIENT_EVIDENCE: 'INSUFFICIENT EVIDENCE',
  }
  return (pt ? ptMap : enMap)[answer] ?? answer
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

function translateInference(value: string, pt: boolean): string {
  if (!pt) return value
  const map: Record<string, string> = {
    'Do not infer perception failure from consequence alone.': 'Não inferir falha perceptiva apenas a partir da consequência.',
    'Do not infer perception failure from degraded environment alone.': 'Não inferir falha perceptiva apenas pela presença de ambiente degradado.',
    'Do not infer objective deviation without intent/rule-awareness evidence.': 'Não inferir desvio de objetivo sem evidência de intenção ou consciência da regra.',
    'Do not infer goal state from report conclusion text alone.': 'Não inferir o objetivo apenas a partir da conclusão escrita pelo relatório de origem.',
    'Do not collapse aircraft state into action failure.': 'Não transformar o estado da aeronave, por si só, em falha de ação.',
    'Do not infer inability without explicit physical or ergonomic evidence.': 'Não inferir inabilidade sem evidência física ou ergonômica explícita.',
  }
  return map[value] ?? value
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

  subheading(doc, L('Fluxo canônico percorrido', 'Canonical path traversed'))
  if (!path.answers.length) {
    body(doc, L('Nenhum nó percorrido.', 'No node traversed.'))
    return
  }

  path.answers.forEach((node, index) => {
    keepTogether(doc, 128)
    const nodeY = doc.y
    doc.roundedRect(x, nodeY, width, 18, 4).fill('#e7f0f7')
    doc.font('Helvetica-Bold').fontSize(8.7).fillColor('#1d4f73')
      .text(L('Nó ', 'Node ') + String(index + 1) + ' - ' + node.nodeId, x + 8, nodeY + 5)
    doc.y = nodeY + 24

    body(doc, L('Pergunta canônica: ', 'Canonical question: ') + (pt ? (SERA_PT_V1_TREE.nodes.find((item) => item.nodeId === node.nodeId)?.question ?? node.question) : (node.exactQuestionTextENAnchor ?? node.question)))
    doc.moveDown(0.12)
    body(doc, L('Resposta: ', 'Answer: ') + answerLabel(node.answer, pt))

    if (node.rationale) {
      doc.moveDown(0.12)
      body(doc, L('Por que este ramo foi seguido: ', 'Why this branch was followed: ') + didacticReason(node.nodeId, node.answer, localizeRationale(node.rationale, locale), pt))
    }

    const destination = node.terminalCode
      ? L('Código terminal ', 'Terminal code ') + node.terminalCode
      : node.nextNodeId
        ? L('Próximo nó ', 'Next node ') + node.nextNodeId
        : L('Travessia interrompida', 'Traversal stopped')

    doc.moveDown(0.12)
    body(doc, L('Resultado do nó: ', 'Node result: ') + destination)

    const support = entries(node.supportingEvidence)
    if (support.length) {
      doc.moveDown(0.25)
      subheading(doc, L('Evidência usada neste nó', 'Evidence used at this node'))
      bullets(doc, support)
    }

    const counter = entries(node.counterEvidence)
    if (counter.length) {
      doc.moveDown(0.2)
      subheading(doc, L('Contraevidência / ressalvas', 'Counter-evidence / caveats'))
      bullets(doc, counter)
    }

    const prohibited = entries(node.prohibitedInferenceChecks)
    if (prohibited.length) {
      doc.moveDown(0.2)
      subheading(doc, L('Inferências explicitamente proibidas', 'Explicitly prohibited inferences'))
      bullets(doc, prohibited.map((item) => translateInference(item, pt)))
    }

    meta(doc, L('Confiança do nó', 'Node confidence'), confidenceLabel(node.confidence, pt))
    doc.moveDown(0.55)
  })

  subheading(doc, L('Resumo do caminho percorrido (nó:resposta)', 'Traversed path summary (node:answer)'))
  bullets(doc, axis.alternativesConsidered.filter((item) => !/^[POA]-[A-Z]$/.test(item)))
  doc.moveDown(0.25)

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
          'O motor produz candidatos metodológicos. selectedCode, releasedCode, finalConclusion, CLASSIFIED, READY e processamento subsequente permanecem bloqueados até revisão humana.',
          'The engine produces methodological candidates. selectedCode, releasedCode, finalConclusion, CLASSIFIED, READY, and downstream processing remain blocked until human review.',
        ),
        56,
        bannerY + 25,
        { width: doc.page.width - 112, lineGap: 1.4 },
      )
    doc.y = bannerY + 65

    heading(doc, '1. ' + L('Proveniência e controle metodológico', 'Provenance and methodological control'))
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

    heading(doc, '2. ' + L('Relato submetido', 'Submitted narrative'))
    body(doc, analysis.narrative, 'justify')

    heading(doc, '3. ' + L('Modelo da operação segura', 'Safe-operation model'))
    meta(doc, L('Estado seguro esperado', 'Expected safe state'), value(output.safeOperationModel.expectedSafeState))
    meta(doc, L('Ação segura esperada', 'Expected safe action'), value(output.safeOperationModel.expectedSafeAction))
    meta(doc, L('Confiança', 'Confidence'), confidenceLabel(output.safeOperationModel.confidence, pt))
    subheading(doc, L('Evidência considerada', 'Evidence considered'))
    bullets(doc, output.safeOperationModel.evidence, L('Nenhum item registrado.', 'No item recorded.'))

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

    heading(doc, '6. ' + L('Fluxo de decisão canônico - nós, perguntas e respostas', 'Canonical decision flow - nodes, questions, and answers'))
    body(
      doc,
      L(
        'Esta seção reproduz a trilha efetivamente percorrida pelo motor na árvore canônica. Cada nó apresenta a pergunta, a resposta, a evidência usada, a justificativa e o ramo seguinte ou código terminal.',
        'This section reproduces the path actually traversed by the engine in the canonical tree. Each node presents the question, answer, evidence used, rationale, and next branch or terminal code.',
      ),
      'justify',
    )
    doc.moveDown(0.45)
    for (const path of output.canonicalTraversal.paths) renderPath(doc, path, output, pt)

    heading(doc, '7. ' + L('Pré-condições', 'Preconditions'))
    if (!output.preconditions.length) {
      body(doc, L('Nenhuma pré-condição candidata foi sustentada pela evidência disponível.', 'No candidate precondition was supported by the available evidence.'))
    } else {
      for (const pc of output.preconditions) {
        keepTogether(doc, 110)
        const reviewCard = reviewerOutput.preconditionReview.cards.find((card) => card.category === pc.category)
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1d4f73')
          .text(categoryLabel(pc.category) + ' - ' + confidenceLabel(pc.confidence, pt))
        body(doc, pc.description)
        meta(doc, L('Relação com a falha', 'Relationship to the failure'), relationshipLabel(pc.relationship))
        meta(doc, L('Ator associado', 'Associated actor'), value(localizeActor(pc.linkedActor, locale)))
        meta(doc, L('Regra(s) de origem', 'Source rule(s)'), pc.sourceRuleIds.join(', '))
        meta(doc, L('É ponto de fuga?', 'Is it the escape point?'), L('NÃO - mantida separadamente como pré-condição/hipótese', 'NO - kept separate as a precondition/hypothesis'))
        if (pt && reviewCard?.reviewerQuestion) meta(doc, 'Pergunta ao revisor', reviewCard.reviewerQuestion)
        subheading(doc, L('Evidência', 'Evidence'))
        bullets(doc, pc.evidence)
        doc.moveDown(0.55)
      }
    }

    heading(doc, '8. ' + L('Rastreabilidade e polaridade da evidência', 'Evidence traceability and polarity'))
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

    heading(doc, '9. ' + L('Salvaguardas metodológicas - guardrails', 'Methodological safeguards - guardrails'))
    for (const [name, violated] of Object.entries(output.guardrails)) {
      const evidence = output.guardrailEvidence[name] ?? []
      doc.font('Helvetica-Bold').fontSize(8.8)
        .fillColor(violated ? '#9b2c2c' : '#2f6f4e')
        .text((violated ? L('VIOLAÇÃO', 'VIOLATION') : 'OK') + ' - ' + guardrailLabel(name, pt))
      if (evidence.length) bullets(doc, evidence)
      doc.moveDown(0.22)
    }

    heading(doc, '10. ' + L('Gate de suficiência da evidência', 'Evidence-sufficiency gate'))
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

    heading(doc, '11. ' + L('Incertezas, limitações e perguntas em aberto', 'Uncertainties, limitations, and open questions'))
    subheading(doc, L('Incertezas', 'Uncertainties'))
    bullets(doc, output.uncertainties.map((item) => translateReportText(item, pt)))
    subheading(doc, L('Limitações', 'Limitations'))
    bullets(doc, output.limitations.map((item) => translateReportText(item, pt)))
    subheading(doc, L('Perguntas canônicas ainda não respondidas', 'Canonical questions not yet answered'))
    bullets(doc, output.canonicalTraversal.unansweredQuestions.map((item) => translateReportText(item, pt)))

    heading(doc, '12. ' + L('Pacote de revisão humana', 'Human review package'))
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

    heading(doc, '13. ' + L('Conclusão de uso', 'Use conclusion'))
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
