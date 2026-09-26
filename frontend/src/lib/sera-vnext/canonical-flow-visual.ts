import type { SeraCanonicalPath } from './engine-contract'
import { SERA_CANONICAL_TREE_NODES } from './canonical-tree'
import type { CanonicalSeraAxis } from './types'
import { friendlyNodeLabel } from './presentation'

export type CanonicalFlowVisualNode = {
  id: string
  sourceId: string
  kind: 'question' | 'terminal'
  label: string
  code: string | null
  active: boolean
  selected: boolean
}

export type CanonicalFlowVisualEdge = {
  from: string
  to: string
  label: string
  active: boolean
}

export type CanonicalFlowVisualModel = {
  axis: CanonicalSeraAxis
  nodes: CanonicalFlowVisualNode[]
  edges: CanonicalFlowVisualEdge[]
}

const TERMINAL_LABELS_PT: Record<string, string> = {
  'P-A': 'Nenhuma falha', 'P-B': 'Falha sensorial', 'P-C': 'Falha de conhecimento',
  'P-D': 'Atenção + pressão de tempo', 'P-E': 'Gerenciamento de tempo', 'P-F': 'Falha de percepção',
  'P-G': 'Falha de atenção', 'P-H': 'Falha de comunicação',
  'O-A': 'Nenhuma falha', 'O-B': 'Violação rotineira', 'O-C': 'Violação excepcional', 'O-D': 'Intenção sem violação',
  'A-A': 'Nenhuma falha', 'A-B': 'Deslize, omissão ou lapso', 'A-C': 'Feedback na execução',
  'A-D': 'Inabilidade para resposta', 'A-E': 'Conhecimento / decisão', 'A-F': 'Seleção da ação',
  'A-G': 'Falha de feedback', 'A-H': 'Gerenciamento do tempo', 'A-I': 'Seleção sob pressão', 'A-J': 'Feedback sob pressão',
}

const TERMINAL_LABELS_EN: Record<string, string> = {
  'P-A': 'No failure', 'P-B': 'Sensory failure', 'P-C': 'Knowledge failure',
  'P-D': 'Attention + time pressure', 'P-E': 'Time management', 'P-F': 'Perception failure',
  'P-G': 'Attention failure', 'P-H': 'Communication failure',
  'O-A': 'No failure', 'O-B': 'Routine violation', 'O-C': 'Exceptional violation', 'O-D': 'Intent / non-violation',
  'A-A': 'No failure', 'A-B': 'Slip, omission or lapse', 'A-C': 'Execution feedback',
  'A-D': 'Unable to respond', 'A-E': 'Knowledge / decision', 'A-F': 'Action selection',
  'A-G': 'Feedback failure', 'A-H': 'Time management', 'A-I': 'Selection under pressure', 'A-J': 'Feedback under pressure',
}

function safeId(value: string, prefix: string): string {
  return prefix + value.replace(/[^A-Za-z0-9_]/g, '_')
}

export function terminalLabel(code: string, pt: boolean): string {
  return (pt ? TERMINAL_LABELS_PT : TERMINAL_LABELS_EN)[code] ?? code
}

export function branchLabel(condition: string, pt: boolean): string {
  if (condition === 'START') return ''
  const mapPt: Record<string, string> = {
    SIM: 'Sim', 'NÃO': 'Não',
    'NÃO_SENSORIAL': 'Não · sensorial', 'NÃO_CONHECIMENTO': 'Não · conhecimento',
    SIM_ATENCAO: 'Sim · atenção', SIM_GERENCIAMENTO: 'Sim · gerenciamento',
    'NÃO_DESLIZE_LAPSO_ERRO': 'Não · execução', 'NÃO_FEEDBACK': 'Não · feedback',
    'NÃO_INABILIDADE': 'Não · capacidade', 'NÃO_SELECAO': 'Não · seleção',
    SIM_SELECAO: 'Sim · seleção', SIM_FEEDBACK: 'Sim · feedback',
  }
  const mapEn: Record<string, string> = {
    SIM: 'Yes', 'NÃO': 'No',
    'NÃO_SENSORIAL': 'No · sensory', 'NÃO_CONHECIMENTO': 'No · knowledge',
    SIM_ATENCAO: 'Yes · attention', SIM_GERENCIAMENTO: 'Yes · management',
    'NÃO_DESLIZE_LAPSO_ERRO': 'No · execution', 'NÃO_FEEDBACK': 'No · feedback',
    'NÃO_INABILIDADE': 'No · capability', 'NÃO_SELECAO': 'No · selection',
    SIM_SELECAO: 'Yes · selection', SIM_FEEDBACK: 'Yes · feedback',
  }
  return (pt ? mapPt : mapEn)[condition] ?? condition.replaceAll('_', ' ').toLowerCase()
}

