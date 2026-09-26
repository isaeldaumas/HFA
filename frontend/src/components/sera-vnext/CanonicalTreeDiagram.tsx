'use client'

import dynamic from 'next/dynamic'
import type { SeraCanonicalPath } from '@/lib/sera-vnext/engine-contract'
import { buildCanonicalFlowMermaid } from '@/lib/sera-vnext/canonical-flow-visual'

const FlowDiagram = dynamic(() => import('@/components/FlowDiagram'), { ssr: false })

export function CanonicalTreeDiagram({ path, pt, compact = false }: { path: SeraCanonicalPath; pt: boolean; compact?: boolean }) {
  const chart = buildCanonicalFlowMermaid(path, pt)
  const pathColor = path.axis === 'P' ? '#0891b2' : path.axis === 'O' ? '#d97706' : '#e11d48'
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm" style={{ backgroundColor: pathColor }} />{pt ? 'Caminho seguido' : 'Traversed path'}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm border border-slate-600 bg-slate-900" />{pt ? 'Caminho não seguido' : 'Path not taken'}</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-5 rounded-sm bg-green-700" />{pt ? 'Classificação alcançada' : 'Reached classification'}</span>
      </div>
      <div className={compact ? 'max-h-[620px] overflow-auto rounded-xl border border-slate-800' : 'overflow-auto rounded-xl border border-slate-800'}>
        <FlowDiagram chart={chart} id={`canonical-${path.axis}-${path.candidateCode ?? 'unresolved'}`} />
      </div>
    </div>
  )
}
