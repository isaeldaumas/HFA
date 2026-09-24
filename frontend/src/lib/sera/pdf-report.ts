// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit/js/pdfkit.standalone.js') as typeof import('pdfkit')

type JsonRecord = Record<string, unknown>

function s(v: unknown, fallback = '-'): string {
  if (v === null || v === undefined || v === '') return fallback
  return String(v)
}

function arr(v: unknown): JsonRecord[] {
  return Array.isArray(v) ? v.filter((item): item is JsonRecord => !!item && typeof item === 'object') : []
}

function textArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((item) => String(item)).filter(Boolean) : []
}

function section(doc: InstanceType<typeof PDFDocument>, title: string): void {
  doc.moveDown(0.8)
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#1e3a5f').text(title)
  doc.moveDown(0.2)
  doc.strokeColor('#cbd5e1').lineWidth(0.5)
    .moveTo(doc.page.margins.left, doc.y)
    .lineTo(doc.page.width - doc.page.margins.right, doc.y)
    .stroke()
  doc.moveDown(0.45)
}

function sub(doc: InstanceType<typeof PDFDocument>, title: string): void {
  doc.font('Helvetica-Bold').fontSize(9.6).fillColor('#334155').text(title)
  doc.moveDown(0.12)
}

function body(doc: InstanceType<typeof PDFDocument>, value: unknown, size = 9): void {
  doc.font('Helvetica').fontSize(size).fillColor('#1e293b').text(s(value), {
    lineGap: 1.5,
  })
}

function meta(doc: InstanceType<typeof PDFDocument>, label: string, value: unknown): void {
  doc.font('Helvetica-Bold').fontSize(8.2).fillColor('#64748b').text(label + ': ', { continued: true })
  doc.font('Helvetica').fillColor('#334155').text(s(value))
}

function bullets(doc: InstanceType<typeof PDFDocument>, values: string[], empty = 'Nenhum item registrado.'): void {
  if (!values.length) {
    doc.font('Helvetica-Oblique').fontSize(8.4).fillColor('#94a3b8').text(empty)
    return
  }
  for (const value of values) {
    doc.font('Helvetica').fontSize(8.4).fillColor('#334155').text('- ' + value, {
      indent: 10,
      lineGap: 1.2,
    })
  }
}

function renderLegacyNodes(
  doc: InstanceType<typeof PDFDocument>,
  label: string,
  discarded: unknown,
): void {
  const record = discarded && typeof discarded === 'object' ? discarded as JsonRecord : {}
  const nodes = arr(record.nos_percorridos)
  sub(doc, label + ' - nós percorridos')
  if (!nodes.length) {
    body(doc, 'Nenhum nó detalhado registrado nesta análise.', 8.4)
  } else {
    nodes.forEach((node, index) => {
      doc.font('Helvetica-Bold').fontSize(8.6).fillColor('#1d4f73')
        .text('Nó ' + String(index + 1) + ' - resposta: ' + s(node.resposta ?? node.codigo ?? 'não registrada'))
      if (node.justificativa) body(doc, 'Por que este ramo foi seguido: ' + s(node.justificativa), 8.3)
      if (node.objetivo_identificado) body(doc, 'Objetivo identificado: ' + s(node.objetivo_identificado), 8.3)
      doc.moveDown(0.25)
    })
  }
  if (record.falhas_descartadas) {
    sub(doc, 'Alternativas descartadas')
    body(doc, record.falhas_descartadas, 8.3)
  }
}

function renderQuestionTrace(
  doc: InstanceType<typeof PDFDocument>,
  label: string,
  trace: unknown,
): void {
  const items = arr(trace)
  if (!items.length) return
  sub(doc, label + ' - trilha metodológica detalhada')
  items.forEach((item, index) => {
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1d4f73')
      .text('Pergunta ' + String(index + 1) + ': ' + s(item.question_text ?? item.question_id))
    meta(doc, 'Resposta', item.answer)
    if (item.evidence) body(doc, 'Evidência: ' + s(item.evidence), 8.2)
    if (item.produced_code) meta(doc, 'Código produzido', item.produced_code)
    if (item.methodological_status) meta(doc, 'Status metodológico', item.methodological_status)
    if (item.unanswered_reason) meta(doc, 'Motivo de não resposta', item.unanswered_reason)
    const limitations = textArray(item.limitations)
    if (limitations.length) {
      doc.font('Helvetica').fontSize(7.7).fillColor('#64748b')
        .text('Limitações do nó: ' + limitations.join('; '))
    }
    doc.moveDown(0.35)
  })
}

