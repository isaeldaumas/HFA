import assert from 'node:assert/strict'
import { runSeraVNextEngineV0 } from '../../frontend/src/lib/sera-vnext/engine-v0/run-engine'

type Expected = {
  actor?: RegExp | null
  P?: string | null
  O?: string | null
  A?: string | null
  escape?: 'CANDIDATE' | 'PROGRESSIVE_ZONE' | 'INSUFFICIENT_EVIDENCE'
  noKnowledgePrecondition?: boolean
}

function run(id: string, narrative: string) {
  return runSeraVNextEngineV0({
    inputId: id,
    narrative,
    locale: 'pt-BR',
    sourceType: 'real_event',
    requestId: id,
    mode: 'CANDIDATE_ONLY',
    options: { allowLlm: false, requireHumanReview: true, includeDebugTrace: true },
  })
}

function check(id: string, narrative: string, expected: Expected) {
  const out = run(id, narrative)
  if (expected.escape) assert.equal(out.escapePoint.status, expected.escape, id + ' escape')
  if (expected.actor === null) assert.notEqual(out.directActor.status, 'IDENTIFIED', id + ' actor should remain unresolved')
  if (expected.actor instanceof RegExp) assert.match(out.directActor.actor ?? '', expected.actor, id + ' actor')
  if ('P' in expected) assert.equal(out.axes.perception.proposedCode, expected.P, id + ' P')
  if ('O' in expected) assert.equal(out.axes.objective.proposedCode, expected.O, id + ' O')
  if ('A' in expected) assert.equal(out.axes.action.proposedCode, expected.A, id + ' A')
  if (expected.noKnowledgePrecondition) {
    assert.equal(out.preconditions.some((p) => p.category === 'KNOWLEDGE_TRAINING'), false, id + ' knowledge precondition')
  }
  for (const [guard, violated] of Object.entries(out.guardrails)) {
    assert.equal(violated, false, id + ' guardrail ' + guard)
  }
  if (out.escapePoint.statement) {
    assert.doesNotMatch(out.escapePoint.statement, /porque|devido|vis[aã]o de t[uú]nel|distra[cç][aã]o/i, id + ' cause embedded in escape')
  }
  return out
}

