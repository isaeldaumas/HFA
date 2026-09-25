// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit/js/pdfkit.standalone.js') as typeof import('pdfkit')

import type { SeraCanonicalPath, SeraVNextEngineOutput } from '@/lib/sera-vnext/engine-contract'
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

function bullets(doc: Doc, items: string[], empty = 'Nenhum item registrado.'): void {
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

function answerLabel(answer: string): string {
  const map: Record<string, string> = {
    START: 'INÍCIO',
    SIM: 'SIM',
    'NÃO': 'NÃO',
    'NÃO_SENSORIAL': 'NÃO - limitação sensorial',
    'NÃO_CONHECIMENTO': 'NÃO - conhecimento',
    SIM_ATENCAO: 'SIM - atenção',
    SIM_GERENCIAMENTO: 'SIM - gerenciamento',
    'NÃO_DESLIZE_LAPSO_ERRO': 'NÃO - deslize/lapso/erro',
    'NÃO_FEEDBACK': 'NÃO - feedback/verificação',
    'NÃO_INABILIDADE': 'NÃO - inabilidade',
    'NÃO_SELECAO': 'NÃO - seleção',
    SIM_SELECAO: 'SIM - seleção',
    SIM_FEEDBACK: 'SIM - feedback',
    INSUFFICIENT_EVIDENCE: 'EVIDÊNCIA INSUFICIENTE',
  }
  return map[answer] ?? answer
}

function didacticReason(nodeId: string, answer: string, fallback: string | undefined): string {
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

function translateInference(value: string): string {
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

function confidenceLabelPt(value: string | undefined | null): string {
  if (value === 'HIGH') return 'ALTA'
  if (value === 'MEDIUM') return 'MÉDIA'
  if (value === 'LOW') return 'BAIXA'
  return value ?? '-'
}

function candidateStatusLabelPt(value: string): string {
  const map: Record<string, string> = {
    CANDIDATE: 'CANDIDATO',
    NO_FAILURE: 'SEM FALHA INDEPENDENTE',
    INSUFFICIENT_EVIDENCE: 'EVIDÊNCIA INSUFICIENTE',
    UNRESOLVED: 'NÃO RESOLVIDO',
    PROGRESSIVE_ZONE: 'ZONA PROGRESSIVA',
    NO_HUMAN_ESCAPE_POINT: 'SEM PONTO DE FUGA HUMANO',
  }
  return map[value] ?? value
}

function translateReportText(value: string): string {
  const map: Record<string, string> = {
    'Post-escape evidence was quarantined from causal traversal.': 'Evidência posterior ao ponto de fuga foi mantida em quarentena e não entrou na travessia causal.',
    'Confirm or reject the candidate escape point boundary.': 'Confirmar ou rejeitar o limite candidato do ponto de fuga.',
    'Confirm or reject the direct actor attribution.': 'Confirmar ou rejeitar a atribuição do ator direto.',
    'Review P/O/A candidate code alternatives and retained uncertainties.': 'Revisar os códigos candidatos P/O/A, as alternativas consideradas e as incertezas mantidas.',
    'Confirm whether each precondition is distinct from the active failure.': 'Confirmar se cada pré-condição é distinta da falha ativa.',
  }
  return map[value] ?? value
}

function guardrailLabel(name: string): string {
  const map: Record<string, string> = {
    consequenceUsedAsCause: 'Consequência utilizada indevidamente como causa',
    postEscapeHuntingDetected: 'Busca causal após o ponto de fuga',
    postEscapeEvidenceUsed: 'Evidência pós-ponto de fuga usada na causalidade',
    oeUsed: 'Código O-E inexistente utilizado',
    inventedQuestionDetected: 'Pergunta canônica inventada ou reconstruída',
    actorMigrationDetected: 'Migração indevida do ator causal',
    preconditionUsedAsEscapePoint: 'Pré-condição utilizada como ponto de fuga',
    codeFirstPathDetected: 'Código definido antes da travessia metodológica',
    awarenessMissingForViolation: 'Violação atribuída sem evidência de consciência da regra',
  }
  return map[name] ?? name
}

function axisLabel(axis: string): string {
  if (axis === 'P') return 'Percepção (P)'
  if (axis === 'O') return 'Objetivo (O)'
  return 'Ação (A)'
}

function axisOutput(output: SeraVNextEngineOutput, axis: string) {
  if (axis === 'P') return output.axes.perception
  if (axis === 'O') return output.axes.objective
  return output.axes.action
}

function renderPath(doc: Doc, path: SeraCanonicalPath, output: SeraVNextEngineOutput): void {
  const axis = axisOutput(output, path.axis)
  const x = doc.page.margins.left
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right

  keepTogether(doc, 78)
  const y = doc.y
  doc.roundedRect(x, y, width, 42, 5).fillAndStroke('#f2f7fb', '#cad8e5')
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#1b4c72')
    .text(axisLabel(path.axis) + ' - código candidato: ' + value(axis.proposedCode, 'não resolvido'), x + 9, y + 8)
  doc.font('Helvetica').fontSize(8.1).fillColor('#536676')
    .text('Status: ' + candidateStatusLabelPt(axis.status) + ' | Confiança: ' + confidenceLabelPt(axis.confidence) + ' | Ator: ' + value(axis.actor), x + 9, y + 24)
  doc.y = y + 51

  if (axis.statementAtEscapePoint) {
    subheading(doc, 'Enunciado no ponto de fuga')
    body(doc, axis.statementAtEscapePoint)
    doc.moveDown(0.25)
  }

  subheading(doc, 'Fluxo canônico percorrido')
  if (!path.answers.length) {
    body(doc, 'Nenhum nó percorrido.')
    return
  }

  path.answers.forEach((node, index) => {
    keepTogether(doc, 128)
    const nodeY = doc.y
    doc.roundedRect(x, nodeY, width, 18, 4).fill('#e7f0f7')
    doc.font('Helvetica-Bold').fontSize(8.7).fillColor('#1d4f73')
      .text('Nó ' + String(index + 1) + ' - ' + node.nodeId, x + 8, nodeY + 5)
    doc.y = nodeY + 24

    body(doc, 'Pergunta canônica: ' + node.question)
    doc.moveDown(0.12)
    body(doc, 'Resposta: ' + answerLabel(node.answer))

    if (node.rationale) {
      doc.moveDown(0.12)
      body(doc, 'Por que este ramo foi seguido: ' + didacticReason(node.nodeId, node.answer, node.rationale))
    }

    const destination = node.terminalCode
      ? 'Código terminal ' + node.terminalCode
      : node.nextNodeId
        ? 'Próximo nó ' + node.nextNodeId
        : 'Travessia interrompida'

    doc.moveDown(0.12)
    body(doc, 'Resultado do nó: ' + destination)

    const support = entries(node.supportingEvidence)
    if (support.length) {
      doc.moveDown(0.25)
      subheading(doc, 'Evidência usada neste nó')
      bullets(doc, support)
    }

    const counter = entries(node.counterEvidence)
    if (counter.length) {
      doc.moveDown(0.2)
      subheading(doc, 'Contraevidência / ressalvas')
      bullets(doc, counter)
    }

    const prohibited = entries(node.prohibitedInferenceChecks)
    if (prohibited.length) {
      doc.moveDown(0.2)
      subheading(doc, 'Inferências explicitamente proibidas')
      bullets(doc, prohibited.map(translateInference))
    }

    meta(doc, 'Confiança do nó', confidenceLabelPt(node.confidence))
    doc.moveDown(0.55)
  })

  subheading(doc, 'Resumo do caminho percorrido (nó:resposta)')
  bullets(doc, axis.alternativesConsidered)
  doc.moveDown(0.25)

  subheading(doc, 'Evidência posterior ao ponto de fuga excluída')
  bullets(doc, axis.excludedPostEscapeEvidence)
  doc.moveDown(0.35)
}

export function generateSeraVNextDetailedPdfBuffer(input: DetailedPdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 46,
      size: 'A4',
      bufferPages: true,
      info: {
        Title: 'HFA SERA vNext - ' + input.analysis.title,
        Subject: 'Relatório metodológico candidate-only',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const analysis = input.analysis
    const output = analysis.engine_output
    const reviewerOutput = input.reviewerOutput

    doc.font('Helvetica-Bold').fontSize(18).fillColor('#173f67')
      .text('Relatório Metodológico HFA / SERA', { align: 'center' })
    doc.moveDown(0.2)
    doc.font('Helvetica-Bold').fontSize(10.5).fillColor('#5d6e7c')
      .text('Análise candidate-only para revisão humana', { align: 'center' })
    doc.moveDown(0.55)
    doc.font('Helvetica').fontSize(9).fillColor('#263746')
      .text(analysis.title, { align: 'center' })
    doc.moveDown(0.65)

    const bannerY = doc.y
    doc.roundedRect(46, bannerY, doc.page.width - 92, 54, 5)
      .fillAndStroke('#fff8e7', '#d5b96f')
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#775015')
      .text('ATENÇÃO - RESULTADO NÃO FINAL', 56, bannerY + 10)
    doc.font('Helvetica').fontSize(8.2).fillColor('#6e571f')
      .text(
        'O motor produz candidatos metodológicos. selectedCode, releasedCode, finalConclusion, CLASSIFIED, READY e downstream permanecem bloqueados até revisão humana.',
        56,
        bannerY + 25,
        { width: doc.page.width - 112, lineGap: 1.4 },
      )
    doc.y = bannerY + 65

    heading(doc, '1. Proveniência e controle metodológico')
    meta(doc, 'ID da análise', analysis.id)
    meta(doc, 'Engine', analysis.engine_version)
    meta(doc, 'Runtime', value(analysis.engine_runtime_version))
    meta(doc, 'Metodologia', analysis.methodology_version)
    meta(doc, 'Baseline', analysis.baseline_id)
    meta(doc, 'Fixture set', analysis.fixture_set_id)
    meta(doc, 'Árvore canônica', value(analysis.canonical_tree_version))
    meta(doc, 'Commit', analysis.code_commit)
    meta(doc, 'Hash do relato', analysis.narrative_hash)
    meta(doc, 'Hash da saída', analysis.engine_output_hash)
    meta(doc, 'Status', analysis.status + ' / ' + analysis.review_status)
    meta(doc, 'Revisão corrente', String(analysis.current_revision))
    meta(doc, 'Engine do produto', input.versions.engineVersion)
    meta(doc, 'Runtime do produto', input.versions.engineRuntimeVersion)
    meta(doc, 'Schema de entrada', input.versions.inputSchemaVersion)
    meta(doc, 'Schema de saída', input.versions.outputSchemaVersion)

    heading(doc, '2. Relato submetido')
    body(doc, analysis.narrative, 'justify')

    heading(doc, '3. Modelo da operação segura')
    meta(doc, 'Estado seguro esperado', value(output.safeOperationModel.expectedSafeState))
    meta(doc, 'Ação segura esperada', value(output.safeOperationModel.expectedSafeAction))
    meta(doc, 'Confiança', output.safeOperationModel.confidence)
    subheading(doc, 'Evidência considerada')
    bullets(doc, output.safeOperationModel.evidence)

    heading(doc, '4. Ponto de fuga da operação segura')
    body(doc, value(output.escapePoint.statement), 'justify')
    doc.moveDown(0.3)
    meta(doc, 'Status', candidateStatusLabelPt(output.escapePoint.status))
    meta(doc, 'Confiança', confidenceLabelPt(output.escapePoint.confidence))
    meta(doc, 'Ator direto', value(output.directActor.actor))
    meta(doc, 'Status do ator', output.directActor.status)
    if (output.directActor.alternatives.length) {
      subheading(doc, 'Atores alternativos / contributivos')
      bullets(doc, output.directActor.alternatives)
    }
    if (output.directActor.actorMigrationWarnings.length) {
      subheading(doc, 'Avisos de fronteira de ator')
      bullets(doc, output.directActor.actorMigrationWarnings)
    }
    subheading(doc, 'Evidência de suporte ao ponto de fuga')
    bullets(doc, output.escapePoint.supportingEvidence)
    subheading(doc, 'Contraevidência / incertezas do limite')
    bullets(doc, output.escapePoint.counterEvidence)
    subheading(doc, 'Evidência posterior excluída da cadeia causal')
    bullets(doc, output.escapePoint.excludedPostEscapeEvidence)

    heading(doc, '5. Resultado P / O / A - visão sintética')
    const axes = [
      ['Percepção', output.axes.perception],
      ['Objetivo', output.axes.objective],
      ['Ação', output.axes.action],
    ] as const

    for (const [label, axis] of axes) {
      keepTogether(doc, 82)
      doc.font('Helvetica-Bold').fontSize(9.7).fillColor('#1d4f73')
        .text(label + ': ' + value(axis.proposedCode, 'não resolvido') + ' - ' + candidateStatusLabelPt(axis.status))
      body(doc, value(axis.statementAtEscapePoint))
      meta(doc, 'Confiança', confidenceLabelPt(axis.confidence))
      if (axis.proposedCode) {
        const card = label === 'Percepção'
          ? reviewerOutput.axisReviews.perception
          : label === 'Objetivo'
            ? reviewerOutput.axisReviews.objective
            : reviewerOutput.axisReviews.action
        if (card.candidateMeaning) meta(doc, 'Significado metodológico', card.candidateMeaning)
      }
      doc.moveDown(0.35)
    }

    heading(doc, '6. Fluxo de decisão canônico - nós, perguntas e respostas')
    body(
      doc,
      'Esta seção reproduz a trilha efetivamente percorrida pelo motor na árvore canônica. Cada nó apresenta a pergunta, a resposta, a evidência usada, a justificativa e o ramo seguinte ou código terminal.',
      'justify',
    )
    doc.moveDown(0.45)
    for (const path of output.canonicalTraversal.paths) renderPath(doc, path, output)

    heading(doc, '7. Pré-condições')
    if (!output.preconditions.length) {
      body(doc, 'Nenhuma pré-condição candidata foi sustentada pela evidência disponível.')
    } else {
      for (const pc of output.preconditions) {
        keepTogether(doc, 110)
        const reviewCard = reviewerOutput.preconditionReview.cards.find((card) => card.category === pc.category)
        doc.font('Helvetica-Bold').fontSize(9.5).fillColor('#1d4f73')
          .text((reviewCard?.plainLanguageLabel ?? pc.category) + ' - ' + confidenceLabelPt(pc.confidence))
        body(doc, pc.description)
        meta(doc, 'Relação com a falha', reviewCard?.relationship ?? pc.relationship)
        meta(doc, 'Ator associado', value(pc.linkedActor))
        meta(doc, 'Regra(s) de origem', pc.sourceRuleIds.join(', '))
        meta(doc, 'É ponto de fuga?', 'NÃO - mantida separadamente como pré-condição')
        if (reviewCard?.reviewerQuestion) meta(doc, 'Pergunta ao revisor', reviewCard.reviewerQuestion)
        subheading(doc, 'Evidência')
        bullets(doc, pc.evidence)
        doc.moveDown(0.55)
      }
    }

    heading(doc, '8. Rastreabilidade e polaridade da evidência')
    const evidenceItems = output.factualExtraction.evidence
    const rejected = evidenceItems.filter((item) => item.assertionStatus === 'REJECTED_AS_FACTOR')
    const uncertain = evidenceItems.filter((item) => item.assertionStatus === 'UNCERTAIN')
    const postEscape = evidenceItems.filter((item) => item.temporalRelation === 'POST_ESCAPE')
    const analysisOnly = evidenceItems.filter((item) => item.sourceSection === 'REPORT_ANALYSIS' || item.sourceSection === 'RECOMMENDATION')
    meta(doc, 'Itens factuais indexados', String(evidenceItems.length))
    meta(doc, 'Fatores explicitamente rejeitados no relatório-fonte', String(rejected.length))
    meta(doc, 'Afirmações incertas/hipotéticas', String(uncertain.length))
    meta(doc, 'Itens pós-ponto de fuga', String(postEscape.length))
    meta(doc, 'Itens de análise/recomendação não usados como fato causal', String(analysisOnly.length))
    subheading(doc, 'Fatores que o próprio relatório-fonte declarou como não contribuintes')
    bullets(doc, rejected.map((item) => item.statement))
    subheading(doc, 'Hipóteses ou formulações incertas preservadas como incerteza')
    bullets(doc, uncertain.map((item) => item.statement))
    subheading(doc, 'Fatos posteriores ao ponto de fuga, mantidos em quarentena causal')
    bullets(doc, postEscape.map((item) => item.statement))

    heading(doc, '9. Salvaguardas metodológicas - guardrails')
    for (const [name, violated] of Object.entries(output.guardrails)) {
      const evidence = output.guardrailEvidence[name] ?? []
      doc.font('Helvetica-Bold').fontSize(8.8)
        .fillColor(violated ? '#9b2c2c' : '#2f6f4e')
        .text((violated ? 'VIOLAÇÃO' : 'OK') + ' - ' + guardrailLabel(name))
      if (evidence.length) bullets(doc, evidence)
      doc.moveDown(0.22)
    }

    heading(doc, '10. Gate de suficiência da evidência')
    meta(doc, 'Status', output.evidenceSufficiency.status)
    meta(doc, 'Evidência mínima satisfeita', output.evidenceSufficiency.minimumEvidenceSatisfied ? 'SIM' : 'NÃO')
    subheading(doc, 'Razões de bloqueio')
    bullets(doc, output.evidenceSufficiency.blockingReasons)
    if (output.evidenceSufficiency.questions.length) {
      subheading(doc, 'Perguntas investigativas necessárias antes de concluir')
      for (const [index, item] of output.evidenceSufficiency.questions.entries()) {
        keepTogether(doc, 90)
        doc.font('Helvetica-Bold').fontSize(9).fillColor('#8a5a00')
          .text(`Pergunta ${index + 1} — ${item.stage}${item.linkedNodeId ? ` — nó ${item.linkedNodeId}` : ''}`)
        body(doc, item.question, 'justify')
        meta(doc, 'Por que é necessária', item.whyNeeded)
        subheading(doc, 'Evidência solicitada')
        bullets(doc, item.requestedEvidence)
        doc.moveDown(0.35)
      }
    } else {
      body(doc, 'Nenhuma pergunta adicional é necessária para a análise candidate-only atual.')
    }

    heading(doc, '11. Incertezas, limitações e perguntas em aberto')
    subheading(doc, 'Incertezas')
    bullets(doc, output.uncertainties.map(translateReportText))
    subheading(doc, 'Limitações')
    bullets(doc, output.limitations.map(translateReportText))
    subheading(doc, 'Perguntas canônicas ainda não respondidas')
    bullets(doc, output.canonicalTraversal.unansweredQuestions.map(translateReportText))

    heading(doc, '12. Pacote de revisão humana')
    subheading(doc, 'Decisões requeridas do revisor')
    bullets(doc, output.humanReviewPackage.reviewerDecisionsRequired.map(translateReportText))
    subheading(doc, 'Avisos críticos')
    bullets(doc, output.humanReviewPackage.criticalWarnings.map(translateReportText))

    if (!input.reviews.length) {
      subheading(doc, 'Revisões registradas')
      body(doc, 'Nenhuma revisão humana registrada até o momento.')
    } else {
      subheading(doc, 'Revisões registradas')
      for (const review of input.reviews) {
        keepTogether(doc, 90)
        meta(doc, 'Decisão', review.decision)
        meta(doc, 'Evidência suficiente', review.evidence_sufficiency)
        meta(doc, 'Requer mais evidência', review.requires_more_evidence ? 'SIM' : 'NÃO')
        meta(doc, 'Data', review.created_at)
        if (review.review_notes) body(doc, 'Notas: ' + review.review_notes)
        doc.moveDown(0.4)
      }
    }

    heading(doc, '13. Conclusão de uso')
    body(
      doc,
      'Este relatório documenta uma hipótese metodológica candidate-only e a trilha de decisão do motor. Ele não constitui classificação final liberada. O revisor deve confirmar o ponto de fuga, o ator direto, cada eixo P/O/A, as pré-condições e qualquer evidência conflitante antes de uso formal.',
      'justify',
    )

    doc.end()
  })
}

export const generateSeraVNextPdfBuffer = generateSeraVNextDetailedPdfBuffer