export function generateSeraPdfBuffer(
  analysis: JsonRecord,
  event: JsonRecord,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' })
    const chunks: Buffer[] = []
    doc.on('data', (chunk) => chunks.push(chunk as Buffer))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const summaryText = s(analysis.summary || analysis.event_summary, '')
    const raw = analysis.raw_llm_output && typeof analysis.raw_llm_output === 'object'
      ? analysis.raw_llm_output as JsonRecord
      : {}
    const experimental = raw.trace_experimental && typeof raw.trace_experimental === 'object'
      ? raw.trace_experimental as JsonRecord
      : {}

    doc.font('Helvetica-Bold').fontSize(17).fillColor('#1e3a5f')
      .text('Relatório de Análise HFA / SERA', { align: 'center' })
    doc.moveDown(0.35)
    doc.font('Helvetica').fontSize(9).fillColor('#64748b')
      .text(s(event.title) + ' | ' + s(event.operation_type) + ' | ' + s(event.aircraft_type), { align: 'center' })
    doc.moveDown(0.8)

    section(doc, '1. Proveniência da análise')
    meta(doc, 'Motor', analysis.engine_id ?? 'SERA_LEGACY_ENGINE')
    meta(doc, 'Versão do motor', analysis.motor_version)
    meta(doc, 'Metodologia', analysis.methodology_version)
    meta(doc, 'Taxonomia', analysis.taxonomy_version)
    meta(doc, 'Status de validação', analysis.validation_status)
    meta(doc, 'Origem', analysis.source_type)
    if (analysis.source_file_name) meta(doc, 'Arquivo-fonte', analysis.source_file_name)
    doc.font('Helvetica-Oblique').fontSize(8).fillColor('#92400e')
      .text('A classificação e as conclusões devem ser revisadas pelo investigador antes do uso formal.')
    doc.moveDown(0.4)

    section(doc, '2. Resumo do evento')
    if (analysis.event_date) meta(doc, 'Data', analysis.event_date)
    if (analysis.event_location) meta(doc, 'Local', analysis.event_location)
    if (analysis.flight_phase) meta(doc, 'Fase do voo', analysis.flight_phase)
    if (analysis.weather_conditions) meta(doc, 'Condições meteorológicas', analysis.weather_conditions)
    body(doc, summaryText || '-')

    section(doc, '3. Ponto de fuga da operação segura')
    body(doc, analysis.escape_point)
    doc.moveDown(0.25)
    meta(doc, 'Agente', analysis.unsafe_agent)
    meta(doc, 'Ato/condição insegura factual', analysis.unsafe_act)

    section(doc, '4. Percepção (P)')
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1d4f73')
      .text(s(analysis.perception_code) + ' - ' + s(analysis.perception_name))
    body(doc, analysis.perception_justification, 8.8)
    renderLegacyNodes(doc, 'Percepção', analysis.perception_discarded)
    renderQuestionTrace(doc, 'Percepção', experimental.perception_question_trace)

    section(doc, '5. Objetivo (O)')
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1d4f73')
      .text(s(analysis.objective_code) + ' - ' + s(analysis.objective_name))
    body(doc, analysis.objective_justification, 8.8)
    renderLegacyNodes(doc, 'Objetivo', analysis.objective_discarded)
    renderQuestionTrace(doc, 'Objetivo', experimental.objective_question_trace)

    section(doc, '6. Ação (A)')
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1d4f73')
      .text(s(analysis.action_code) + ' - ' + s(analysis.action_name))
    body(doc, analysis.action_justification, 8.8)
    renderLegacyNodes(doc, 'Ação', analysis.action_discarded)
    renderQuestionTrace(doc, 'Ação', experimental.action_question_trace)

    section(doc, '7. Pré-condições')
    const preconditions = arr(analysis.preconditions)
    if (!preconditions.length) {
      body(doc, 'Nenhuma pré-condição registrada.', 8.5)
    } else {
      preconditions.forEach((item, index) => {
        doc.font('Helvetica-Bold').fontSize(8.8).fillColor('#1d4f73')
          .text(s(item.code ?? item.codigo, 'P' + String(index + 1)) + ' - ' + s(item.name ?? item.descricao ?? 'Pré-condição'))
        if (item.justification) body(doc, item.justification, 8.2)
        if (item.evidencia_no_relato) body(doc, 'Evidência indicada: ' + s(item.evidencia_no_relato), 8.2)
        if (item.sourceRuleId) meta(doc, 'Regra/código de origem', item.sourceRuleId)
        doc.moveDown(0.25)
      })
    }
    renderQuestionTrace(doc, 'Pré-condições', experimental.preconditions_question_trace)

    section(doc, '8. Conclusão')
    body(doc, analysis.conclusions)

    section(doc, '9. Recomendações')
    const recommendations = arr(analysis.recommendations)
    if (!recommendations.length) {
      body(doc, 'Nenhuma recomendação registrada.', 8.5)
    } else {
      recommendations.forEach((item, index) => {
        doc.font('Helvetica-Bold').fontSize(8.8).fillColor('#1d4f73')
          .text(String(index + 1) + '. ' + s(item.acao ?? item.title ?? item.description))
        if (item.justificativa) body(doc, item.justificativa, 8.2)
        if (item.falha_relacionada ?? item.related_code) {
          meta(doc, 'Falha relacionada', item.falha_relacionada ?? item.related_code)
        }
        doc.moveDown(0.3)
      })
    }

    section(doc, '10. Controles de consistência e rastreabilidade')
    const consistency = raw.causal_consistency && typeof raw.causal_consistency === 'object'
      ? raw.causal_consistency as JsonRecord
      : {}
    if (Object.keys(consistency).length) {
      meta(doc, 'Consistência causal', consistency.passed === true ? 'PASS' : consistency.passed === false ? 'FAIL' : 'não informada')
      bullets(doc, textArray(consistency.issues), 'Nenhuma inconsistência causal registrada.')
    } else {
      body(doc, 'A análise não contém bloco estruturado de consistência causal.')
    }
    const decisionTrace = raw.decision_trace && typeof raw.decision_trace === 'object'
      ? raw.decision_trace as JsonRecord
      : {}
    if (Object.keys(decisionTrace).length) {
      sub(doc, 'Rastro de decisão registrado')
      for (const [axis, value] of Object.entries(decisionTrace)) {
        const item = value && typeof value === 'object' ? value as JsonRecord : {}
        body(doc, axis.toUpperCase() + ': código ' + s(item.code) + ' | fonte ' + s(item.source) + ' | nós ' + s(item.nodes_count), 8.2)
      }
    }

    doc.moveDown(0.8)
    doc.font('Helvetica').fontSize(7.8).fillColor('#94a3b8')
      .text('HFA Platform - SERA (Systematic Error and Risk Analysis) - relatório de apoio à investigação.', { align: 'center' })

    doc.end()
  })
}
