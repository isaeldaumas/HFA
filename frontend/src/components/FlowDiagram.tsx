'use client'
import { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  themeVariables: {
    primaryColor: '#1e293b',
    primaryTextColor: '#f1f5f9',
    lineColor: '#64748b',
    background: '#0f172a',
  },
})

interface FlowDiagramProps {
  chart: string
  id: string
  variant?: 'dark' | 'light'
}

export default function FlowDiagram({ chart, id, variant = 'dark' }: FlowDiagramProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current && chart) {
      ref.current.innerHTML = ''
      mermaid.render(`mermaid-${id}`, chart).then(({ svg }) => {
        if (ref.current) ref.current.innerHTML = svg
      })
    }
  }, [chart, id])

  return <div ref={ref} className={`w-full overflow-x-auto rounded-lg p-4 min-h-[200px] ${variant === 'light' ? 'bg-white' : 'bg-slate-900'}`} />
}