export function buildCanonicalFlowVisualModel(path: SeraCanonicalPath, pt = true): CanonicalFlowVisualModel {
  const axis = path.axis as CanonicalSeraAxis
  const rows = SERA_CANONICAL_TREE_NODES.filter((row) => row.axis === axis)
  const visited = new Set(path.nodeIds)
  const selectedTerminal = path.candidateCode
  const selectedBranches = new Set(path.answers.map((item) => `${item.nodeId}::${item.answer}::${item.nextNodeId ?? item.terminalCode ?? ''}`))
  const uniqueQuestionIds = [...new Set(rows.map((row) => row.nodeId))]
  const terminalCodes = [...new Set(rows.flatMap((row) => row.leafCode ? [row.leafCode] : []))]

  const nodes: CanonicalFlowVisualNode[] = [
    ...uniqueQuestionIds.map((nodeId) => ({
      id: safeId(nodeId, 'N_'), sourceId: nodeId, kind: 'question' as const,
      label: friendlyNodeLabel(nodeId, pt), code: null, active: visited.has(nodeId), selected: false,
    })),
    ...terminalCodes.map((code) => ({
      id: safeId(code, 'L_'), sourceId: code, kind: 'terminal' as const,
      label: terminalLabel(code, pt), code, active: code === selectedTerminal, selected: code === selectedTerminal,
    })),
  ]

  const edges: CanonicalFlowVisualEdge[] = rows.map((row) => {
    const target = row.nextNodeId ?? row.leafCode ?? 'UNRESOLVED'
    return {
      from: safeId(row.nodeId, 'N_'),
      to: row.nextNodeId ? safeId(row.nextNodeId, 'N_') : safeId(target, 'L_'),
      label: branchLabel(row.branchCondition, pt),
      active: selectedBranches.has(`${row.nodeId}::${row.branchCondition}::${target}`),
    }
  })

  return { axis, nodes, edges }
}

function escapeMermaid(value: string): string {
  return value.replace(/"/g, "'").replace(/[{}]/g, '')
}

export function buildCanonicalFlowMermaid(path: SeraCanonicalPath, pt = true): string {
  const model = buildCanonicalFlowVisualModel(path, pt)
  const axisColor = model.axis === 'P' ? '#0891b2' : model.axis === 'O' ? '#d97706' : '#e11d48'
  const activeStroke = model.axis === 'P' ? '#67e8f9' : model.axis === 'O' ? '#fbbf24' : '#fda4af'
  const lines: string[] = ['flowchart TD']

  for (const node of model.nodes) {
    if (node.kind === 'terminal') {
      lines.push(`  ${node.id}(["${escapeMermaid(node.code ?? '')}<br/>${escapeMermaid(node.label)}"])`)
    } else if (node.sourceId.endsWith('_ROOT')) {
      lines.push(`  ${node.id}(["${escapeMermaid(node.label)}"])`)
    } else {
      lines.push(`  ${node.id}{"${escapeMermaid(node.label)}"}`)
    }
  }

  model.edges.forEach((edge) => {
    const label = edge.label ? `|${escapeMermaid(edge.label)}|` : ''
    lines.push(`  ${edge.from} -->${label} ${edge.to}`)
  })

  lines.push('  classDef mutedNode fill:#111827,stroke:#475569,color:#cbd5e1,stroke-width:1.2px')
  lines.push('  classDef mutedLeaf fill:#0f172a,stroke:#475569,color:#94a3b8,stroke-width:1.2px')
  lines.push(`  classDef activeNode fill:${axisColor},stroke:${activeStroke},color:#ffffff,stroke-width:2.8px`)
  lines.push('  classDef selectedLeaf fill:#15803d,stroke:#86efac,color:#ffffff,stroke-width:3px')

  const mutedNodes = model.nodes.filter((node) => node.kind === 'question' && !node.active).map((node) => node.id)
  const activeNodes = model.nodes.filter((node) => node.kind === 'question' && node.active).map((node) => node.id)
  const mutedLeaves = model.nodes.filter((node) => node.kind === 'terminal' && !node.selected).map((node) => node.id)
  const selectedLeaves = model.nodes.filter((node) => node.kind === 'terminal' && node.selected).map((node) => node.id)
  if (mutedNodes.length) lines.push(`  class ${mutedNodes.join(',')} mutedNode`)
  if (activeNodes.length) lines.push(`  class ${activeNodes.join(',')} activeNode`)
  if (mutedLeaves.length) lines.push(`  class ${mutedLeaves.join(',')} mutedLeaf`)
  if (selectedLeaves.length) lines.push(`  class ${selectedLeaves.join(',')} selectedLeaf`)

  const activeEdges = model.edges.map((edge, index) => edge.active ? index : -1).filter((index) => index >= 0)
  if (activeEdges.length) lines.push(`  linkStyle ${activeEdges.join(',')} stroke:${activeStroke},stroke-width:3.5px`)
  return lines.join('\n')
}
