import { classifyObjectiveByRules } from '../../frontend/src/lib/sera/rules/objective/select'

type ObjectiveCase = {
  name: string
  text: string
  expected: 'O-B' | 'O-C' | 'O-D' | null
  forbidden?: Array<'O-B' | 'O-C' | 'O-D'>
}

const cases: ObjectiveCase[] = [
  {
    name: 'protective medical motive alone does not establish O-C',
    text: 'Pouso fora do procedimento padrão por emergência médica.',
    expected: null,
    forbidden: ['O-B', 'O-C', 'O-D'],
  },
  {
    name: 'O-B tolerated intermediate check omission',
    text: 'Tripulação omite verificação intermediária porque a prática já era tolerada no setor.',
    expected: 'O-B',
  },
  {
    name: 'O-B workshop routine acceleration',
    text: 'Mecânico pula registro obrigatório porque todos na oficina faziam assim para acelerar a liberação.',
    expected: 'O-B',
  },
  {
    name: 'O-B habitual route altitude violation',
    text: 'Piloto viola altitude mínima em rota habitual para ganhar tempo.',
    expected: 'O-B',
  },
  {
    name: 'O-B checklist bureaucracy culture',
    text: 'Equipe ignora checklist considerado burocracia pela cultura informal da empresa.',
    expected: 'O-B',
  },
  {
    name: 'protective passenger medical motive alone does not establish O-C',
    text: 'Piloto pousa sem autorização porque passageiro apresentava suspeita de infarto.',
    expected: null,
    forbidden: ['O-B', 'O-C', 'O-D'],
  },
  {
    name: 'protective patient motive alone does not establish O-C',
    text: 'Comandante desvia do procedimento para evitar agravamento de paciente a bordo.',
    expected: null,
    forbidden: ['O-B', 'O-C', 'O-D'],
  },
  {
    name: 'protective immediate-risk motive alone does not establish O-C',
    text: 'Operador interrompe protocolo para proteger pessoa presa em área de risco imediato.',
    expected: null,
    forbidden: ['O-B', 'O-C', 'O-D'],
  },
  {
    name: 'medical care motive alone does not establish O-C',
    text: 'Tripulação prioriza atendimento médico de passageiro em emergência médica.',
    expected: null,
    forbidden: ['O-B', 'O-C', 'O-D'],
  },
  {
    name: 'O-C requires known rule awareness conscious deviation and non-routine evidence',
    text: 'Em decisão pontual e não rotineira, o comandante, ciente de que o procedimento conhecido proibia a continuidade, violou conscientemente a regra e continuou a operação para proteger passageiro em emergência médica.',
    expected: 'O-C',
  },
  {
    name: 'O-D efficiency objective is blocked by explicit formal violation',
    text: 'Em decisão pontual e não rotineira, o comandante, ciente de que o procedimento conhecido proibia a continuidade, violou conscientemente a regra e continuou para ganhar tempo.',
    expected: 'O-C',
    forbidden: ['O-D'],
  },
  {
    name: 'O-D remains blocked when a formal violation is explicit but O-C triad is incomplete',
    text: 'O procedimento conhecido foi descumprido para reduzir tempo de voo.',
    expected: null,
    forbidden: ['O-D'],
  },
  {
    name: 'O-D fuel saving short route',
    text: 'Capitão escolhe rota mais curta para economizar combustível.',
    expected: 'O-D',
  },
  {
    name: 'O-D fuel consumption reduction short route',
    text: 'Comandante escolhe rota mais curta para reduzir consumo de combustível.',
    expected: 'O-D',
  },
  {
    name: 'O-D connection window shortcut',
    text: 'Equipe adota atalho operacional para cumprir janela de conexão.',
    expected: 'O-D',
  },
  {
    name: 'O-D simplified procedure for connection window',
    text: 'Equipe simplifica procedimento para cumprir janela de conexão.',
    expected: 'O-D',
  },
  {
    name: 'O-D schedule time reduction',
    text: 'Piloto reduz tempo de voo para cumprir horário da escala.',
    expected: 'O-D',
  },
  {
    name: 'O-D productivity simplified procedure',
    text: 'Operação escolhe procedimento simplificado para aumentar produtividade.',
    expected: 'O-D',
  },
  {
    name: 'O-D faster method productivity',
    text: 'Supervisor escolhe método mais rápido para aumentar produtividade do turno.',
    expected: 'O-D',
  },
  {
    name: 'O-B ignored mandatory record todos faziam assim',
    text: 'Mecânico ignora registro obrigatório porque todos faziam assim para liberar mais rápido.',
    expected: 'O-B',
  },
  {
    name: 'O-B informal shortcut accepted normalization',
    text: 'Operador usa atalho aceito informalmente apesar de contrariar procedimento formal.',
    expected: 'O-B',
  },
  {
    name: 'O-B intermediate inspection tolerated sector',
    text: 'Equipe pula inspeção intermediária porque essa prática já era tolerada no setor.',
    expected: 'O-B',
  },
  {
    name: 'O-B pre-flight checklist bureaucracy quoted',
    text: "Equipe omite checklist de pre-voo por ser considerado 'burocracia' na empresa.",
    expected: 'O-B',
  },
  {
    name: 'O-D non-recommended route fuel savings',
    text: 'Capitão decide navegar por rota não recomendada para economizar combustível.',
    expected: 'O-D',
  },
  {
    name: 'O-D operational shortcut connection window bare',
    text: 'Atalho operacional para cumprir janela de conexão.',
    expected: 'O-D',
  },
  {
    name: 'negative readback congestion',
    text: 'Controlador não confirma readback sob frequência congestionada.',
    expected: null,
    forbidden: ['O-B', 'O-C', 'O-D'],
  },
  {
    name: 'negative knowledge deficit',
    text: 'Técnico não sabe diagnosticar falha em modelo novo.',
    expected: null,
    forbidden: ['O-B', 'O-C', 'O-D'],
  },
  {
    name: 'negative supervision failure',
    text: 'Supervisor não confirma execução de técnico antes de liberar trabalho.',
    expected: null,
    forbidden: ['O-B', 'O-C', 'O-D'],
  },
  {
    name: 'negative improvised tool under deadline pressure',
    text: 'Ferramenta improvisada sob pressão de prazo.',
    expected: null,
    forbidden: ['O-B', 'O-C', 'O-D'],
  },
  {
    name: 'negative onboard doctor dose unknown altitude protocol',
    text: 'Médico de bordo administra dose errada por desconhecer protocolo de altitude.',
    expected: null,
    forbidden: ['O-B', 'O-C', 'O-D'],
  },
]

let failed = false

for (const testCase of cases) {
  const actual = classifyObjectiveByRules(testCase.text).code
  const forbiddenHit = testCase.forbidden?.includes(actual as 'O-B' | 'O-C' | 'O-D') ?? false
  const passed = actual === testCase.expected && !forbiddenHit

  if (passed) {
    console.log(`PASS ${testCase.name} -> ${actual ?? 'null'}`)
    continue
  }

  failed = true
  console.error(`FAIL ${testCase.name}`)
  console.error(`  expected: ${testCase.expected ?? 'null'}`)
  console.error(`  actual: ${actual ?? 'null'}`)
  if (testCase.forbidden?.length) console.error(`  forbidden: [${testCase.forbidden.join(', ')}]`)
}

if (failed) process.exit(1)

console.log('PASS all static objective generalization cases')
