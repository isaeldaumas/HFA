import { generateSeraVNextPdfBuffer } from '../pdf-report'
import type { SeraVNextProductContext } from '../types'
import { createAuditEvent } from './create-audit-event'
import { getSeraVNextAnalysisDetail } from './get-analysis'
import { createSeraVNextProductRepository, type SeraVNextProductRepository } from './repositories'

function safeFilename(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'analise'
}

export async function exportSeraVNextAnalysisPdf(args: {
  analysisId: string
  context: SeraVNextProductContext
  repository?: SeraVNextProductRepository
}) {
  const repository = args.repository ?? createSeraVNextProductRepository()
  const detail = await getSeraVNextAnalysisDetail({
    id: args.analysisId,
    context: args.context,
    repository,
    auditView: false,
  })
  const analysis = detail.analysis
  const buffer = await generateSeraVNextPdfBuffer(detail)

  await createAuditEvent({
    repository,
    context: args.context,
    analysisId: analysis.id,
    eventType: 'analysis.exported',
    fromStatus: analysis.status,
    toStatus: analysis.status,
    payload: { format: 'pdf', reviewCount: detail.reviews.length, bytes: buffer.byteLength },
  })

  const date = new Date().toISOString().slice(0, 10)
  return {
    buffer,
    filename: `HFA_SERA_${safeFilename(analysis.title)}_${date}.pdf`,
    analysis,
  }
}