const cases: Array<{ id: string; narrative: string; expected: Expected }> = [
  {
    id: 'WDL-VAR-01',
    narrative: `
5.5 Relato da tripulação
O primeiro destino programado era UNIT-B. O comandante atuava como PM e o copiloto como PF.
O GPS continha as coordenadas corretas de UNIT-B. UNIT-A ficava praticamente sobre a rota e deveria apenas ser sobrevoada.
Ao avistar UNIT-A, a tripulação passou a tratá-la como a unidade prevista para o primeiro pouso e iniciou o planejamento da aproximação para ela.
A autorização recebida permanecia válida somente para UNIT-B.
Depois do pouso em UNIT-A, o erro foi comunicado à tripulação.
`,
    expected: { actor: /copiloto.*PF/i, P: 'P-G', O: 'O-A', A: 'A-A', escape: 'CANDIDATE', noKnowledgePrecondition: true },
  },
  {
    id: 'WDL-VAR-02',
    narrative: `
5.5 Relatos/Registros
A rota prevista tinha UNIT-B como primeiro pouso. Copiloto PF; comandante PM.
A navegação estava corretamente configurada para UNIT-B e a autorização operacional era para UNIT-B.
Na chegada à área, a tripulação confundiu UNIT-A com o destino planejado e conduziu a aproximação para UNIT-A.
6.2 Fatores contribuintes
Falta de familiaridade com a área – Não interferiu
Problemas no GPS – Não interferiu
7 Recomendações
Recomenda-se treinamento adicional de familiarização com unidades offshore.
`,
    expected: { actor: /copiloto.*PF/i, P: 'P-G', O: 'O-A', A: 'A-A', escape: 'CANDIDATE', noKnowledgePrecondition: true },
  },
  {
    id: 'WDL-VAR-03',
    narrative: `
1 Sumário
A aeronave pousou na UNIT-A, embora o primeiro destino da rota fosse UNIT-B.
5.5 Entrevista com a tripulação
O comandante era PM e o copiloto era PF. A rota e o GPS indicavam UNIT-B.
UNIT-A estava à frente durante a aproximação à área e deveria ser ultrapassada.
Antes do pouso, a tripulação identificou UNIT-A como se fosse UNIT-B e passou a preparar a aproximação para aquela unidade.
Após o pouso, o rádio informou que a aeronave estava na unidade errada.
`,
    expected: { actor: /copiloto.*PF/i, P: 'P-G', O: 'O-A', A: 'A-A', escape: 'CANDIDATE', noKnowledgePrecondition: true },
  },
  {
    id: 'WDL-VAR-04',
    narrative: `
5.5 Relato operacional
O comandante era o PF e o copiloto o PM. O destino inicial previsto e autorizado era UNIT-B.
A rota levava a aeronave a passar próxima da UNIT-A antes de UNIT-B. O GPS estava corretamente programado.
A tripulação tomou UNIT-A pela unidade prevista e o comandante passou a conduzir a aproximação para UNIT-A.
O pouso em UNIT-A ocorreu posteriormente.
`,
    expected: { actor: /comandante.*PF/i, P: 'P-G', O: 'O-A', A: 'A-A', escape: 'CANDIDATE', noKnowledgePrecondition: true },
  },
  {
    id: 'WDL-VAR-05',
    narrative: `
5.5 Relato
O plano previa UNIT-B como primeiro destino, com dados corretos no sistema de navegação.
A tripulação avistou UNIT-A antes de UNIT-B. Sem indicação de qual piloto manipulava os controles, o relato registra que a tripulação reconheceu UNIT-A como o destino previsto e prosseguiu para aproximação.
A autorização de pouso continuava sendo para UNIT-B.
`,
    expected: { actor: /flight crew|tripula/i, P: 'P-G', O: 'O-A', A: 'A-A', escape: 'CANDIDATE', noKnowledgePrecondition: true },
  },
  {
    id: 'WDL-VAR-06-AMBIGUOUS-INFO',
    narrative: `
5.5 Relato
O copiloto era PF. Durante a chegada, duas mensagens operacionais simultâneas traziam identificadores diferentes para a unidade do primeiro pouso.
O despacho indicava UNIT-B, enquanto uma atualização recebida em cabine indicava UNIT-A, sem que houvesse confirmação de qual delas substituía a anterior.
A tripulação tratou UNIT-A como o destino e iniciou a aproximação para ela.
`,
    expected: { actor: /copiloto/i, P: 'P-F', escape: 'CANDIDATE' },
  },
  {
    id: 'WDL-VAR-07-KNOWLEDGE',
    narrative: `
5.5 Relato
O copiloto era PF e o comandante PM. O sistema exibiu corretamente o identificador técnico da unidade UNIT-B.
A tripulação declarou que nunca havia recebido treinamento para interpretar aquele formato de identificação e não sabia como distinguir UNIT-B de UNIT-A naquele equipamento.
Eles interpretaram UNIT-A como o destino previsto e iniciaram a aproximação para UNIT-A.
`,
    expected: { actor: /copiloto/i, P: 'P-C', escape: 'CANDIDATE' },
  },
  {
    id: 'WDL-VAR-08-SENSORY',
    narrative: `
5.5 Relato
O destino planejado era UNIT-B. O copiloto era PF.
Durante a aproximação noturna, chuva intensa e névoa encobriam as marcações das duas unidades e as referências visuais estavam degradadas.
A tripulação não conseguia distinguir visualmente UNIT-A de UNIT-B e passou a aproximar UNIT-A acreditando tratar-se do destino.
`,
    expected: { actor: /copiloto/i, P: 'P-B', escape: 'CANDIDATE' },
  },
  {
    id: 'WDL-VAR-09-OUTCOME-ONLY',
    narrative: `
A aeronave pousou em uma unidade diferente da planejada.
O relatório não informa qual piloto voava, quando ocorreu a identificação da unidade, quais informações estavam disponíveis em cabine, nem como a aproximação foi iniciada.
`,
    expected: { actor: null, P: null, O: null, A: null, escape: 'INSUFFICIENT_EVIDENCE', noKnowledgePrecondition: true },
  },
  {
    id: 'WDL-VAR-10-NEGATED-ANALYSIS',
    narrative: `
5.5 Relato
O comandante PM e o copiloto PF tinham UNIT-B como primeiro destino. Coordenadas e autorização estavam corretas para UNIT-B.
A tripulação associou UNIT-A ao destino previsto e começou a preparar a aproximação para UNIT-A.
6.2 Análise
Visão de túnel – Não contribuiu
Falta de familiaridade – Não contribuiu
Treinamento insuficiente – Não contribuiu
Proximidade entre as unidades – Contribuiu
`,
    expected: { actor: /copiloto.*PF/i, P: 'P-G', O: 'O-A', A: 'A-A', escape: 'CANDIDATE', noKnowledgePrecondition: true },
  },
]

for (const item of cases) {
  const out = check(item.id, item.narrative, item.expected)
  console.log(item.id, out.escapePoint.status, out.directActor.actor, out.axes.perception.proposedCode, out.axes.objective.proposedCode, out.axes.action.proposedCode)
}

console.log('PASS ps-cdq family generalization', cases.length)
