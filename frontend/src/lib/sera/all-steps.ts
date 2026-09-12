/**
 * ⚠ MOTOR LEGADO EM MANUTENÇÃO RESTRITA (auditoria HFA, 3ª etapa — 2026-07-10) ⚠
 * Ver docs/auditoria-hfa/terceira-etapa/04-congelamento-legado.md — mesmas restrições de
 * frontend/src/lib/sera/pipeline.ts: sem novas regras de classificação, sem nova fórmula de
 * ERC (tabela ERC do prompt de step6/7 abaixo é congelada), sem novos códigos hardcoded.
 *
 * Steps 1–6/7 do SERA — lógica espelhada do Python (sequencial: cada step depende dos anteriores;
 * steps 3/4/5 NÃO são independentes, contrariando paralelização ingênua).
 */
import { loadDocJson } from '@/lib/sera/docs'
import { NO_ARTIFACTS } from '@/lib/sera/prompts'
import { ask, askJson, safeParse } from '@/lib/sera/llm'
import { actionRules, objectiveRules, perceptionRules } from '@/lib/sera/rules'
import { classifyObjectiveByRules } from '@/lib/sera/rules/objective/select'
import type {
  RawFlowNode,
  Step1Result,
  Step2Result,
  Step67Result,
  StepFlowResult,
} from '@/lib/sera/types'

export function flowResult(codigo: string, nos: RawFlowNode[], descartadas: string): StepFlowResult {
  return { codigo, nos_percorridos: nos, falhas_descartadas: descartadas }
}

function normalizeYesNo(value: unknown): 'Sim' | 'Não' | null {
  const normalized = String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

  if (normalized === 'sim') return 'Sim'
  if (normalized === 'nao') return 'Não'
  return null
}

function assertAllowedCode<T extends string>(
  code: string,
  allowed: readonly T[],
  context: string
): T {
  if ((allowed as readonly string[]).includes(code)) return code as T
  throw new Error(
    `Violação metodológica em ${context}: código "${code}" fora do branch permitido ${JSON.stringify(allowed)}`
  )
}

function assertAllowedCodes(codigo: string, allowed: string[], node: string): void {
  if (!allowed.includes(codigo)) {
    throw new Error(
      `Violação metodológica no ${node}: código "${codigo}" fora do branch permitido ${JSON.stringify(allowed)}`
    )
  }
}

function normalizeEvidenceText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => text.includes(term))
}

function evidenceTerms(rule: { positive_evidence?: string[] } | undefined, fallback: string[]): string[] {
  return [...new Set([...(rule?.positive_evidence ?? []), ...fallback])]
}

function negativeEvidenceTerms(rule: { negative_evidence?: string[] } | undefined, fallback: string[]): string[] {
  return [...new Set([...(rule?.negative_evidence ?? []), ...fallback])]
}

function evidenceOfPhysicalIncapacity(text: string): boolean {
  const terms = evidenceTerms(actionRules['A-D'], [
    'incapacidade fisica',
    'limitacao fisica',
    'limitacao motora',
    'nao conseguiu executar fisicamente',
    'nao conseguiu aplicar torque',
    'nao conseguiu aplicar',
    'nao conseguiu fechar',
    'forca insuficiente',
    'preensao',
    'luvas',
    'epi',
    'equipamento de protecao',
    'equipamento de protecao individual',
    'ergonomia',
    'ergonomica',
    'alcance',
    'nao alcanca',
    'nao alcancou',
    'posicao obstruida',
    'obstruida pelo equipamento',
    'obstruido pelo equipamento',
    'equipamento impediu',
  ]).filter((term) => term.trim() !== 'torque')
  return containsAny(text, terms)
}

function evidenceOfExplicitHumanPhysicalLimitation(text: string): boolean {
  return containsAny(text, [
    'incapacidade fisica',
    'limitacao fisica',
    'limitacao motora',
    'nao conseguiu executar fisicamente',
    'nao conseguiu aplicar',
    'nao conseguiu fechar',
    'forca insuficiente',
    'preensao',
    'luvas',
    'epi',
    'equipamento de protecao',
    'ergonomia',
    'ergonomica',
    'alcance',
    'nao alcanca',
    'nao alcancou',
    'posicao obstruida',
    'obstruida pelo equipamento',
    'obstruido pelo equipamento',
  ])
}

function evidenceOfAircraftSystemBarrierDegradation(text: string): boolean {
  return containsAny(text, [
    'warning system did not generate an alert',
    'available warning system failed to alert',
    'nao gerou alerta',
    'sistema de alerta nao alertou',
    'sistema de alerta nao gerou alerta',
    'alerting system',
    'warning system',
    'egpws',
    'gpws',
    'flight instruments',
    'aircraft system',
    'automation degradation',
    'degradacao de automacao',
    'degradacao de sistema',
    'falha de sistema',
    'engine torque increased',
  ])
}

function isMaintainenceOrOrganizationalAgent(agente: string): boolean {
  if (!agente) return false
  const t = normalizeEvidenceText(agente)
  return containsAny(t, [
    'manutencao',
    'gestao de manutencao',
    'gerencia de manutencao',
    'responsavel de manutencao',
    'tecnico de manutencao',
    'mecanico',
    'organizacao',
    'gestao organizacional',
    'gerencia operacional',
    'despacho',
    'controle de aeronavegabilidade',
    'engenharia de manutencao',
    'grupo de manutencao',
    'empresa de manutencao',
    'operador de manutencao',
    'copterline',
    'maintenance',
    'management',
  ])
}

function isEscapePointOrganizationalAgent(agente: string): boolean {
  if (!agente) return false
  const t = normalizeEvidenceText(agente)
  return containsAny(t, [
    'manutencao',
    'gestao de manutencao',
    'gerencia de manutencao',
    'organizacao',
    'despacho',
    'despachante',
    'planejamento',
    'engenharia',
    'controle de aeronavegabilidade',
    'qualidade',
    'supervisor',
    'supervisao',
    'coordenador',
    'instrutor',
    'treinamento',
    'gestao',
    'gerencia',
    'management',
  ])
}

function evidenceOfBarrierOrRequirementContext(text: string): boolean {
  return containsAny(text, [
    'tarefa obrigatoria',
    'inspecao obrigatoria',
    'inspecao de retorno ao servico',
    'inspecao pos-manutencao',
    'teste obrigatorio',
    'requisito vencido',
    'qualificacao vencida',
    'treinamento recorrente vencido',
    'minimo operacional',
    'peso e balanceamento',
    'peso e balanceamento incorreto',
    'centro de gravidade',
    'liberacao sem verificacao',
    'aceite sem conferencia',
    'sem registro',
    'registro ausente',
    'sistema nao gerou tarefa',
    'nao gerou a tarefa',
    'helotrac',
    'due list',
    'controle de aeronavegabilidade',
    'auditoria',
    'pendencia de inspecao',
    'pendencia de teste',
    'requisito para instalacao',
    'briefing obrigatorio',
    'conteudo obrigatorio',
    'modulo de instrucao',
    'ordem de servico',
    'liberacao da aeronave',
    'tarefa delegada',
  ])
}

function evidenceOfVerificationTrackingFailure(text: string): boolean {
  return containsAny(text, [
    'nao verificou',
    'nao monitorou',
    'nao rastreou',
    'nao acompanhou',
    'nao confirmou',
    'nao conferiu',
    'sem verificar',
    'sem verificacao',
    'sem conferir',
    'nao realizou verificacao',
    'nao realizou a verificacao',
    'nao aplicou os fatores de correcao',
    'sem confirmacao de execucao',
    'sem verificar a execucao',
    'nao retornou para verificar',
    'nao retornou para confirmar',
    'liberou sem confirmar',
    'liberou sem verificar',
  ])
}

function evidenceOfOrganizationalRoleContext(text: string): boolean {
  return containsAny(text, [
    'gestao de manutencao',
    'supervisor de manutencao',
    'supervisor de treinamento',
    'supervisor',
    'supervisao',
    'coordenador',
    'despachante',
    'planejamento de carga',
    'planejador',
    'engenharia',
    'controle de aeronavegabilidade',
    'instrutor',
    'treinamento',
  ])
}

function evidenceOfMaintenanceOmissionContext(text: string): boolean {
  return containsAny(text, [
    'teste nao executado',
    'teste obrigatorio nao realizado',
    'teste de vazamento',
    'teste de vazamento interno',
    'manutencao programada nao executada',
    'tarefa nao gerada',
    'helotrac',
    'nao houve registro de execucao',
    'sem registro de execucao',
    'sem registro de deferimento',
    'nao houve deferimento documentado',
    'sem deferimento documentado',
    'controle de aeronavegabilidade',
    'vazamento interno nao detectado',
    'contaminacao hidraulica',
    'atuador permaneceu em servico',
    'permaneceu em servico sem',
    'ultrapassou limite de horas sem',
    'excedeu limite de horas sem',
    'atuador excedeu',
    'atuador ultrapassou',
    'sem inspecao obrigatoria',
    'inspecao obrigatoria nao realizada',
    'inspecao de manutencao nao realizada',
    'programa de manutencao',
    'nao realizou teste',
    'nao realizou a inspecao',
    'nao realizou inspecao',
    'nao realizou o teste',
    'tarefa de manutencao',
    'tarefa programada',
    'intervalo de manutencao',
    'horas sem inspecao',
    'horas sem teste',
    'horas voadas sem',
    'controle de manutencao',
    'cadastro inadequado',
    'cadastro de manutencao',
    'nao gerou a tarefa',
    'nao gerou corretamente',
    'software de manutencao',
    'sistema de manutencao',
    'nao verificou que o teste',
    'nao confirmou que o teste',
    'nao confirmou execucao do teste',
    'nao verificou execucao do teste',
    'inspecao de retorno ao servico',
    'retorno ao servico',
    'inspecao pos-manutencao',
    'pos manutencao',
    'pendencia de inspecao',
    'pendencia de teste',
    'nao gerou alerta',
    'ausencia de cadastro de requisito',
    'requisito para instalacao',
    'instalacao do cabo de controle',
    'roteamento incorreto',
    'cabo de controle',
  ])
}

function evidenceOfMaintenanceSystemContext(text: string): boolean {
  return containsAny(text, [
    'manutencao',
    'programa de manutencao',
    'sistema de manutencao',
    'controle de manutencao',
    'controle de aeronavegabilidade',
    'helotrac',
    'ordem de servico',
    'retorno ao servico',
    'inspecao pos-manutencao',
    'atuador',
    'cabo de controle',
    'motor',
    'horas voadas',
    'intervalo de manutencao',
  ])
}

// Detecta contexto dominante de engenharia/design/fabricante onde a decisao do agente
// e de projeto/boletim/aceitacao tecnica, nao tarefa de manutencao executavel em oficina.
// Usado como anti-gate para impedir que maintenanceOmission/supervisionFailure/
// organizationalMonitoringFailure disparem em narrativas onde a manutencao operacional
// nao e o mecanismo causal real.
function evidenceOfEngineeringDesignDominantContext(text: string): boolean {
  const hasEngineeringContext = containsAny(text, [
    'departamento de engenharia',
    'engenharia de produto',
    'engenharia do fabricante',
    'fabricante',
    'boletim de servico',
    'service bulletin',
    'design hazard',
    'analise de seguranca interna',
    'classificacao do boletim',
    'categoria do boletim',
    'classificou o boletim',
    'modo de falha catastrofico',
    'modo de falha foi classificado',
    'projeto do componente',
    'aceitacao de requisito',
  ])
  const hasExecutableMaintenanceTask = containsAny(text, [
    'ordem de servico',
    'tarefa de manutencao programada',
    'manutencao programada',
    'inspecao programada',
    'teste obrigatorio nao realizado',
    'controle de aeronavegabilidade',
    'helotrac',
    'oficina',
    'part 145',
    'retorno ao servico',
    'inspecao pos-manutencao',
    'inspecao obrigatoria nao realizada',
    'inspecao de retorno ao servico',
  ])
  return hasEngineeringContext && !hasExecutableMaintenanceTask
}

function evidenceOfPilotResponseToTechnicalFailure(text: string): boolean {
  const hasTechnicalFailure = containsAny(text, [
    'falha do atuador',
    'falha tecnica',
    'falha hidraulica',
    'falha mecanica',
    'extensao nao comandada',
    'extensao indesejada',
    'falha de componente',
    'atuador defeituoso',
    'componente com defeito',
    'falha estrutural',
    'falha do sistema hidraulico',
    'perda de controle por falha',
    'perda de autoridade de controle',
    'quebra de componente',
  ])
  const hasPilotResponse = containsAny(text, [
    'piloto nao conseguiu',
    'piloto nao conseguiu recuperar',
    'piloto nao pode recuperar',
    'piloto foi incapaz de recuperar',
    'tripulacao nao conseguiu',
    'incapaz de recuperar',
    'nao foi possivel recuperar',
    'nao houve tempo de recuperar',
    'piloto tentou recuperar',
    'tentou recuperar a aeronave',
    'resposta da tripulacao apos',
  ])
  return hasTechnicalFailure && hasPilotResponse
}

function evidenceOfKnowledgeDeficit(text: string): boolean {
  // Guarda: se o relato menciona experiência extensa do operador (milhares de horas, décadas),
  // não há déficit de conhecimento — a falha é de decisão/ação, não de saber operar.
  const hasExtensiveExperience = containsAny(text, [
    'horas de voo',
    'horas como comandante',
    'anos como piloto',
    'tempo como piloto',
    'tempo como comandante',
    'experiencia como piloto',
    'experiência como piloto',
    'piloto experiente',
    'comandante experiente',
    'alta experiencia',
    'alta experiência',
  ])

  if (hasExtensiveExperience) return false

  return containsAny(text, evidenceTerms(actionRules['A-E'], [
    'nao havia recebido treinamento',
    'sem treinamento',
    'falta de treinamento',
    'treinamento especifico',
    'type-specific',
    'protocolo desconhecido',
    'sistema novo',
    'modelo novo',
    'modelo recem-incorporado',
    'nao compreendeu',
    'desconhecia',
    'nao sabia interpretar',
    'nao sabia o significado',
    'falta de conhecimento',
    'falta de habilidade',
    'competencia tecnica insuficiente',
    'acoplado a modo anterior',
    'automacao permanecia acoplada',
  ]))
}

function evidenceOfSupervisionFailure(text: string): boolean {
  const hasSupervisorActor = containsAny(text, [
    'supervisor instruiu',
    'supervisor',
    'supervisao',
    'coordenador instruiu',
    'coordenador instrui',
    'coordenador delegou',
    'lider delegou',
    'comandante atribuiu',
    'coordenador atribuiu',
    'instruiu tecnico',
    'instruiu um tecnico',
    'instrui auxiliar',
    'instruiu auxiliar',
    'instruiu um auxiliar',
    'gestao de manutencao',
    'gestao de treinamento',
    'supervisor de treinamento',
    'supervisor de manutencao',
  ])
  const hasDelegatedAction = containsAny(text, [
    'delegou',
    'delegada',
    'delegacao',
    'acao delegada',
    'tarefa delegada',
    'delegou ao tecnico',
    'delegou para o tecnico',
    'delegou ao auxiliar',
    'delegou para o auxiliar',
    'delegou ao subordinado',
    'delegou para o subordinado',
    'instruiu tecnico',
    'instruiu o tecnico',
    'instruiu um tecnico',
    'instruiu auxiliar',
    'instruiu o auxiliar',
    'instruiu um auxiliar',
    'instruiu terceiro',
    'instruiu um terceiro',
    'atribuiu a tarefa',
    'pediu ao tecnico',
    'pediu ao auxiliar',
    'ordenou ao tecnico',
    'ordenou ao auxiliar',
    'encarregou o tecnico',
    'encarregou o auxiliar',
    'delegou a conducao',
    'delegou a verificacao',
    'delegou verificacao',
    'delegou ao co-instrutor',
    'delegou ao coinstrutor',
    'auxiliar a isolar',
    'tecnico a ajustar',
    'tecnico executaria',
    'auxiliar executaria',
  ])
  const hasThirdPartyConfirmationFailure = containsAny(text, [
    'nao retornou para verificar',
    'nao retornou para confirmar',
    'sem retornar ao local para confirmar',
    'nao acompanhou',
    'nao confirmou que o tecnico',
    'nao confirma a execucao',
    'nao confirmou a execucao',
    'nao confirmou execucao',
    'sem confirmacao de execucao',
    'nao aguardou retorno',
    'nao aguardou retorno positivo',
    'nao aguardou retorno do tecnico',
    'nao aguardou retorno do auxiliar',
    'nao aguardou confirmacao de execucao',
    'nao aguardou a confirmacao de execucao',
    'nao confirmou a execucao da acao de outro',
    'nao confirmou execucao da acao de outro',
    'nao verificou o resultado da acao de outro',
    'nao conferiu o resultado da acao de outro',
    'nao conferiu o indicador de isolamento',
    'nao conferiu indicador de isolamento',
    'liberar o trabalho',
    'liberou o trabalho',
    'liberou a equipe',
    'liberacao foi dada',
    'antes de confirmar',
    'antes de confirmar execucao',
    'antes de confirmar a execucao',
    'sem verificar a execucao',
    'nao verificou se a tarefa',
    'nao verificou o conteudo entregue',
    'nao verificou o conteudo obrigatorio',
    'nao verificou que a tarefa foi executada',
    'nao confirmou que a tarefa foi executada',
    'nao confirmou cobertura do conteudo',
  ])

  // A-G exige supervisor + ação delegada + falha explícita de verificar a execução do terceiro.
  // Briefing ambíguo sem falha de verificação de execução delegada não é A-G — é A-A (com P-H).
  return hasSupervisorActor && hasDelegatedAction && hasThirdPartyConfirmationFailure
}

// A-G por falha de verificação/cross-check da própria ação: protocolo formal de
// verificação esperado e disponível (FMA callout, cross-check pós-checklist) mas não executado.
// Distinto de A-C (checagem genérica) e A-B (omissão procedural pura).
function evidenceOfExplicitFeedbackCheckFailure(text: string): boolean {
  const formalCheckExpected = containsAny(text, [
    'confirmacao do modo ativo no fma',
    'modo ativo no fma',
    'callout ou confirmacao do modo',
    'verificacao adicional esperada e disponivel',
    'cross-check de indicacao',
    'verificacao adicional esperada',
  ])
  const checkNotPerformed = containsAny(text, [
    'nao realizou callout',
    'confirmacao nao foi efetivada',
  ])
  return formalCheckExpected && checkNotPerformed
}

function evidenceOfCommunicationConfirmationFailure(text: string): boolean {
  return evidenceOfCentralCommunicationFailure(text) || containsAny(text, [
    'nao confirma leitura',
    'nao confirma a leitura',
    'nao confirmou leitura',
    'nao confirmou a leitura',
    'leitura nao confirmada',
    'nao confirmou readback',
    'nao confirmou o readback',
    'readback nao confirmado',
    'readback incompleto',
    'nao aguardou readback',
    'nao aguardou o readback',
    'sem readback',
    'sem readback claro',
    'readback omitido',
    'read-back omitido',
    'nao houve readback',
    'confirmacao de leitura omitida',
    'confirmacao de recebimento omitida',
    'nao aguardou confirmacao',
    'nao aguardou a confirmacao',
    'nao aguardou confirmacao de recebimento',
    'sem aguardar confirmacao',
    'nao recebeu confirmacao',
    'nao obteve confirmacao',
    'confirmacao omitida',
    'confirmacao ou recebimento omitido',
    'sem confirmacao ou recebimento',
    'nao confirmou recebimento',
    'nao confirmou o recebimento',
    'recebimento omitido',
    'recebimento nao confirmado',
    'nao confirmou recepcao',
    'nao confirmou a recepcao',
    'nao recebeu confirmacao de recebimento',
    'sem confirmacao de recebimento',
    'transmitiu sem confirmar recepcao',
    'transmitiu sem confirmar recebimento',
    'transmitida sem confirmar recepcao',
    'transmitida sem confirmar recebimento',
    'mensagem operacional nao confirmada',
    'mensagem operacional sem confirmacao',
    'mensagem critica nao confirmada',
    'mensagem critica sem confirmacao',
    'mensagem sem confirmacao',
    'alteracao critica de rota',
    'transmitiu alteracao critica',
    'transmitiu alteracao critica de rota',
    'despachante transmitiu alteracao critica de rota',
    'despachante transmite alteracao critica de rota',
    'falha de coordenacao verbal',
    'falha de transmissao',
    'falha de recepcao',
    'nao aguardou resposta do piloto',
    'nao aguardou a resposta do piloto',
  ])
}

function evidenceOfCentralCommunicationFailure(text: string): boolean {
  const explicitConfirmationFailure = containsAny(text, [
    'nao confirma leitura',
    'nao confirma a leitura',
    'nao confirmou leitura',
    'nao confirmou a leitura',
    'nao confirma readback',
    'nao confirma o readback',
    'nao confirmou readback',
    'nao confirmou o readback',
    'sem confirmacao de recebimento',
    'readback ausente',
    'readback nao confirmado',
    'readback nao foi confirmado',
    'confirmacao omitida',
    'confirmacao de leitura omitida',
    'confirmacao de recebimento omitida',
    'recebimento nao confirmado',
    'acknowledgement ausente',
    'alteracao transmitida sem confirmacao',
    'alteracao critica sem confirmacao',
    'alteracao critica de rota sem confirmacao',
    'alteracao critica de rota nao confirmada',
    'instrucao nao confirmada',
    'instrucao operacional nao confirmada',
    'falha de confirmacao verbal',
    'mensagem operacional sem confirmacao',
    'mensagem critica sem confirmacao',
    'transmitiu sem confirmar recebimento',
    'transmitiu sem confirmar recepcao',
    'nao aguardou confirmacao',
    'nao aguardou a confirmacao',
  ])

  const communicationCongestionWithConfirmationGap = containsAny(text, [
    'frequencia congestionada',
    'congestionamento de frequencia',
    'canal operacional congestionado',
    'canal congestionado',
    'canal saturado',
    'radio congestionado',
  ]) && containsAny(text, [
    'readback',
    'confirmacao',
    'recebimento',
    'acknowledgement',
    'leitura',
    'instrucao',
    'mensagem',
    'alteracao critica',
  ])

  return explicitConfirmationFailure || communicationCongestionWithConfirmationGap
}

function evidenceOfOperationalCommunicationPressure(text: string): boolean {
  return evidenceOfCommunicationConfirmationFailure(text) && containsAny(text, [
    'frequencia congestionada',
    'congestionamento de frequencia',
    'congestionamento de radio',
    'radio congestionado',
    'canal operacional congestionado',
    'canal congestionado',
    'canal saturado',
    'canal estava saturado',
    'alteracao critica de rota',
    'mensagem operacional',
    'mensagem critica',
  ])
}

function evidenceOfSelectionError(text: string): boolean {
  return containsAny(text, evidenceTerms(actionRules['A-F'], [
    'selecionou o procedimento errado',
    'selecionou procedimento errado',
    'procedimento errado',
    'checklist errado',
    'opcao errada',
    'alternativa errada',
    'modo errado',
    'rota errada',
    'item adjacente',
    'item similar',
    'layout semelhante',
    'layout visual similar',
    'qrh',
    'procedimento visualmente similar',
    'confusao entre opcoes',
    'confundiu procedimentos',
  ]))
}

// Detecta ilusão ou distorção perceptiva fisiológica no relato (P-F).
// Usado em runStep3 (percepção) e como componente de evidenceOfPerceptualIllusionAction.
function evidenceOfPerceptualIllusion(text: string): boolean {
  return containsAny(text, [
    'ilusao de leans',
    'ilusao de voo nivelado',
    'horizonte falso',
    'ilusao visual de horizonte',
    'percepcao visual ilusoria',
    'ilusao vestibular',
    'desorientacao espacial',
    'canais semicirculares',
    'sensacao de estar nivelado',
    'sensacao corporal falsa',
    'percepcao falsa',
    'percepcao distorcida',
    'ilusao espacial',
    'asa inclinada por ilusao',
    'ilusao de inclinacao',
    'horizonte ilusorio',
    'distorcao sensorial',
  ])
}

// Detecta correção/manobra/ação errada causada por ilusão perceptiva fisiológica.
// Requer AMBOS: ilusão fisiológica E ação incorreta decorrente.
// Garante A-F antes de A-D e A-C em casos P-F.
function evidenceOfPerceptualIllusionAction(text: string): boolean {
  const hasIncorrectAction = containsAny(text, [
    'correcao errada',
    'correcao no sentido errado',
    'corrigiu no sentido errado',
    'aplicou aileron',
    'aplicou correcao',
    'manobra inadequada',
    'manobra errada',
    'nivelou com asa inclinada',
    'aileron direito',
    'aileron esquerdo',
    'correcao incorreta',
    'procedimento incorreto baseado em percepcao',
    'selecao incorreta por ilusao',
  ])
  return evidenceOfPerceptualIllusion(text) && hasIncorrectAction
}

function evidenceOfEfficiencyObjective(text: string): boolean {
  return containsAny(text, evidenceTerms(objectiveRules['O-D'], [
    'economizar combustivel',
    'economia de combustivel',
    'economizar tempo',
    'ganhar tempo',
    'reduzir tempo',
    'reduzir tempo de voo',
    'cumprir horario',
    'cumprir janela',
    'cumprir janela de conexao',
    'cumprir a janela de conexao',
    'janela de conexao',
    'horario de conexao',
    'perder janela',
    'perder conexao',
    'conexao dos passageiros',
    'reduzir custo',
    'eficiencia',
    'produtividade',
    'atalho operacional',
    'atalho operacional nao recomendado',
    'rota mais curta',
    'rota direta',
    'ganho operacional',
    'otimizacao operacional',
    'janela meteorologica apertada',
    'pressao comercial',
    'pressao operacional',
    'pressao de producao',
    'impacto comercial',
    'pontualidade',
    'manter a pontualidade',
    'cumprimento do horario',
    'cumprimento do horario publicado',
    'priorizou o cumprimento do horario',
    'priorizou cumprimento do horario',
    'para evitar cancelamento',
    'manter operacao',
    'manter a operacao',
    'continuidade do servico',
    'continuidade da operacao',
    'apesar do minimo',
    'apesar do requisito',
    'mesmo ciente',
    'aceitou liberar',
    'decidiu manter',
  ]))
}

function hasExplicitFormalObjectiveViolation(text: string): boolean {
  const rule = containsAny(text, ['regra', 'procedimento', 'protocolo', 'sop', 'norma', 'autorizacao exigida'])
  const deviation = containsAny(text, ['violo', 'violad', 'descumpr', 'nao cumpr', 'nao seguiu', 'ignor', 'desvi'])
  return rule && deviation
}

// Bloqueia P-G apenas quando eficiência é o mecanismo único, sem padrão de rotina/normalização.
// Casos O-B com "ganhar tempo" mas também com "rota habitual" / "altitude minima" não são O-D puro.
function isPureEfficiencyObjective(text: string): boolean {
  return evidenceOfEfficiencyObjective(text) && !evidenceOfRoutineOrNormalizedViolation(text) && !hasExplicitFormalObjectiveViolation(text)
}

function evidenceOfRoutineOrNormalizedViolation(text: string): boolean {
  return containsAny(text, [
    'rota habitual',
    'em rota habitual',
    'rota conhecida',
    'rota costumeira',
    'altitude minima',
    'violacao normalizada',
    'desvio normalizado',
    'pratica normalizada',
    'complacencia operacional',
    'complacencia institucional',
    'complacencia organizacional',
    'sempre fazemos',
    'sempre fazia',
    'sempre fazem',
    'culturalmente aceita',
    'aceita informalmente',
    'aceito informalmente',
    'atalho aceito informalmente',
    'todo mundo usa',
    'nunca ninguem foi cobrado',
    'desvio habitual',
    'violacao habitual',
    'violacao rotineira',
    'procedimento ignorado por rotina',
    'procedimento tratado como burocracia',
    'considerado burocracia',
    'era considerado burocracia',
    'formalidade dispensavel',
    'por habito',
    'pratica habitual',
    'pratica tolerada',
    'pratica aceita',
    'costume operacional',
    'rotina operacional',
    'monitoramento assumido como normal',
  ])
}

function evidenceOfRoutineViolation(text: string): boolean {
  return containsAny(text, [
    'rota habitual',
    'rota habitual para ganhar tempo',
    'em rota habitual',
    'rota conhecida',
    'rota costumeira',
    'habitual para ganhar tempo',
    'caminho habitual',
    'perfil habitual',
    'pratica habitual',
    'procedimento habitual',
    'pratica normalizada',
    'procedimento ignorado por rotina',
    'procedimento tratado como burocracia',
    'desvio habitual',
    'violacao habitual',
    'sempre fazemos assim',
    'sempre fazia assim',
    'sempre fazem assim',
    'considerado burocracia',
    'era considerado burocracia',
    'formalidade dispensavel',
    'culturalmente aceita',
    'aceita informalmente',
    'aceito informalmente',
    'atalho aceito informalmente',
    'todo mundo usa',
    'nunca ninguem foi cobrado',
    'desvio normalizado',
    'desvio era normalizado',
    'violacao normalizada',
    'cultura informal',
    'atalho habitual',
    'violacao rotineira',
    'rotina operacional',
    'por habito',
    'pratica tolerada',
    'pratica aceita',
    'costume operacional',
    'complacencia institucional',
    'complacencia organizacional',
    'complacencia operacional',
    'monitoramento assumido como normal',
    'assumido como normal por rotina',
    'normalizado',
    'rotineira',
  ])
}

function evidenceOfProtectiveObjective(text: string): boolean {
  return containsAny(text, evidenceTerms(objectiveRules['O-C'], [
    'emergencia medica',
    'agravamento medico',
    'proteger passageiro',
    'proteger paciente',
    'proteger pessoa',
    'passageiro doente',
    'condicao de passageiro doente',
    'paciente',
    'passageiro com emergencia medica',
    'salvar alguem',
    'evitar mal maior',
    'evitar piorar condicao',
    'evitar piorar a condicao',
    'evitar piora medica',
    'evitar agravamento',
    'evitar agravamento medico',
    'piorar condicao',
    'agravar condicao',
    'preservar paciente',
    'necessidade medica',
    'atendimento medico',
    'dano humano iminente',
  ]))
}

function evidenceOfMedicalProtectiveObjective(text: string): boolean {
  return containsAny(text, [
    'passageiro doente',
    'condicao de passageiro doente',
    'evitar piorar condicao',
    'evitar piorar a condicao',
    'piorar condicao de passageiro',
    'evitar agravamento',
    'agravamento do passageiro',
    'emergencia medica',
    'necessidade medica',
  ])
}

function evidenceOfHabitualViolationObjective(text: string): boolean {
  const habitualMarkers = containsAny(text, [
    'rota habitual',
    'em rota habitual',
    'rota conhecida',
    'rota costumeira',
    'por habito',
    'pratica habitual',
    'violacao rotineira',
    'desvio normalizado',
    'complacencia operacional',
  ])

  const altitudeHabitual = text.includes('altitude minima') && text.includes('rota habitual')
  const altitudeViolationForTimeGain =
    (text.includes('violou altitude minima') || text.includes('altitude minima violada')) &&
    text.includes('ganhar tempo')

  return habitualMarkers || altitudeHabitual || altitudeViolationForTimeGain
}

function normalizeForRuleMatch(text: string): string {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function forceObjectiveOverride(text: string): null | { code: 'O-B' | 'O-C' | 'O-D'; reason: string } {
  const t = normalizeForRuleMatch(text)
  const has = (token: string) => t.includes(token)

  const forceOB =
    has('rota habitual') ||
    (has('altitude minima') && has('rota')) ||
    (has('violou altitude minima') && has('ganhar tempo')) ||
    (has('altitude minima') &&
      has('ganhar tempo') &&
      (has('habitual') || has('rotina') || has('costumeira'))) ||
    has('violacao rotineira') ||
    has('desvio normalizado') ||
    has('pratica tolerada') ||
    has('pratica aceita') ||
    has('formalidade dispensavel') ||
    has('culturalmente aceita') ||
    has('aceita informalmente') ||
    has('aceito informalmente') ||
    has('todo mundo usa') ||
    has('nunca ninguem foi cobrado') ||
    has('atalho aceito informalmente')

  if (forceOB) {
    return {
      code: 'O-B',
      reason: 'override determinístico: violação rotineira/normalizada em contexto habitual, prevalece sobre eficiência',
    }
  }

  if (hasConsciousObjectiveDeviationEvidence(t)) {
    return {
      code: 'O-C',
      reason: 'override determinístico: desvio consciente, não rotineiro, de regra/procedimento conhecido; eventual motivo protetivo não substitui a evidência de awareness/desvio',
    }
  }

  if (evidenceOfEfficiencyObjective(t) && !evidenceOfRoutineOrNormalizedViolation(t) && !hasExplicitFormalObjectiveViolation(t)) {
    return {
      code: 'O-D',
      reason: 'override determinístico: objetivo explícito de eficiência/economia sem evidência de normalização rotineira',
    }
  }

  return null
}

function evidenceOfAttentionOverload(text: string): boolean {
  const hasExplicitHighDemand = evidenceOfExplicitHighDemandOperationalContext(text)

  if (evidenceOfPhysicalIncapacity(text) && !hasExplicitHighDemand) {
    return false
  }

  return hasExplicitHighDemand
}

function evidenceOfExplicitHighDemandOperationalContext(text: string): boolean {
  return containsAny(text, [
    'alta demanda',
    'sob alta demanda',
    'pico de trafego',
    'pico de carga',
    'durante pico de carga',
    'trafego intenso',
    'multiplas aeronaves',
    'multiplas aeronaves em conflito',
    'aeronaves em conflito',
    'multiplos conflitos',
    'multiplos conflitos simultaneos',
    'multiplos eventos simultaneos',
    'multiplas demandas',
    'multiplas demandas simultaneas',
    'alta carga de trabalho',
    'alta carga operacional',
    'alta demanda operacional',
    'sob carga operacional',
    'carga operacional',
    'sobrecarga atencional',
    'congestionamento operacional',
    'frequencia congestionada',
    'congestionamento de frequencia',
    'congestionamento de radio',
    'radio congestionado',
    'canal operacional congestionado',
    'canal congestionado',
    'canal saturado',
    'canal estava saturado',
    'conflito iminente',
    'conflitos potenciais',
    'pico operacional',
    'aeronaves simultaneas',
    'conflito de rota',
    'nao tive tempo de verificar',
    'solicitacoes de mudanca de rota',
  ])
}

function hasNegatedHighDemand(text: string): boolean {
  // Detects when high-demand tokens appear in a negation context ("nao havia ... alta demanda").
  // Prevents false P-D when fixture discriminators explicitly deny high demand.
  return text.includes('nao havia') && evidenceOfExplicitHighDemandOperationalContext(text)
}

// Padrões muito explícitos de falha de estimativa temporal — disparam P-E mesmo com alta demanda presente.
function evidenceOfVeryStrongTemporalPerceptionFailure(text: string): boolean {
  return containsAny(text, [
    'subestimando o tempo restante',
    'subestimou o tempo restante',
    'subestimacao do tempo restante',
    'subestimacao de tempo restante',
    'subestimou tempo necessario',
    'subestimar tempo necessario',
    'tempo restante',
    'antecipou o encerramento do checklist',
    'antecipou encerramento de checklist',
    'encerrou o checklist por subestimar',
    'nao conclui checklist por subestimar',
    'nao concluiu checklist por subestimar',
    'nao conclui checklist por subestimar tempo',
    'nao concluiu checklist por subestimar tempo',
    'checklist encerrado por subestimacao',
    'checklist nao concluido por tempo',
    'estimou que ainda havia tempo suficiente',
    'achou que haveria tempo suficiente',
    'acreditou que haveria tempo suficiente',
    'calculou que teria tempo suficiente',
    'duracao maior que o previsto',
    'estimativa incorreta de duracao',
    'chegou ao fim do tempo disponivel',
    'atingiu o limite de tempo disponivel',
  ])
}

function evidenceOfTemporalPerceptionFailure(text: string): boolean {
  return containsAny(text, [
    'subestimou tempo',
    'subestimou o tempo',
    'subestimando o tempo',
    'subestimou o tempo restante',
    'subestimando o tempo restante',
    'subestimacao do tempo restante',
    'subestimacao de tempo restante',
    'subestimou tempo necessario',
    'subestimar tempo necessario',
    'tempo restante',
    'tempo insuficiente',
    'antes da aproximacao',
    'antes do pouso',
    'encerrou checklist',
    'encerrou o checklist',
    'antecipou encerramento de checklist',
    'antecipou o encerramento do checklist',
    'interrompeu sequencia por tempo',
    'interrompeu a sequencia por tempo',
    'nao havia tempo suficiente',
    'nao ha tempo suficiente',
    'estimou mal o tempo restante',
    'janela temporal curta',
    'sequencia interrompida por tempo',
    'janela disponivel',
    'chegou ao fim do tempo disponivel',
    'achou que haveria tempo suficiente',
    'acreditou que haveria tempo suficiente',
    'duracao maior que o previsto',
    'estimativa incorreta de duracao',
    'nao conclui checklist por subestimar',
    'nao concluiu checklist por subestimar',
    'nao conclui checklist por subestimar tempo',
    'nao concluiu checklist por subestimar tempo',
    'checklist nao concluido por tempo',
  ])
}

function evidenceOfTemporalExecutionFailure(text: string): boolean {
  return containsAny(text, [
    'checklist interrompido',
    'interrompeu o checklist',
    'interrompeu a sequencia',
    'sequencia interrompida',
    'tarefa incompleta por tempo insuficiente',
    'incompleta por tempo insuficiente',
    'nao concluiu a sequencia',
    'nao completou checklist antes do pouso',
    'nao completou checklist antes da aproximacao',
    'nao completou o checklist antes do pouso',
    'nao completou o checklist antes da aproximacao',
    'gerenciamento temporal da execucao',
    'tempo insuficiente antes do pouso',
    'tempo insuficiente antes da aproximacao',
    'antes do pouso',
    'antes da aproximacao',
    'chegou ao fim do tempo disponivel',
    'antecipou o encerramento do checklist',
    'antecipou encerramento de checklist',
    'declarou a sequencia concluida',
    'declarou sequencia concluida',
    'pular os itens restantes',
    'subestimando o tempo restante',
    'subestimacao do tempo restante',
    'subestimacao de tempo restante',
    'tempo restante',
    'nao concluiu checklist por tempo',
    'nao conclui checklist por subestimar',
    'nao concluiu checklist por subestimar',
    'nao conclui checklist por subestimar tempo',
    'nao concluiu checklist por subestimar tempo',
    'checklist encerrado por subestimacao',
    'checklist nao concluido por tempo',
    'duracao maior que o previsto',
    'estimativa incorreta de duracao',
    'achou que haveria tempo suficiente',
    'acreditou que haveria tempo suficiente',
  ])
}

// Detecta falha de canal de informação recebida: briefing/instrução/identificação ambígua ou incompleta.
// Distingue P-H de P-A (supervisão) quando a falha dominante é na mensagem recebida, não na delegação.
function evidenceOfInformationChannelFailure(text: string): boolean {
  return containsAny(text, [
    'briefing ambiguo',
    'briefing ambíguo',
    'informacao ambigua',
    'informação ambígua',
    'instrucao ambigua',
    'instrução ambígua',
    'instrucao verbal ambigua',
    'identificacao ambigua',
    'identificacao abreviada',
    'nao havia ordem de servico escrita',
    'nao havia ordem escrita',
    'sem ordem de servico escrita',
    'forma nao-padronizada',
    'nao-padronizada nos paineis',
    'apresentada de forma nao-padronizada',
    'instrucao nao padronizada',
    'briefing incompleto',
    'comunicacao ambigua',
    'informacao incompleta',
    'informacao incompleta recebida',
    'instrucao incompleta recebida',
    'painel errado apos briefing ambiguo',
    'sistema errado por briefing ambiguo',
    'painel errado por briefing',
    'sistema errado por instrucao',
    'manutencao em sistema errado por briefing ambiguo',
    'manutencao em sistema errado por briefing',
    'manutencao no painel errado apos briefing ambiguo',
    'manutencao no painel errado apos briefing',
  ])
}

function evidenceOfTimePressure(text: string): boolean {
  return evidenceOfAttentionOverload(text) || evidenceOfTemporalPerceptionFailure(text) || containsAny(text, [
    'urgencia',
    'emergencia',
    'prazo critico',
    'menos de 60 segundos',
    'nao havia tempo',
  ])
}

// P-H por conflito não resolvido entre fontes de informação operacional independentes.
// Distinto de P-H por briefing ambíguo (evidenceOfInformationChannelFailure):
// aqui múltiplas fontes simultâneas estavam disponíveis mas não foram integradas antes da ação.
function evidenceOfConflictingOperationalInformation(text: string): boolean {
  const multiSourceConflict = containsAny(text, [
    'conflito entre fontes',
    'conflito radar versus visual',
    'fontes nao foram integradas',
    'radar versus visual',
    'radar meteorologico sugeria',
    'identificacao positiva por fontes independentes',
    'convergencia entre referencia visual',
    'confirmacao de radio e cross-check',
  ])
  const conflictUnresolved = containsAny(text, [
    'nao foi resolvido',
    'sem resolver o conflito',
    'nao foram integradas',
    'identificacao incompleta',
  ])
  return multiSourceConflict && conflictUnresolved
}

function evidenceOfSpeedManagementAttentionCapture(text: string): boolean {
  const speedBelowSafe = containsAny(text, [
    'velocidade continuou caindo',
    'velocidade foi reduzida em voo manual abaixo da faixa segura',
    'abaixo da faixa segura',
    'ias continuou caindo',
    'airspeed continued decreasing',
    'below safe range',
  ])
  const attentionCapturedOrProximity = containsAny(text, [
    'atencao da tripulacao estava capturada',
    'atencao capturada pela proximidade',
    'capturada pela proximidade da plataforma',
    'proximidade da plataforma',
    'necessidade de manter referencia visual',
    'sobrevoo de plataforma',
  ])
  return speedBelowSafe && attentionCapturedOrProximity
}

// Perception-anchored coherent action: the dominant failure mechanism is perceptual
// (monitoring gap P-G, information conflict P-H, or attention capture P-D) and the
// operator's action was natural continuation/proceeding coherent with that incorrect
// perception. When P already captures the causal failure, A-B would double-count the
// same monitoring/information gap as if it were an independent procedural step omission.
// Narrow guard for the 5 residual A-A vs A-B cases:
//   CHK-001, FUEL-002, VIS-003, VIS-004-ADJ, VIS-005.
// Requires BOTH perception-dominant markers AND coherent-action markers.
// Excludes cases with stronger A-code signals (A-G feedback check, A-H temporal, A-E
// knowledge deficit, A-F selection error, A-C own-action check, A-I selection under load,
// A-J communication, supervision, maintenance, physical incapacity, routine violation).
function evidenceOfPerceptionAnchoredCoherentAction(text: string): boolean {
  const perceptionDominant = containsAny(text, [
    'monitoramento periodico',
    'combustivel remanescente cruzou o minimo',
    'so foi reconhecida',
    'retornou ao painel de combustivel',
    'item critico pendente',
    'nao foi efetivamente completado',
    'sem esse item confirmado',
    'abaixo da altitude minima',
    'sem referencia visual',
    'identificacao incompleta',
    'conflito entre fontes',
    'conflito radar versus visual',
    'fontes nao foram integradas',
    'sem resolver o conflito',
    'conflito nao foi resolvido',
    'identificacao positiva por fontes independentes',
    'convergencia entre referencia visual',
    'radar meteorologico sugeria',
    'cortina de chuva',
  ])
  if (!perceptionDominant) return false

  const coherentAction = containsAny(text, [
    'prosseguiu como se',
    'aproximacao prosseguiu',
    'descida continuou',
    'manteve a proa',
    'prosseguir no vetor',
    'descida final foi iniciada',
    'iniciar descida final',
    'iniciada antes da identificacao',
    'prosseguiu com item',
    'so foi reconhecida',
  ])
  if (!coherentAction) return false

  const noPhysicalStepOmission = !containsAny(text, [
    'nao instalou',
    'nao travou',
    'nao inseriu',
    'nao recolocou',
    'pino de travamento',
    'trava fisica',
    'nao reinstalou',
    'reinstalar',
    'etapa obrigatoria',
    'esqueceu etapa',
  ])
  return noPhysicalStepOmission
}

function evidenceOfMonitoringFailure(text: string): boolean {
  return containsAny(text, [
    'nao verificou',
    'nao conferiu',
    'nao monitorou',
    'nao checou',
    'sem verificar',
    'sem conferir',
    'assumiu normalidade',
    'assumiu como normal',
    'assumiu que estava normal',
    'complacencia',
    'rota habitual',
    'em rota habitual',
    'altitude minima',
    'altitude minima violada',
    'altitude minima violada em rota habitual',
    'nao checou condicao disponivel',
    'nao checou a condicao disponivel',
    'condicao disponivel nao checada',
    'condicao disponivel nao verificada',
    'falha em verificar informacao disponivel',
    'informacao disponivel',
    'informacao disponivel nao verificada',
    'informacao disponivel nao checada',
    'monitoramento assumido como normal',
    'monitoramento assumido normal',
    'assumido normal',
    'nao verificou a condicao',
    'nao conferiu a condicao',
    'deveria ter sido verificada',
    'alarmes simultaneos',
    'sem checar',
    'sem monitorar',
    'nao monitorar adequadamente',
    'fadiga',
    // P-G for O-B routine-omission cases: inspection/verification/record omitted by complacency
    'inspecao intermediaria',
    'condicao a verificar estava acessivel',
    'registro de verificacao obrigatorio',
    'formalidade dispensavel',
    // P-G for parameter/checklist monitoring lapse (fuel, checklist state)
    'monitoramento periodico de combustivel',
    'combustivel remanescente cruzou o minimo',
    'retornou ao painel de combustivel',
    'checklist declarado e estado real',
    'alerta automatico sinalizou configuracao incorreta',
    'item critico pendente',
    // P-G for own-action-result available in panel but not monitored (A-C context)
    'sem aguardar a estabilizacao',
    'sem aguardar estabilizacao',
    'nao verificou se o indicador estabilizou',
    'nao confirmou estabilizacao',
    'indicador de status disponivel',
    'resultado disponivel no painel',
    'deveria ter monitorado o indicador',
    'nao verificou o resultado do reset',
    'retornou sem verificar o indicador',
    'sem realizar a verificacao',
    'assumindo que',
    'nao consultou',
  ])
}

// Captura falhas de monitoramento que são do próprio operador (não de terceiros).
// Exclui "nao monitorou" e "sem monitorar" que podem referir-se ao copiloto/terceiro.
// Usado para diferenciar P-G legítimo de casos onde só o terceiro não monitorou.
function evidenceOfOperatorOwnMonitoringFailure(text: string): boolean {
  return containsAny(text, [
    'nao verificou',
    'nao conferiu',
    'nao checou',
    'sem verificar',
    'sem conferir',
    'sem checar',
    'assumiu normalidade',
    'assumiu como normal',
    'assumiu que estava normal',
    'complacencia',
    'fadiga',
    'alarmes simultaneos',
    'rota habitual',
    'em rota habitual',
    'altitude minima',
    'altitude minima violada',
    'nao checou condicao disponivel',
    'nao checou a condicao disponivel',
    'condicao disponivel nao checada',
    'condicao disponivel nao verificada',
    'falha em verificar informacao disponivel',
    'informacao disponivel',
    'informacao disponivel nao verificada',
    'informacao disponivel nao checada',
    'monitoramento assumido como normal',
    'monitoramento assumido normal',
    'assumido normal',
    'nao verificou a condicao',
    'nao conferiu a condicao',
    'deveria ter sido verificada',
    'formalidade dispensavel',
    'sem aguardar a estabilizacao',
    'sem aguardar estabilizacao',
    'nao verificou se o indicador estabilizou',
    'nao confirmou estabilizacao',
    'indicador de status disponivel',
    'resultado disponivel no painel',
    'deveria ter monitorado o indicador',
    'nao verificou o resultado do reset',
    'retornou sem verificar o indicador',
    'inspecao intermediaria',
    'condicao a verificar estava acessivel',
    'registro de verificacao obrigatorio',
    'sem realizar a verificacao',
    'assumindo que',
    'nao consultou',
  ])
}

function evidenceOfWrongOperationalSelectionUnderLoad(text: string): boolean {
  if (
    !evidenceOfAttentionOverload(text) ||
    evidenceOfCommunicationConfirmationFailure(text) ||
    evidenceOfCentralCommunicationFailure(text)
  ) {
    return false
  }

  return containsAny(text, [
    'seleciona instrucao errada',
    'selecionou instrucao errada',
    'selecionou a instrucao errada',
    'instrucao de altitude errada',
    'instrucao de velocidade errada',
    'emitiu instrucao',
    'instrucao operacional errada',
    'valor incorreto',
    'transmitiu valor incorreto',
    'escolheu a velocidade',
    'velocidade destinada a outra aeronave',
    'climb',
    'descend',
    'deveria descer',
    'deveria ser',
    'escolheu instrucao operacional errada',
    'escolheu instrucao inadequada',
    'selecionou instrucao inadequada',
    'selecionou instrucao operacional errada',
    'instrucao operacional inadequada',
    'instrucao errada',
    'escolha inadequada',
    'selecao inadequada',
    'modo errado sob carga',
    'alternativa inadequada sob carga',
    'selecao da aeronave destinataria',
    'modo de operacao errado',
    'selecao incorreta entre alternativas',
  ])
}

function evidenceOfOwnActionCheckFailure(text: string): boolean {
  if (containsAny(text, evidenceTerms(actionRules['A-C'], [
    'nao verificou se',
    'nao verificou o indicador',
    'nao verificou o resultado',
    'nao verificar o resultado',
    'sem verificar o resultado',
    'nao conferiu resultado',
    'nao conferiu o resultado',
    'sem conferir o resultado',
    'sem olhar esse feedback',
    'sem olhar o feedback',
    'feedback final',
    'nao monitorou',
    'nao monitorou apos acionar',
    'nao confirmou o resultado',
    'nao confirmou resultado da propria acao',
    'resultado da propria acao',
    'propria acao recem-executada',
    'apos acionar',
    'depois de acionar',
    'apos acionar alavanca',
    'acionar alavanca',
    'indicador de trem',
    'trem de pouso',
    'trem de pouso recolheu',
    'verificar se o trem de pouso recolheu',
    'nao verificou se trem de pouso recolheu',
    'indicacao de recolhimento',
    'status do trem de pouso',
    'confirmacao de recolhimento',
    'condicao esperada',
  ]))) return true
  // supplementary: reset/stabilization result available but not verified
  if (containsAny(text, [
    'sem aguardar a estabilizacao',
    'sem aguardar estabilizacao',
    'nao aguardou estabilizacao',
    'nao verificou estabilizacao',
    'nao verificou se o indicador estabilizou',
    'nao confirmou estabilizacao',
    'executou reset e nao verificou',
    'nao verificou o resultado do reset',
    'retornou sem verificar o indicador',
    'retornou as atividades sem verificar',
    'nao verificou se recolheu',
    'nao confirmou se recolheu',
    'nao monitorou se recolheu',
  ])) return true
  // supplementary: industrial/operations — operator performed intervention and did not check
  // the resulting parameter available on panel/display (general A-C pattern for refineries,
  // manufacturing, utilities, offshore — not aviation-specific)
  return containsAny(text, [
    'nao conferiu o parametro',
    'nao verificou o parametro',
    'nao monitorou o parametro',
    'parametro disponivel nao verificado',
    'parametro disponivel nao conferido',
    'deveria ter sido monitorado apos',
    'deveria ter sido monitorada apos',
    'nao verificou o resultado da intervencao',
    'nao conferiu o resultado da intervencao',
    'resultado da intervencao nao verificado',
  ])
}

function evidenceOfProceduralOmission(text: string): boolean {
  const omissionTerms = evidenceTerms(actionRules['A-B'], [
    'nao instalou',
    'nao travou',
    'nao inseriu',
    'nao recolocou',
    'nao completou checklist',
    'omitiu passo',
    'passo obrigatorio',
    'pino de travamento',
    'trava fisica',
    'item obrigatorio',
    'check tecnico',
  ]).filter((term) => !['trava', 'procedimento', 'checklist'].includes(term))

  if (containsAny(text, omissionTerms)) return true
  // supplementary: physical/procedural step omission patterns not in A-B.json
  return containsAny(text, [
    'esqueceu etapa obrigatoria',
    'etapa obrigatoria omitida',
    'etapa foi simplesmente omitida',
    'etapa foi omitida',
    'nao reinstalou a trava',
    'reinstalar trava fisica',
    'trava fisica omitida',
    'reinstalacao da trava',
    'omissao de etapa procedural',
    'omissao de etapa fisica',
  ])
}

function evidenceOfAdministrativeRedundantNoOperationalImpact(text: string): boolean {
  const administrativeRedundantTerms = [
    'campo administrativo redundante',
    'campo redundante',
    'registro administrativo redundante',
    'documento redundante',
    'informacao duplicada',
    'informação duplicada',
  ]
  const administrativeDelayTerms = [
    'preenchido com atraso',
    'com atraso',
    'completado com atraso',
    'foi completado com atraso',
    'atraso documental',
  ]
  const noOperationalImpactTerms = [
    'sem impacto operacional',
    'sem relevancia operacional',
    'sem relevância operacional',
    'nao alimentava decisao tecnica',
    'nao alimentava decisao operacional',
    'nao alimentava decisao de seguranca',
    'sem afetar comunicacao',
    'sem afetar rastreabilidade critica',
    'sem afetar liberacao de equipamento',
    'sem afetar execucao',
  ]

  const hasRedundantAdmin = containsAny(text, administrativeRedundantTerms)
  const hasDelay = containsAny(text, administrativeDelayTerms)
  const hasNoOperationalImpact = containsAny(text, noOperationalImpactTerms)

  // A-A administrativo: discrepância documental redundante sem relevância operacional.
  return hasRedundantAdmin && (hasDelay || hasNoOperationalImpact)
}

function evidenceOfSecondaryNonCriticalRecordOmission(text: string): boolean {
  return containsAny(text, [
    'registro secundario',
    'registro secundário',
    'inspecao nao critica',
    'inspeção não crítica',
    'nao critico',
    'não crítico',
    'baixo impacto',
    'registro secundario de inspecao',
    'registro secundário de inspeção',
    'tarefa administrativa secundaria',
    'tarefa administrativa secundária',
    'omissao nao critica',
    'omissão não crítica',
  ])
}

function evidenceOfObjectiveCForbiddenContext(text: string): boolean {
  return containsAny(text, negativeEvidenceTerms(objectiveRules['O-C'], [
    'checklist',
    'aproximacao',
    'pouso',
    'tempo insuficiente',
    'readback',
    'confirmacao',
    'frequencia',
    'radio',
    'atc',
    'comunicacao operacional',
    'coordenacao verbal',
    'coordenacao operacional',
    'combustivel',
    'eficiencia',
    'reduzir tempo',
    'reduzir tempo de voo',
    'cumprir horario',
    'cumprir janela',
    'cumprir janela de conexao',
    'janela de conexao',
    'horario de conexao',
    'perder conexao',
    'rota mais curta',
    'atalho operacional',
  ]))
}

// Gate pós-LLM para Step 4: O-C exige todos os elementos canônicos: regra/procedimento
// conhecido, awareness, decisão consciente de desviar e caráter não rotineiro. Pressão,
// emergência ou finalidade protetiva nunca substituem essa prova cumulativa.
function hasConsciousObjectiveDeviationEvidence(text: string): boolean {
  const knownRule = containsAny(text, [
    'sabia que era contra',
    'sabia que era proibido',
    'sabia que nao devia',
    'sabia que precisava de autorizacao',
    'ciente da proibicao',
    'ciente de que era contra',
    'regra conhecida',
    'procedimento conhecido',
    'procedimento exigia',
    'regra exigia',
  ])
  const awareness = containsAny(text, [
    'ciente de que',
    'consciente de que',
    'sabia que',
    'tinha consciencia',
    'tinha conhecimento',
  ])
  const consciousDeviation = containsAny(text, [
    'decidiu descumprir',
    'decidiu nao cumprir',
    'decidiu nao seguir o procedimento',
    'decidiu nao seguir o protocolo',
    'decidiu omitir o',
    'optou por descumprir',
    'optou por nao seguir o procedimento',
    'optou por nao seguir o protocolo',
    'optou por nao cumprir',
    'optou por ignorar o procedimento',
    'optou por ignorar o protocolo',
    'escolheu fazer diferente do procedimento',
    'escolheu nao seguir o procedimento',
    // Composto: conhecia + decidiu
    'conhecia o procedimento e decid',
    'conhecia a norma e decid',
    'conhecia a regra e decid',
    // Violação com advérbio de intencionalidade (composto seguro)
    'violou conscientemente',
    'descumpriu conscientemente',
    'descumpriu deliberadamente',
    'omitiu deliberadamente',
    'ignorou deliberadamente',
    // Padrões O-C específicos de alta precisão
    'fez uma excecao conscientemente',
    'adotou atalho fora do procedimento',
    'nao realizou sobrevoo obrigatorio',
  ])
  const nonRoutine = containsAny(text, [
    'violacao excepcional',
    'violacao isolada',
    'desvio excepcional',
    'desvio isolado',
    'decisao pontual',
    'caso isolado',
    'nao era rotineiro',
    'nao era habitual',
    'nao rotineir',
    'nao habitual',
    'fora do habitual',
    'fora da rotina',
  ])
  return knownRule && awareness && consciousDeviation && nonRoutine
}

function evidenceOfKnownLimitDeviationContinuation(text: string): boolean {
  const hasLimitDeviation = containsAny(text, [
    'limites minimos',
    'limites de visibilidade',
    'limites de teto',
    'minimos de teto e visibilidade',
    'ultrapassou os limites',
    'limites haviam sido ultrapassados',
    'abaixo da altitude minima',
    'abaixo da mda',
    'violacao de altitude minima',
  ])
  if (!hasLimitDeviation) return false

  return containsAny(text, [
    'ciente de que',
    'consciencia explicita',
    'sabendo que',
    'mesmo assim',
    'ainda assim',
    'prosseguiu aproximacao',
    'aproximacao continuou',
    'continuou a aproximacao',
    'descida continuou',
  ])
}

function evidenceOfSensoryBarrier(text: string): boolean {
  return containsAny(text, [
    'alarme sonoro',
    'protetores auriculares',
    'ambiente ruidoso',
    'brilho intenso',
    'reflexo intenso',
    'encoberto por reflexo',
    'barreira sensorial',
    'nao detectou alarme',
    'nao ouviu',
    'nao ter ouvido nada',
    'nao percebeu o alarme',
    'nao conseguiu detectar',
    'sinal bloqueado',
    'obstruido pelo reflexo',
  ])
}

function evidenceOfInterpretiveKnowledgeDeficit(text: string): boolean {
  return containsAny(text, [
    'piloto novato',
    'aeronave desconhecida',
    'tipo de aeronave desconhecido',
    'tipo desconhecido',
    'interpretou erroneamente leitura',
    'interpreta erroneamente leitura',
    'leitura de altimetro',
    'altimetro barometrico',
    'confundiu a escala',
    'nunca havia operado esse modelo',
    'falta de familiaridade',
    'desconhecimento do tipo de aeronave',
    'interpretacao incorreta por falta de familiaridade',
  ])
}

function inferDeterministicErcLevel(
  text: string,
  perceptionCode: string,
  objectiveCode: string,
  actionCode: string,
  current?: number
): number | undefined {
  if (actionCode === 'A-A' && evidenceOfAdministrativeRedundantNoOperationalImpact(text)) return 5
  if (actionCode === 'A-B' && evidenceOfSecondaryNonCriticalRecordOmission(text)) return 4
  if (objectiveCode === 'O-B' && actionCode === 'A-A') return 1
  if (objectiveCode === 'O-C' && actionCode === 'A-A') return 2
  if (actionCode === 'A-H' && perceptionCode === 'P-E') return 2
  if (perceptionCode === 'P-H' && actionCode === 'A-A') return 3
  if (perceptionCode === 'P-B' && actionCode === 'A-A') return 3
  if (perceptionCode === 'P-C' && actionCode === 'A-A') return 3
  if (perceptionCode === 'P-D' && actionCode === 'A-A') return 3
  if (actionCode === 'A-I' && perceptionCode === 'P-D') return 1
  if (actionCode === 'A-J' && perceptionCode === 'P-D') return 1
  if (
    actionCode === 'A-G' &&
    evidenceOfMaintenanceSystemContext(text) &&
    evidenceOfMaintenanceOmissionContext(text) &&
    !evidenceOfSupervisionFailure(text)
  ) return 1
  if (actionCode === 'A-G') return 3
  if (actionCode === 'A-B') return 3
  if (actionCode === 'A-J' && evidenceOfCommunicationConfirmationFailure(text)) return 1
  if (actionCode === 'A-C') return 2
  if (actionCode === 'A-F' && perceptionCode === 'P-F') return 2
  if (actionCode === 'A-F' && containsAny(text, ['emergencia', 'qrh', 'procedimento de emergencia'])) return 2
  if (objectiveCode === 'O-D' && evidenceOfEfficiencyObjective(text)) return 2
  if (actionCode === 'A-E' && evidenceOfKnowledgeDeficit(text)) return 2
  if (actionCode === 'A-D' && evidenceOfPhysicalIncapacity(text)) return 3
  if (perceptionCode === 'P-D' && evidenceOfTimePressure(text)) return Math.min(current ?? 2, 2)
  return current
}

function methodologyNode(justificativa: string, extra?: Record<string, unknown>): RawFlowNode {
  return { justificativa, ...extra }
}

function logMethodology(
  step: string,
  node: string,
  result: RawFlowNode,
  allowedCodes: readonly string[],
  terminal: boolean
): void {
  console.log({ step, node, result, allowedCodes, terminal })
}

export async function runStep1(relato: string): Promise<Step1Result> {
  const system = `CRITICAL RULES:
- Você DEVE responder em português do Brasil. TODOS os valores dos campos DEVEM estar em português. NUNCA use inglês.
- Return ONLY valid JSON. No text, markdown, or explanation outside the JSON.
- NEVER invent data. If a field is not present in the report, return null for that field.
- NEVER reproduce the original report verbatim. Write a new narrative.
- If the report has fewer than 30 words, return {"error": "relato insuficiente"}.

OUTPUT FORMAT (strict):
{
  "summary": "string: narrativa objetiva 60-80 palavras EM PORTUGUÊS",
  "event_date": "string or null",
  "event_location": "string or null",
  "operation_type": "string or null",
  "occupants_count": "string or null",
  "flight_phase": "string or null",
  "weather_conditions": "string or null",
  "systems_involved": "string or null"
}

Você é um analista SERA. Analise o relato e extraia informações estritamente factuais.
${loadDocJson('Template.json', 1500)}

REGRAS OBRIGATÓRIAS:
1. NÃO reproduza trechos literais do relato — sintetize com suas próprias palavras
2. O campo "summary" deve incluir: tipo de aeronave, fase do voo, condições meteorológicas, local aproximado, envolvidos e o que aconteceu
3. Para campos estruturados: extrai APENAS o que está explícito no relato — null se não mencionado
4. summary: mínimo 60, máximo 80 palavras, linguagem objetiva e técnica
5. O summary DEVE estar em português do Brasil, não em inglês.`

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await ask(system, `Relato: ${relato}\n\nResponda APENAS com JSON.`, { maxTokens: 4000 })
      return safeParse(r, 'Etapa 1') as Step1Result
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt === 2) throw lastError
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
  throw lastError!
}

export async function runStep2(relato: string): Promise<Step2Result> {
  const system = `CRITICAL RULES:
- Responda SEMPRE em português do Brasil.
- Return ONLY valid JSON. No text outside the JSON block.
- NEVER infer motivations or causes — describe only observable actions.
- NEVER identify more than ONE departure point. Pick the most critical moment after which there was no return to safety.
- NEVER use the words "porque", "pois", "visto que" in the unsafe_act field. The unsafe_act must describe WHAT happened, not WHY.
- If the report is insufficient, return {"error": "dados insuficientes para identificar ponto de fuga"}.

OUTPUT FORMAT (strict):
{
  "agente": "quem realizou o ato inseguro",
  "ato_inseguro_factual": "descrição observável do ato inseguro, verbo no passado",
  "momento": "quando ocorreu na sequência do evento",
  "justificativa": "por que este é o ponto de fuga, baseado no relato"
}

Você é um especialista SERA. Siga RIGOROSAMENTE as regras do Point.json.
${loadDocJson('Point.json')}

REGRAS ABSOLUTAS para o campo ato_inseguro_factual:
1. Use APENAS verbos de ação observável: puxou, acionou, não desacoplou, repetiu
2. PROIBIDO usar: incorreta, inadequada, errônea, sem saber, por engano, não planejada
3. PROIBIDO inferir motivações, causas ou intenções
4. PROIBIDO mencionar fatores latentes (arrogância, falta de conhecimento, etc.)`

  let lastError: Error | null = null
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await ask(
        system,
        `Relato: ${relato}

Responda APENAS com JSON.
Se faltar contexto causal, ainda assim identifique o ato inseguro factual mais observável no relato (não retorne "dados insuficientes" se houver qualquer ação observável).`
      )
      const parsed = safeParse(r, 'Etapa 2') as Step2Result
      if (!String(parsed.ato_inseguro_factual || '').trim()) {
        throw new Error('Etapa 2 inválida: ato_inseguro_factual vazio')
      }
      return parsed
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt === 2) throw lastError
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)))
    }
  }
  throw lastError!
}

export async function runStep3(relato: string, pontoFuga: Step2Result): Promise<StepFlowResult> {
  const system = `CRITICAL RULES:
- Responda SEMPRE em português do Brasil.
- Return ONLY valid JSON. No text outside the JSON block.
- Answer only the local question asked in the user prompt.
- Do not choose SERA codes unless the prompt explicitly provides the local terminal alternatives.
- The TypeScript controller decides the flow and the final code.
- If evidence is insufficient for the local question, answer "Não" and explain "DADO INSUFICIENTE".`

  const ato = String(pontoFuga.ato_inseguro_factual || '')
  const nodes: RawFlowNode[] = []
  const relatoNorm = normalizeEvidenceText(`${relato}\n${ato}`)
  const relatoOnlyForAntiGates = normalizeEvidenceText(relato)
  const organizationalEscapePoint =
    isEscapePointOrganizationalAgent(String(pontoFuga.agente || '')) ||
    evidenceOfOrganizationalRoleContext(relatoNorm)
  const engineeringDesignDominant = evidenceOfEngineeringDesignDominantContext(relatoOnlyForAntiGates)
  const organizationalMonitoringFailure =
    organizationalEscapePoint &&
    evidenceOfBarrierOrRequirementContext(relatoOnlyForAntiGates) &&
    evidenceOfVerificationTrackingFailure(relatoNorm) &&
    !engineeringDesignDominant
  const genuineHighDemand = evidenceOfExplicitHighDemandOperationalContext(relatoNorm) && !hasNegatedHighDemand(relatoNorm)

  if (evidenceOfKnowledgeDeficit(relatoNorm)) {
    const no0 = methodologyNode('Gate determinístico: o relato traz déficit explícito de conhecimento/interpretação.', { resposta: 'Sim' })
    const no1 = methodologyNode('Gate determinístico: sem evidência de barreira sensorial física.', { resposta: 'Sim' })
    const no2 = methodologyNode('Gate determinístico: falta de conhecimento para interpretar sinal/procedimento.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-C 0', no0, ['P-A', 'P-C'], false)
    logMethodology('runStep3', 'Gate P-C 1', no1, ['P-B'], false)
    logMethodology('runStep3', 'Gate P-C 2', no2, ['P-C'], true)
    const code = assertAllowedCode('P-C', ['P-C'], 'runStep3 gate conhecimento')
    return flowResult(code, [no0, no1, no2], 'P-A, P-B, P-D, P-E, P-F, P-G, P-H descartadas — déficit explícito de conhecimento/interpretação')
  }

  if (evidenceOfInterpretiveKnowledgeDeficit(relatoNorm)) {
    const no0 = methodologyNode('Gate determinístico: o relato traz déficit interpretativo — operador não tinha familiaridade ou conhecimento para interpretar corretamente o instrumento/tipo de aeronave.', { resposta: 'Sim' })
    const no1 = methodologyNode('Gate determinístico: falha ocorreu na interpretação de leitura/instrumento, não em barreira sensorial física.', { resposta: 'Sim' })
    const no2 = methodologyNode('Gate determinístico: interpretação incorreta por falta de familiaridade com o tipo/modelo.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-C interpretativo 0', no0, ['P-A', 'P-C'], false)
    logMethodology('runStep3', 'Gate P-C interpretativo 1', no1, ['P-B'], false)
    logMethodology('runStep3', 'Gate P-C interpretativo 2', no2, ['P-C'], true)
    const code = assertAllowedCode('P-C', ['P-C'], 'runStep3 gate interpretativo')
    return flowResult(code, [no0, no1, no2], 'P-A, P-B, P-D, P-E, P-F, P-G, P-H descartadas — déficit interpretativo: falta de familiaridade com tipo/modelo/instrumento')
  }

  // Gate P-B (barreira sensorial): sinal estava presente e disponível, mas barreira física/ambiental
  // impediu sua detecção. Dispara antes dos gates de informação/temporal para proteger P-B.
  if (evidenceOfSensoryBarrier(relatoNorm)) {
    const no0 = methodologyNode('Gate determinístico: houve falha perceptiva explícita — o operador não detectou o sinal presente.', { resposta: 'Sim' })
    const no1 = methodologyNode('Gate determinístico: barreira sensorial física/ambiental (ruído, brilho intenso, reflexo) impediu a detecção do sinal.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-B sensorial 0', no0, ['P-A', 'P-C'], false)
    logMethodology('runStep3', 'Gate P-B sensorial 1', no1, ['P-B'], true)
    const code = assertAllowedCode('P-B', ['P-B'], 'runStep3 gate barreira sensorial')
    return flowResult(code, [no0, no1], 'P-A, P-C, P-D, P-E, P-F, P-G, P-H descartadas — barreira sensorial física/ambiental impediu a detecção do sinal presente')
  }

  if (organizationalMonitoringFailure) {
    const node = methodologyNode(
      'Gate deterministico: agente organizacional/supervisao com requisito/barreira explicita e falha de verificacao/monitoramento/rastreio.',
      { resposta: 'Nao' }
    )
    logMethodology('runStep3', 'Gate P-G organizacional', node, ['P-G'], true)
    const code = assertAllowedCode('P-G', ['P-G'], 'runStep3 gate monitoramento organizacional')
    return flowResult(
      code,
      [node],
      'P-A, P-B, P-C, P-D, P-E, P-F, P-H descartadas — falha de monitoramento organizacional de requisito/barreira'
    )
  }

  if (evidenceOfPhysicalIncapacity(relatoNorm)) {
    const node = methodologyNode('Gate determinístico: mecanismo dominante é incapacidade física/ergonômica de execução, sem falha perceptiva independente.', { resposta: 'Não' })
    logMethodology('runStep3', 'Gate P-A anti P-D físico', node, ['P-A'], true)
    const code = assertAllowedCode('P-A', ['P-A'], 'runStep3 gate físico sem percepção')
    return flowResult(code, [node], 'P-B, P-C, P-D, P-E, P-F, P-G, P-H descartadas — A-D não implica falha perceptiva independente')
  }

  // Gate P-H prioritário: falha dominante de briefing/informação/instrução recebida.
  // Deve preceder P-A e demais fallbacks para não perder casos de ambiguidade de informação.
  if (evidenceOfInformationChannelFailure(relatoNorm) && !evidenceOfSupervisionFailure(relatoNorm)) {
    const node = methodologyNode('Gate determinístico: falha de canal de informação/instrução recebida — briefing, instrução ou identificação ambígua/incompleta sem falha de supervisão independente.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-H', node, ['P-H'], true)
    const code = assertAllowedCode('P-H', ['P-H'], 'runStep3 gate informação ambígua')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-D, P-E, P-F, P-G descartadas — falha dominante de informação/comunicação recebida')
  }

  // Gate P-E forte: subestimação temporal muito explícita — dispara ANTES do check de alta demanda.
  // Cobre casos onde "alta carga de trabalho" aparece como consequência da falha, não como causa.
  if (evidenceOfVeryStrongTemporalPerceptionFailure(relatoNorm)) {
    const node = methodologyNode('Gate determinístico forte: subestimação de tempo, duração ou sequência temporal explicitamente identificada no relato — P-E terminal independente de contexto de carga.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-E forte', node, ['P-E'], true)
    const code = assertAllowedCode('P-E', ['P-E'], 'runStep3 gate temporal forte')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-D, P-F, P-G, P-H descartadas — falha temporal muito explícita; supera contexto de carga operacional')
  }

  if (evidenceOfTemporalPerceptionFailure(relatoNorm) && !genuineHighDemand) {
    const node = methodologyNode('Gate determinístico: erro de estimativa temporal, janela curta ou sequência interrompida por tempo insuficiente.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-E', node, ['P-E'], true)
    const code = assertAllowedCode('P-E', ['P-E'], 'runStep3 gate temporal')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-D, P-F, P-G, P-H descartadas — falha temporal explícita')
  }

  if (evidenceOfSpeedManagementAttentionCapture(relatoNorm)) {
    const node = methodologyNode('Gate determinístico: velocidade continuou degradando abaixo da faixa segura enquanto atenção da tripulação estava capturada por tarefa de proximidade operacional.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-D (atenção capturada/velocidade)', node, ['P-D'], true)
    const code = assertAllowedCode('P-D', ['P-D'], 'runStep3 gate atenção capturada velocidade')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-E, P-F, P-G, P-H descartadas — atenção capturada por tarefa de proximidade operacional enquanto parâmetro crítico se degradava')
  }

  // Gate P-H por conflito de fontes: múltiplas fontes operacionais disponíveis não integradas.
  // Deve preceder P-G preemptivo para interceptar casos onde monitoring terms disparam erroneamente.
  if (evidenceOfConflictingOperationalInformation(relatoNorm)) {
    const node = methodologyNode('Gate determinístico: conflito não resolvido entre fontes de informação operacional disponíveis — múltiplas fontes independentes (radar/visual/GPS/FMS/rádio) não integradas antes da decisão.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-H (conflito de fontes)', node, ['P-H'], true)
    const code = assertAllowedCode('P-H', ['P-H'], 'runStep3 gate conflito fontes operacionais')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-D, P-E, P-F, P-G descartadas — conflito de informação operacional não resolvido entre fontes disponíveis')
  }

  // P-G preemptivo: informação disponível não monitorada; dispara antes de P-D quando não há demanda genuína.
  // Bloqueado quando mecanismo dominante é seleção errada por similaridade sem falha de monitoramento
  // do próprio operador (ex: "nao monitorou" do copiloto não constitui P-G do piloto).
  // Bloqueado também quando há objetivo de eficiência/economia (O-D): decisão deliberada de rota/procedimento
  // não recomendado para economizar combustível/tempo não constitui falha de monitoramento (P-A).
  if (evidenceOfMonitoringFailure(relatoNorm) && !genuineHighDemand && !isPureEfficiencyObjective(relatoNorm)) {
    const selectionOnlyNoOwnMonitoring = evidenceOfSelectionError(relatoNorm) && !evidenceOfOperatorOwnMonitoringFailure(relatoNorm)
    if (!selectionOnlyNoOwnMonitoring) {
      const node = methodologyNode('Gate determinístico: parâmetro/informação disponível no painel e não conferido; ausência de demanda real confirma P-G.', { resposta: 'Não' })
      logMethodology('runStep3', 'Gate P-G preemptivo', node, ['P-G'], true)
      const code = assertAllowedCode('P-G', ['P-G'], 'runStep3 gate monitoramento preemptivo')
      return flowResult(code, [node], 'P-A, P-B, P-C, P-D, P-E, P-F, P-H descartadas — informação disponível não monitorada sem demanda operacional real')
    }
  }

  // P-E preemptivo: falha temporal pura sem demanda real; dispara antes de P-D.
  if ((evidenceOfTemporalExecutionFailure(relatoNorm) || evidenceOfTemporalPerceptionFailure(relatoNorm)) && !genuineHighDemand) {
    const node = methodologyNode('Gate determinístico: checklist/sequência interrompida por tempo insuficiente sem demanda operacional real.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-E preemptivo', node, ['P-E'], true)
    const code = assertAllowedCode('P-E', ['P-E'], 'runStep3 gate temporal preemptivo')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-D, P-F, P-G, P-H descartadas — falha temporal pura; demanda real ausente ou negada no relato')
  }

  if (evidenceOfOperationalCommunicationPressure(relatoNorm)) {
    const node = methodologyNode('Gate determinístico: comunicação/confirmação em canal operacional sob pressão temporal explícita.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-D', node, ['P-D'], true)
    const code = assertAllowedCode('P-D', ['P-D'], 'runStep3 gate pressão/comunicação')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-E, P-F, P-G, P-H descartadas — alta demanda/pressão temporal explícita afetou a percepção operacional')
  }

  if (evidenceOfAttentionOverload(relatoNorm)) {
    const node = methodologyNode('Gate determinístico: alta demanda, múltiplos conflitos, tráfego intenso ou canal operacional congestionado afetou a atenção.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-D', node, ['P-D'], true)
    const code = assertAllowedCode('P-D', ['P-D'], 'runStep3 gate alta demanda')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-E, P-F, P-G, P-H descartadas — sobrecarga atencional explícita')
  }

  if (evidenceOfTemporalPerceptionFailure(relatoNorm)) {
    const node = methodologyNode('Gate determinístico: erro de estimativa temporal, janela curta ou sequência interrompida por tempo insuficiente.', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-E', node, ['P-E'], true)
    const code = assertAllowedCode('P-E', ['P-E'], 'runStep3 gate temporal')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-D, P-F, P-G, P-H descartadas — falha temporal explícita')
  }

  if (evidenceOfMonitoringFailure(relatoNorm) && !isPureEfficiencyObjective(relatoNorm)) {
    const selectionOnlyNoOwnMonitoring = evidenceOfSelectionError(relatoNorm) && !evidenceOfOperatorOwnMonitoringFailure(relatoNorm)
    if (!selectionOnlyNoOwnMonitoring) {
      const node = methodologyNode('Gate determinístico: informação disponível, condição esperada, complacência ou rota habitual exigiam checagem/monitoramento pelo operador.', { resposta: 'Não' })
      logMethodology('runStep3', 'Gate P-G monitoramento', node, ['P-G'], true)
      const code = assertAllowedCode('P-G', ['P-G'], 'runStep3 gate monitoramento')
      return flowResult(code, [node], 'P-A, P-B, P-C, P-D, P-E, P-F, P-H descartadas — falha de monitoramento/verificação de informação disponível')
    }
  }

  if (
    (evidenceOfOwnActionCheckFailure(relatoNorm) || evidenceOfProceduralOmission(relatoNorm)) &&
    !evidenceOfSelectionError(relatoNorm) &&
    !evidenceOfSupervisionFailure(relatoNorm)
  ) {
    const node = methodologyNode('Gate determinístico: informação/condição esperada estava disponível e deveria ter sido verificada pelo próprio operador.', { resposta: 'Não' })
    logMethodology('runStep3', 'Gate P-G', node, ['P-G'], true)
    const code = assertAllowedCode('P-G', ['P-G'], 'runStep3 gate checagem própria')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-D, P-E, P-F, P-H descartadas — falha de checagem/monitoramento de informação disponível')
  }

  if (
    evidenceOfPhysicalIncapacity(relatoNorm) ||
    evidenceOfSelectionError(relatoNorm) ||
    isPureEfficiencyObjective(relatoNorm) ||
    evidenceOfSupervisionFailure(relatoNorm)
  ) {
    const node = methodologyNode('Gate determinístico: mecanismo principal é ação, seleção, supervisão, incapacidade ou objetivo, sem falha perceptiva independente.', { resposta: 'Não' })
    logMethodology('runStep3', 'Gate P-A', node, ['P-A'], true)
    const code = assertAllowedCode('P-A', ['P-A'], 'runStep3 gate sem percepção')
    return flowResult(code, [node], 'P-B, P-C, P-D, P-E, P-F, P-G, P-H descartadas — sem evidência perceptiva independente')
  }

  // Gate determinístico P-F: ilusão perceptiva fisiológica explícita (horizonte falso, vestibular,
  // desorientação espacial). Precede os nós LLM para evitar que "interpretou" seja classificado
  // como déficit de conhecimento (P-C) pelo modelo.
  if (evidenceOfPerceptualIllusion(relatoNorm)) {
    const node = methodologyNode('Gate determinístico: ilusão ou distorção perceptiva fisiológica explícita (horizonte falso, ilusão vestibular, desorientação espacial).', { resposta: 'Sim' })
    logMethodology('runStep3', 'Gate P-F ilusão', node, ['P-F'], true)
    const code = assertAllowedCode('P-F', ['P-F'], 'runStep3 gate ilusão perceptiva')
    return flowResult(code, [node], 'P-A, P-B, P-C, P-D, P-E, P-G, P-H descartadas — ilusão perceptiva fisiológica explícita no relato')
  }

  async function askYesNo(node: string, prompt: string, allowedCodes: string[], terminal: boolean): Promise<RawFlowNode> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await ask(system, prompt)
        const result = safeParse(raw, `Etapa 3 - ${node}`) as RawFlowNode
        const resposta = normalizeYesNo(result.resposta)
        if (!resposta) {
          throw new Error(`Violação metodológica em runStep3 ${node}: resposta deve ser Sim ou Não`)
        }
        result.resposta = resposta
        console.log({ step: 'runStep3', node, result, allowedCodes, terminal })
        return result
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        if (attempt === 2) throw lastError
      }
    }

    throw lastError!
  }

  const no0 = await askYesNo(
    'Nó 0',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

A falha principal do evento depende de evidência explícita de falha perceptiva?

Responda SIM somente se houver evidência textual de:
- não viu
- não ouviu
- não percebeu
- não recebeu informação
- interpretou sinal/informação de forma errada
- não tinha conhecimento para interpretar sinal

Responda NÃO se o relato for principalmente:
- escolha errada
- violação
- decisão inadequada
- ação errada
- falta de supervisão
- incapacidade física
- falta de execução
- objetivo desviante

P-A é o default quando não há evidência perceptiva explícita.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['P-A'],
    true
  )
  nodes.push(no0)

  if (normalizeYesNo(no0.resposta) === 'Não') {
    const code = assertAllowedCode('P-A', ['P-A'], 'runStep3 Nó 0')
    return flowResult(code, nodes, 'P-B, P-C, P-D, P-E, P-F, P-G, P-H descartadas — sem evidência perceptiva explícita')
  }

  const no1 = await askYesNo(
    'Nó 1',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

O operador tinha capacidade sensorial FÍSICA para receber o estímulo relevante?

IMPORTANTE: Esta pergunta é sobre CAPACIDADE FÍSICA dos sentidos (visão, audição, tato), NÃO sobre se o operador efetivamente prestou atenção ou percebeu o risco naquele momento.

Responda SIM se o operador NÃO tinha nenhuma barreira física/ambiental (cego, surdo, ruído extremo, escuridão total, luvas que impedem tato, cabine escura, reflexo que cega).

Responda NÃO apenas se houver evidência textual de BARREIRA FÍSICA que impediu a recepção sensorial do estímulo (ex: não ouviu por ruído, não viu por escuridão, não sentiu por falta de feedback tátil do equipamento).

ATENÇÃO: "Tirou a mão do manete" NÃO é falha sensorial — é decisão/ação. "Não percebeu o risco" NÃO é falha sensorial — é falha de atenção/julgamento.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['P-B'],
    true
  )
  nodes.push(no1)

  if (normalizeYesNo(no1.resposta) === 'Não') {
    const code = assertAllowedCode('P-B', ['P-B'], 'runStep3 Nó 1')
    return flowResult(code, nodes, 'P-C, P-D, P-E, P-F, P-G, P-H descartadas — falha sensorial física')
  }

  const no2 = await askYesNo(
    'Nó 2',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

O operador não tinha conhecimento para interpretar o sinal/informação percebida?
Responda SIM apenas para déficit de treinamento, experiência, familiaridade, capacitação ou compreensão do significado do sinal.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['P-C'],
    true
  )
  nodes.push(no2)

  if (normalizeYesNo(no2.resposta) === 'Sim') {
    const code = assertAllowedCode('P-C', ['P-C'], 'runStep3 Nó 2')
    return flowResult(code, nodes, 'P-B descartada; P-D, P-E, P-F, P-G, P-H descartadas — déficit de conhecimento para interpretar sinal')
  }

  const no3 = await askYesNo(
    'Nó 3',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

Havia pressão temporal externa ou alta demanda que impediu a percepção correta?
Considere apenas urgência, emergência, alta demanda, múltiplos eventos simultâneos, congestionamento operacional/frequência, prazo crítico ou tempo insuficiente explicitamente descritos.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['P-D'],
    true
  )
  nodes.push(no3)

  if (normalizeYesNo(no3.resposta) === 'Sim') {
    const code = assertAllowedCode('P-D', ['P-D'], 'runStep3 Nó 3')
    return flowResult(code, nodes, 'P-B e P-C descartadas; P-E, P-F, P-G, P-H descartadas — pressão temporal/alta demanda perceptiva')
  }

  const no4 = await askYesNo(
    'Nó 4',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

A falha perceptiva decorreu de erro de estimativa temporal, subestimação de duração ou cálculo incorreto da janela disponível?

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['P-E'],
    true
  )
  nodes.push(no4)

  if (normalizeYesNo(no4.resposta) === 'Sim') {
    const code = assertAllowedCode('P-E', ['P-E'], 'runStep3 Nó 4')
    return flowResult(code, nodes, 'P-B, P-C, P-D descartadas; P-F, P-G, P-H descartadas — erro de estimativa temporal')
  }

  const no5 = await askYesNo(
    'Nó 5',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

Houve ilusão ou distorção sensorial física, como ilusão vestibular, visual, espacial ou sensação corporal falsa?
Não conte comunicação ambígua ou erro de decisão como ilusão sensorial.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['P-F'],
    true
  )
  nodes.push(no5)

  if (normalizeYesNo(no5.resposta) === 'Sim') {
    const code = assertAllowedCode('P-F', ['P-F'], 'runStep3 Nó 5')
    return flowResult(code, nodes, 'P-B, P-C, P-D, P-E descartadas; P-G, P-H descartadas — ilusão/distorção sensorial')
  }

  const no6 = await askYesNo(
    'Nó 6',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

A informação necessária dependia de outra pessoa ou canal de comunicação, e essa transmissão falhou, chegou incompleta ou chegou incorreta?
Responda NÃO quando a informação estava diretamente disponível ao operador em instrumento, painel, documento, checklist ou observação própria.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['P-H', 'P-G'],
    true
  )
  nodes.push(no6)

  const code = normalizeYesNo(no6.resposta) === 'Sim'
    ? assertAllowedCode('P-H', ['P-H', 'P-G'], 'runStep3 Nó 6')
    : assertAllowedCode('P-G', ['P-H', 'P-G'], 'runStep3 Nó 6')

  return flowResult(
    code,
    nodes,
    code === 'P-H'
      ? 'P-B, P-C, P-D, P-E, P-F, P-G descartadas — falha de comunicação/informação transmitida'
      : 'P-B, P-C, P-D, P-E, P-F, P-H descartadas — informação disponível foi ignorada/não verificada'
  )
}

async function runStep3Legacy(relato: string, pontoFuga: Step2Result): Promise<StepFlowResult> {
  const system = `CRITICAL RULES:
- Responda SEMPRE em português do Brasil.
- Return ONLY valid JSON. No text outside the JSON block.
- Answer only the local yes/no question asked in the user prompt.
- Do not choose SERA codes. The controller decides the code.
- Do not infer perception from outcome severity or later consequences.
- Perception exists only with explicit evidence that the operator did not see, did not hear, did not receive information, interpreted a signal incorrectly, did not know a signal meaning, or failed to check/monitor directly available information.
- If the report is about wrong choice, violation, inadequate procedure, poor decision, supervision failure, operational error, or execution failure with no explicit perceptual evidence, answer "Não" at the perception-evidence gate.
- If evidence is insufficient for the local question, answer "Não" and explain "DADO INSUFICIENTE".`

  const ato = String(pontoFuga.ato_inseguro_factual || '')
  const relatoNorm = relato
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  const hasPerceptionLiteralEvidence =
    /(nao viu|não viu|nao ouviu|não ouviu|nao percebeu|não percebeu|interpretou.*errad|sinal.*errad|nao recebeu informacao|não recebeu informacao|não recebeu informação|nao sabia o significado|não sabia o significado)/.test(
      relatoNorm
    )
  const isSelectionLikeWithoutPerception =
    /(procedimento errad|selecionou|escolheu.*errad|checklist errad|qrh|opcao errad|opção errad|rota errad|modo errad)/.test(
      relatoNorm
    ) && !hasPerceptionLiteralEvidence
  const hasSupervisionDelegationContext =
    /(supervisor|supervisao|supervisão|deleg|instruiu|nao retornou|não retornou|nao confirmou|não confirmou|nao acompanhou|não acompanhou)/.test(
      relatoNorm
    )
  const hasExplicitKnowledgeDeficit =
    /(nao havia recebido treinamento|não havia recebido treinamento|sem treinamento|desconhecia|nao compreendeu|não compreendeu|nao sabia interpretar|não sabia interpretar|protocolo desconhecido|type-specific)/.test(
      relatoNorm
    )

  if (hasExplicitKnowledgeDeficit) {
    const no0Forced: RawFlowNode = {
      resposta: 'Sim',
      justificativa:
        'Gate determinístico: déficit explícito de conhecimento/interpretação no relato.'
    }
    console.log({
      node: 'P-0',
      pergunta: 'gate de evidência perceptiva explícita',
      resposta: no0Forced,
      allowed_next: ['P-A', 'P-1']
    })
    const no1Forced: RawFlowNode = {
      resposta: 'Sim',
      justificativa:
        'Gate determinístico: sem evidência explícita de limitação sensorial física.'
    }
    console.log({
      node: 'P-1',
      pergunta: 'capacidade sensorial física',
      resposta: no1Forced,
      allowed_next: ['P-B', 'P-2']
    })
    const no2Forced: RawFlowNode = {
      resposta: 'Sim',
      justificativa:
        'Gate determinístico: falha primária por conhecimento/interpretação insuficiente.'
    }
    console.log({
      node: 'P-2',
      pergunta: 'conhecimento do significado do sinal',
      resposta: no2Forced,
      allowed_next: ['P-C', 'P-3']
    })
    assertAllowedCodes('P-C', ['P-C'], 'Nó 2')
    return flowResult(
      'P-C',
      [no0Forced, no1Forced, no2Forced],
      'P-B descartada no Nó 1; P-D, P-E, P-F, P-G, P-H descartadas — operador sem conhecimento para interpretar o estímulo'
    )
  }

  if (isSelectionLikeWithoutPerception) {
    const no0Forced: RawFlowNode = {
      resposta: 'Não',
      justificativa:
        'Gate determinístico: seleção/procedimento inadequado sem evidência perceptiva literal explícita.'
    }
    console.log({
      node: 'P-0',
      pergunta: 'gate de evidência perceptiva explícita',
      resposta: no0Forced,
      allowed_next: ['P-A', 'P-1']
    })
    return flowResult('P-A', [no0Forced], 'Sem evidência explícita de falha perceptiva')
  }
  const answer = (node: RawFlowNode, key = 'resposta') =>
    String(node[key] || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  async function askBinaryNode(node: string, pergunta: string, prompt: string, allowedNext: string[]): Promise<RawFlowNode> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await ask(system, prompt)
        const result = safeParse(raw, `Etapa 3 - ${node}`) as RawFlowNode
        const resposta = answer(result)
        if (resposta !== 'sim' && resposta !== 'nao') {
          throw new Error('Violação metodológica: resposta incompatível com schema binário')
        }
        console.log({ node, pergunta, resposta: result, allowed_next: allowedNext })
        return result
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        if (attempt === 2) throw lastError
      }
    }
    throw lastError!
  }

  const no0 = await askBinaryNode(
    'P-0',
    'gate de evidência perceptiva explícita',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

Existe evidência EXPLÍCITA e LITERAL no relato de falha perceptiva?
Evidência explícita = o relato menciona diretamente que o operador:
• não viu, não ouviu, não sentiu algo disponível no ambiente
• interpretou um sinal de forma errada
• não recebeu informação de outro agente
• não sabia o que o sinal significava
• estava sob pressão que impediu percepção

NÃO é evidência perceptiva (responda NÃO):
• escolha errada de procedimento
• violação de norma
• não verificar ação de outro
• decisão operacional inadequada
• seleção equivocada entre alternativas
• execução diferente do procedimento correto
• economia de tempo, combustível ou esforço
• falta de supervisão de subordinado

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`
    ,
    ['P-A', 'P-1']
  )

  if (answer(no0) === 'nao') {
    return flowResult(
      'P-A',
      [no0],
      'Nenhuma evidência explícita de falha perceptiva'
    )
  }

  const no1 = await askBinaryNode(
    'P-1',
    'capacidade sensorial física',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: o operador tinha capacidade física/sensorial para receber o estímulo relevante?
Considere apenas visão, audição, tato ou barreira física/ambiental que impediu recepção do sinal.
Se não houver evidência explícita de limitação sensorial física, a resposta obrigatória é "Sim".

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['P-B', 'P-2']
  )

  if (answer(no1) === 'nao') {
    assertAllowedCodes('P-B', ['P-B'], 'Nó 1')
    return flowResult(
      'P-B',
      [no0, no1],
      'P-C, P-D, P-E, P-F, P-G, P-H descartadas — operador sem capacidade sensorial física'
    )
  }

  const no2 = await askBinaryNode(
    'P-2',
    'conhecimento do significado do sinal',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: o operador genuinamente não sabia interpretar o significado do sinal por déficit de treinamento, experiência ou capacitação?
Responda "Não" se ele saberia o que fazer caso a informação tivesse chegado corretamente.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['P-C', 'P-3']
  )

  if (answer(no2) === 'sim') {
    assertAllowedCodes('P-C', ['P-C'], 'Nó 2')
    return flowResult('P-C', [no0, no1, no2], 'P-B descartada no Nó 1; P-D, P-E, P-F, P-G, P-H descartadas — operador sem conhecimento para interpretar o estímulo')
  }

  const no3 = await askBinaryNode(
    'P-3',
    'sobrecarga atencional explícita',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: havia alta demanda atencional explícita, múltiplos estímulos simultâneos, congestionamento operacional ou sobrecarga que dividiu a atenção do operador?

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['P-D', 'P-4']
  )

  if (answer(no3) === 'sim') {
    assertAllowedCodes('P-D', ['P-D'], 'Nó 3')
    return flowResult('P-D', [no0, no1, no2, no3], 'P-B descartada no Nó 1; P-C descartada no Nó 2; P-E, P-F, P-G, P-H descartadas — sobrecarga atencional explícita confirmada')
  }

  const no4 = await askBinaryNode(
    'P-4',
    'erro de estimativa temporal',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a falha perceptiva decorreu de estimativa temporal errada, subestimação da duração, expectativa incorreta sobre janela disponível ou cálculo temporal inadequado?

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['P-E', 'P-5']
  )

  if (answer(no4) === 'sim') {
    assertAllowedCodes('P-E', ['P-E'], 'Nó 4')
    return flowResult('P-E', [no0, no1, no2, no3, no4], 'P-B descartada no Nó 1; P-C descartada no Nó 2; P-D descartada no Nó 3; P-F, P-G, P-H descartadas — erro de estimativa temporal confirmado')
  }

  const no5 = await askBinaryNode(
    'P-5',
    'ilusão ou distorção sensorial',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: houve ilusão ou distorção sensorial física, como ilusão vestibular, visual, espacial ou sensação corporal falsa?
Responda "Não" para comunicação ambígua ou informação verbal incompleta.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['P-F', 'P-6']
  )

  if (answer(no5) === 'sim') {
    assertAllowedCodes('P-F', ['P-F'], 'Nó 5')
    return flowResult('P-F', [no0, no1, no2, no3, no4, no5], 'P-B descartada no Nó 1; P-C descartada no Nó 2; P-D descartada no Nó 3; P-E descartada no Nó 4; P-G, P-H descartadas — ilusão ou distorção sensorial confirmada')
  }

  const no6 = await askBinaryNode(
    'P-6',
    'falha de comunicação ou informação não recebida',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a informação necessária dependia de transmissão por outra pessoa ou sistema de comunicação, e essa transmissão falhou, foi incompleta, ambígua ou foi entendida de forma errada?
Responda "Não" quando a informação estava diretamente disponível em instrumentos, visual, checklist ou documento acessível ao operador.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['P-H', 'P-G']
  )

  const codigoNo6 = answer(no6) === 'sim' ? 'P-H' : 'P-G'
  assertAllowedCodes(codigoNo6, ['P-H', 'P-G'], 'Nó 6')

  if (codigoNo6 === 'P-H') {
    return flowResult('P-H', [no0, no1, no2, no3, no4, no5, no6], 'P-B descartada no Nó 1; P-C descartada no Nó 2; P-D descartada no Nó 3; P-E descartada no Nó 4; P-F descartada no Nó 5; P-G descartada — falha de comunicação confirmada')
  }

  return flowResult('P-G', [no0, no1, no2, no3, no4, no5, no6], 'P-B descartada no Nó 1; P-C descartada no Nó 2; P-D descartada no Nó 3; P-E descartada no Nó 4; P-F descartada no Nó 5; P-H descartada no Nó 6 — informação disponível e correta foi ignorada')
}

export async function runStep4(relato: string, pontoFuga: Step2Result): Promise<StepFlowResult> {
  const system = `CRITICAL RULES:
- Responda SEMPRE em português do Brasil.
- Return ONLY valid JSON. No text outside the JSON block.
- NEVER skip the first decision node: "Consistent with rules and regulations?" This MUST be answered before any other.
- NEVER classify O-D if there is evidence of rule violation — O-D requires the goal to be consistent with rules but not conservative.
- NEVER classify O-B (routine violation) without evidence of repeated behavior or normalized shortcut ("todos fazem", "burocracia", atalho cultural).
- Classify objective before action execution details.
- O-D requires explicit motive of efficiency/economy (tempo, combustível, custo, produtividade). O-D does NOT involve rule violation.
- O-C is an exceptional/non-routine conscious violation of a rule or procedure. The motive can be convenience, situational pressure, improvisation, protective intent, or any other circumstantial reason. O-C does NOT require human protective intent.
- O-B requires explicit normalized shortcut/routine violation ("todos fazem", "burocracia", atalho cultural, histórico repetido).
- If evidence is insufficient, set justificativa to "DADO INSUFICIENTE".

Você é um especialista SERA aplicando o fluxo de Objetivo (4-Flow.json).
Fluxo: ${loadDocJson('4-Flow.json')}
Falhas: ${loadDocJson('4-Failures.json', 4000)}
${NO_ARTIFACTS}
CRITÉRIO O-D: Objetivo consistente com normas MAS não conservativo/não gerencia risco → O-D (Hendy 2003, Figure 5 — 'Failure in intent, Non-violation').`

  const ato = String(pontoFuga.ato_inseguro_factual || '')
  const objectiveDecisionText = [
    relato,
    pontoFuga.ato_inseguro_factual,
    pontoFuga.justificativa,
    pontoFuga.momento,
    pontoFuga.agente,
  ]
    .filter(Boolean)
    .join(' ')
  const relatoNorm = normalizeEvidenceText(objectiveDecisionText)

  const objectiveRule = classifyObjectiveByRules(objectiveDecisionText)

  if (process.env.SERA_DEBUG_OBJECTIVE === '1') {
    console.log('[SERA OBJECTIVE RULE]', {
      objectiveDecisionText,
      objectiveRule,
    })
  }

  if (objectiveRule.code === 'O-D' && evidenceOfSpeedManagementAttentionCapture(relatoNorm)) {
    const noSpeedGuard = methodologyNode(
      'Gate determinístico: cenário de gerenciamento de velocidade com atenção capturada por proximidade operacional — parâmetro degradou abaixo da faixa segura, não há objetivo de eficiência/economia. Objetivo nominal de execução da aproximação (O-A). [AN-008: DAUMAS_APPLIED_IMPROVEMENT]',
      { resposta: 'Sim', objetivo_identificado: 'objetivo operacional nominal' }
    )
    logMethodology('runStep4', 'Gate O-A (speed management / atenção capturada)', noSpeedGuard, ['O-A'], true)
    return flowResult('O-A', [noSpeedGuard], 'O-B, O-C e O-D descartados — gerenciamento de velocidade com atenção capturada por proximidade operacional: objetivo nominal de execução da aproximação, não eficiência/economia')
  }

  if (objectiveRule.code !== null) {
    const no1 = methodologyNode(`Gate determinístico: ${objectiveRule.reason}.`, {
      resposta: 'Não',
      objetivo_identificado:
        objectiveRule.code === 'O-C'
          ? 'violação excepcional/circunstancial'
          : objectiveRule.code === 'O-B'
          ? 'violação rotineira normalizada'
          : 'eficiência/economia operacional',
    })
    logMethodology('runStep4', `Gate classifyObjectiveByRules ${objectiveRule.code}`, no1, [objectiveRule.code], true)
    const discarded =
      objectiveRule.code === 'O-C'
        ? 'O-A, O-B e O-D descartados — regra determinística: violação consciente excepcional/circunstancial'
        : objectiveRule.code === 'O-B'
        ? 'O-A, O-C e O-D descartados — regra determinística: violação rotineira/normalizada'
        : 'O-A, O-B e O-C descartados — regra determinística: objetivo de eficiência/economia'
    return flowResult(objectiveRule.code, [no1], discarded)
  }

  if (evidenceOfObjectiveCForbiddenContext(relatoNorm)) {
    const no1 = methodologyNode('Gate determinístico: contexto de comunicação/coordenação operacional ou eficiência sem intenção humana/altruística explícita.', {
      resposta: 'Sim',
      objetivo_identificado: 'objetivo operacional nominal',
    })
    logMethodology('runStep4', 'Gate O-A anti O-C', no1, ['O-A'], true)
    return flowResult('O-A', [no1], 'O-B, O-C e O-D descartados — contexto de comunicação/coordenação operacional sem desvio consciente de objetivo')
  }

  const hasKnowledgeDeficitObjectiveContext =
    /(nao havia recebido treinamento|nao recebeu treinamento|sem treinamento especifico|desconhecia o protocolo|nao conhecia o protocolo|lacuna de conhecimento|lacuna instrucional|treinamento insuficiente|nao foi treinado|nao tinha treinamento especifico)/.test(
      relatoNorm
    )
  if (hasKnowledgeDeficitObjectiveContext) {
    const noKD = methodologyNode(
      'Gate determinístico: déficit explícito de conhecimento/treinamento — operador não desviou conscientemente de protocolo conhecido; objetivo era nominal.',
      { resposta: 'Sim', objetivo_identificado: 'objetivo operacional nominal' }
    )
    logMethodology('runStep4', 'Gate O-A (knowledge deficit)', noKD, ['O-A'], true)
    return flowResult('O-A', [noKD], 'O-B, O-C e O-D descartados — lacuna explícita de conhecimento/treinamento indica objetivo nominal sem desvio consciente de protocolo')
  }

  const r1 = await ask(
    system,
    `Ato inseguro: ${ato}
Relato: ${relato}

NÓ 1 — O OBJETIVO do operador era consistente com normas e regulamentos?
Responda "Não" SOMENTE se houver evidência EXPLÍCITA de intenção inconsistente:
• intenção de violar norma
• ganho pessoal explícito (tempo, esforço, combustível)
• objetivo pró-social conflitante (salvar alguém, evitar mal maior)
• cultura explícita de atalho normalizado ("todos fazem", "burocracia")

Responda "Sim" quando NÃO houver intenção desviante explícita, incluindo:
• operador não sabia que estava errado
• seleção errada sem intenção de violar
• erro técnico sem motivação desviante
• procedimento incorreto por desconhecimento
• alta carga operacional ou múltiplas demandas sem intenção de desviar
• ilusão perceptiva ou desorientação que causou ação incorreta
• instrução verbal ambígua que gerou mal-entendido
• ferramenta indisponível que forçou improviso sem decisão consciente de violar regra conhecida
• restrição física, temporal ou operacional externa sem desvio intencional

ATENÇÃO: situação excepcional, pressão de prazo, evento crítico ou resultado perigoso NÃO são por si sós evidência de objetivo inconsistente. Para "Não", é preciso que o operador tenha CONSCIENTEMENTE decidido agir contra norma/procedimento/expectativa conhecida.

Responda APENAS com JSON:
{"resposta": "Sim/Não", "objetivo_identificado": "...",
"justificativa": "..."}`
  )
  const no1 = safeParse(r1, 'Etapa 4 - Nó 1') as RawFlowNode

  if (String(no1.resposta || '').toLowerCase() === 'não') {
    const r2 = await ask(
      system,
      `Ato inseguro: ${ato}
Relato: ${relato}
Nó 1: Objetivo NÃO consistente com normas (O-A e O-D DESCARTADOS).

NÓ 2 — Esta violação de objetivo é rotineira/habitual ou excepcional/isolada?
• "rotineira": desvio normalizado, habitual, atalho cultural repetido, aceito ou tolerado pela organização/equipe ("todos fazem", "burocracia", histórico explícito de repetição) → O-B
• "excepcional": desvio consciente, pontual, isolado, não normalizado — a motivação pode ser conveniência, improviso, pressão situacional, proteção humana ou qualquer razão circunstancial que não seja prática habitual → O-C
Responda APENAS com JSON: {"tipo": "rotineira/excepcional", "justificativa": "..."}`
    )
    const no2 = safeParse(r2, 'Etapa 4 - Nó 2') as RawFlowNode
    const tipo2 = String(no2.tipo || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z_]/g, '')
    const codigo: 'O-B' | 'O-C' = tipo2.includes('rotineira') ? 'O-B' : 'O-C'

    if (codigo === 'O-C' && !hasConsciousObjectiveDeviationEvidence(relatoNorm)) {
      const noGuard = methodologyNode(
        'Gate determinístico: LLM classificou O-C mas não há evidência lexical de desvio CONSCIENTE de regra/procedimento/expectativa operacional conhecida. A situação pode ser excepcional ou conter restrição operacional, mas a falha pertence a percepção/ação/precondições até confirmação adicional. Hipótese de O-C pode ser reavaliada se confirmados: procedimento aplicável, conhecimento do operador e decisão consciente de descumprir.',
        { codigo: 'O-A', resposta: 'Não' }
      )
      logMethodology('runStep4', 'Gate O-A (desvio consciente insuficiente)', noGuard, ['O-A'], true)
      return flowResult('O-A', [no1, no2, noGuard], 'O-B, O-C e O-D descartados — ausência de evidência de desvio consciente de regra/procedimento/expectativa conhecida; O-A conservador até confirmação')
    }

    const discarded2 = codigo === 'O-B' ? 'O-A, O-C e O-D descartados — violação rotineira/normalizada' : 'O-A, O-B e O-D descartados — violação consciente excepcional/não rotineira'
    return flowResult(codigo, [no1, no2], discarded2)
  }

  const r2 = await ask(
    system,
    `Nó 1: Objetivo SIM consistente com normas (O-B e O-C DESCARTADOS).

NÓ 2 — Existe evidência EXPLÍCITA de que o objetivo principal era ganho de eficiência/economia (tempo, combustível, custo, produtividade), mesmo mantendo aderência formal?
Responda "Sim" SOMENTE com menção literal ou inequívoca desse ganho.
Sem essa evidência explícita, responda "Não".
Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`
  )
  const no2 = safeParse(r2, 'Etapa 4 - Nó 2') as RawFlowNode

  if (String(no2.resposta || '').toLowerCase() === 'sim') {
    return flowResult('O-D', [no1, no2], 'O-B e O-C descartados no Nó 1')
  }

  return flowResult('O-A', [no1, no2], 'O-B, O-C, O-D descartados')
}

export async function runStep5(relato: string, pontoFuga: Step2Result): Promise<StepFlowResult> {
  const system = `CRITICAL RULES:
- Responda SEMPRE em português do Brasil.
- Return ONLY valid JSON. No text outside the JSON block.
- Answer only the local question asked in the user prompt.
- Do not classify globally.
- Do not use codes outside the branch explicitly provided in the user prompt.
- The TypeScript controller decides the final flow and terminal code.
${NO_ARTIFACTS}`

  const ato = String(pontoFuga.ato_inseguro_factual || '')
  const nodes: RawFlowNode[] = []
  const relatoNorm = normalizeEvidenceText(`${relato}\n${ato}`)
  const relatoOnlyNorm = normalizeEvidenceText(relato)
  const organizationalEscapePoint =
    isEscapePointOrganizationalAgent(String(pontoFuga.agente || '')) ||
    evidenceOfOrganizationalRoleContext(relatoNorm)
  const engineeringDesignDominant = evidenceOfEngineeringDesignDominantContext(relatoOnlyNorm)
  const maintenanceOmission =
    (
      isMaintainenceOrOrganizationalAgent(String(pontoFuga.agente || '')) ||
      evidenceOfOrganizationalRoleContext(relatoNorm)
    ) &&
    evidenceOfMaintenanceSystemContext(relatoOnlyNorm) &&
    evidenceOfMaintenanceOmissionContext(relatoOnlyNorm) &&
    !engineeringDesignDominant
  const supervisionFailure = evidenceOfSupervisionFailure(relatoNorm) && !engineeringDesignDominant
  const feedbackCheckFailure = evidenceOfExplicitFeedbackCheckFailure(relatoNorm)
  const informationChannelFailure = evidenceOfInformationChannelFailure(relatoNorm)
  const ownActionCheckFailure = evidenceOfOwnActionCheckFailure(relatoNorm)
  const communicationConfirmationFailure = evidenceOfCommunicationConfirmationFailure(relatoNorm)
  const temporalExecutionFailure = evidenceOfTemporalExecutionFailure(relatoNorm)
  const administrativeRedundantNoImpact = evidenceOfAdministrativeRedundantNoOperationalImpact(relatoNorm)
  const wrongOperationalSelectionUnderLoad = evidenceOfWrongOperationalSelectionUnderLoad(relatoNorm)
  const proceduralOmissionDetected = evidenceOfProceduralOmission(relatoNorm)
  const technicalKnowledgeDeficit = evidenceOfKnowledgeDeficit(relatoNorm)
  const explicitHumanPhysicalLimitation = evidenceOfExplicitHumanPhysicalLimitation(relatoNorm)
  const aircraftSystemBarrierDegradation = evidenceOfAircraftSystemBarrierDegradation(relatoNorm)
  const adSystemBarrierFalsePositive =
    aircraftSystemBarrierDegradation && !explicitHumanPhysicalLimitation

  function remapOrganizationalActionIfInvalidAd(code: string): string {
    if (code !== 'A-D') return code
    if (adSystemBarrierFalsePositive) {
      if (supervisionFailure || maintenanceOmission || feedbackCheckFailure) return 'A-G'
      if (technicalKnowledgeDeficit) return 'A-E'
      if (proceduralOmissionDetected) return 'A-B'
      if (wrongOperationalSelectionUnderLoad) return 'A-I'
      if (ownActionCheckFailure) return 'A-C'
      return 'A-A'
    }
    if (!organizationalEscapePoint) return code
    if (explicitHumanPhysicalLimitation) return code
    if (supervisionFailure || maintenanceOmission || feedbackCheckFailure) return 'A-G'
    if (technicalKnowledgeDeficit) return 'A-E'
    if (proceduralOmissionDetected) return 'A-B'
    if (wrongOperationalSelectionUnderLoad) return 'A-I'
    if (ownActionCheckFailure) return 'A-C'
    return 'A-A'
  }

  async function askNode(
    node: string,
    prompt: string,
    allowedCodes: readonly string[],
    terminal: boolean,
    validate: (result: RawFlowNode) => void
  ): Promise<RawFlowNode> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await ask(system, prompt)
        const result = safeParse(raw, `Etapa 5 - ${node}`) as RawFlowNode
        validate(result)
        console.log({ step: 'runStep5', node, result, allowedCodes, terminal })
        return result
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        if (attempt === 2) throw lastError
      }
    }

    throw lastError!
  }

  async function askYesNo(node: string, prompt: string, allowedCodes: readonly string[], terminal: boolean) {
    return askNode(node, prompt, allowedCodes, terminal, (result) => {
      const resposta = normalizeYesNo(result.resposta)
      if (!resposta) {
        throw new Error(`Violação metodológica em runStep5 ${node}: resposta deve ser Sim ou Não`)
      }
      result.resposta = resposta
    })
  }

  async function askCode<T extends string>(
    node: string,
    prompt: string,
    allowedCodes: readonly T[],
    context: string
  ): Promise<{ result: RawFlowNode; code: T }> {
    const result = await askNode(node, prompt, allowedCodes, true, (parsed) => {
      const rawCode = String(parsed.codigo || '')
      parsed.codigo = assertAllowedCode(rawCode, allowedCodes, context)
    })
    return { result, code: result.codigo as T }
  }

  function finishDeterministic<T extends string>(nodeName: string, code: T, allowedCodes: readonly T[], justificativa: string, descartadas: string): StepFlowResult {
    const terminalCode = assertAllowedCode(code, allowedCodes, nodeName)
    const node = methodologyNode(justificativa, { codigo: terminalCode })
    logMethodology('runStep5', nodeName, node, allowedCodes, true)
    return flowResult(terminalCode, [node], descartadas)
  }

  function terminalDecision(input: { codigo: 'A-J'; justificativa: string }): StepFlowResult {
    return finishDeterministic(
      'Gate A-J',
      input.codigo,
      ['A-J'],
      input.justificativa,
      'A-A, A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I descartados — A-J terminal por falha central de confirmação/readback/comunicação operacional'
    )
  }

  // Gate A-F (ilusão perceptiva): precede A-D e A-C para evitar que ilusão vestibular/visual
  // (desorientação espacial, horizonte falso, leans) seja confundida com incapacidade física.
  // Ativa somente quando há evidência conjunta de ilusão fisiológica E ação incorreta dela decorrente.
  if (evidenceOfPerceptualIllusionAction(relatoNorm)) {
    return finishDeterministic(
      'Gate A-F (ilusão perceptiva)',
      'A-F',
      ['A-F'],
      'Gate determinístico: correção, manobra ou ação inadequada decorrente de ilusão perceptiva fisiológica (horizonte falso, ilusão vestibular, desorientação espacial).',
      'A-A, A-B, A-C, A-D, A-E, A-G, A-H, A-I, A-J descartados — ação errada causada por ilusão perceptiva, não por incapacidade física ou ausência de verificação'
    )
  }

  // Gate A-A (barreira sensorial — P-B): sinal existia mas foi bloqueado por barreira física/ambiental.
  // Precede A-C/A-B para evitar que "não detectou" vire "não verificou".
  if (evidenceOfSensoryBarrier(relatoNorm)) {
    return finishDeterministic(
      'Gate A-A (barreira sensorial)',
      'A-A',
      ['A-A'],
      'Gate determinístico: barreira sensorial física/ambiental (ruído, brilho, reflexo, protetor auricular) impediu a percepção do sinal.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — sinal não detectado por barreira sensorial, não por ausência de verificação'
    )
  }

  // Gate A-A (déficit interpretativo — P-C): operador percebeu o sinal mas não tinha
  // familiaridade/conhecimento para interpretar corretamente. Distinto de A-E (conhecimento
  // técnico geral ausente): aqui o déficit é específico ao tipo/modelo/instrumento.
  if (evidenceOfInterpretiveKnowledgeDeficit(relatoNorm)) {
    return finishDeterministic(
      'Gate A-A (déficit interpretativo)',
      'A-A',
      ['A-A'],
      'Gate determinístico: operador interpretou incorretamente a leitura/sinal por falta de familiaridade com o tipo de aeronave ou instrumento — ação foi coerente com a percepção incorreta.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — ação derivou de percepção incorreta por déficit interpretativo, não de omissão de verificação'
    )
  }

  if (
    evidenceOfPhysicalIncapacity(relatoNorm) &&
    !maintenanceOmission &&
    !organizationalEscapePoint &&
    !adSystemBarrierFalsePositive
  ) {
    return finishDeterministic(
      'Gate A-D',
      'A-D',
      ['A-D'],
      'Gate determinístico: limitação física, motora, ergonômica, EPI, força, alcance ou equipamento impediu a execução.',
      'A-A, A-B, A-C, A-E, A-F, A-G, A-H, A-I, A-J descartados — incapacidade física explícita prevalece sobre omissão/checagem'
    )
  }

  if (technicalKnowledgeDeficit) {
    return finishDeterministic(
      'Gate A-E',
      'A-E',
      ['A-E'],
      'Gate determinístico: déficit explícito de conhecimento, treinamento, familiaridade ou competência técnica.',
      'A-A, A-B, A-C, A-D, A-F, A-G, A-H, A-I, A-J descartados — déficit técnico explícito prevalece sobre omissão/checagem'
    )
  }

  // Guard rail de P-H no Step5: briefing/informação ambígua sem falha explícita de
  // delegação + verificação de terceiro não deve abrir A-G.
  if (informationChannelFailure && !supervisionFailure && !maintenanceOmission) {
    return finishDeterministic(
      'Gate A-A (briefing/informação ambígua)',
      'A-A',
      ['A-A'],
      'Gate determinístico: mecanismo dominante é briefing/informação/instrução ambígua recebida, sem falha explícita de supervisão de terceiro.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — briefing ambíguo puro não caracteriza A-G'
    )
  }

  if (supervisionFailure || maintenanceOmission || feedbackCheckFailure) {
    return finishDeterministic(
      'Gate A-G',
      'A-G',
      ['A-G'],
      maintenanceOmission && !supervisionFailure && !feedbackCheckFailure
        ? 'Gate determinístico: agente do ponto de fuga é manutenção/organização e não verificou/garantiu execução de tarefa ou teste obrigatório. Resposta de piloto após falha técnica consequente é análise secundária, não ponto de fuga.'
        : feedbackCheckFailure && !supervisionFailure && !maintenanceOmission
          ? 'Gate determinístico: protocolo formal de verificação/callout esperado e disponível após ação crítica (FMA, cross-check pós-checklist) não foi executado — falha de verificação da própria ação com protocolo exigível.'
          : 'Gate determinístico: agente em posição de supervisão/delegação deixou de verificar ação executada por outra pessoa.',
      'A-A, A-B, A-C, A-D, A-E, A-F, A-H, A-I, A-J descartados — falha de verificação/cross-check explícito'
    )
  }

  // Quando a falha causal dominante é confirmação/readback/comunicação,
  // A-J é terminal e prevalece sobre A-I independentemente de carga operacional.
  if (evidenceOfCentralCommunicationFailure(relatoNorm)) {
    return terminalDecision({
      codigo: 'A-J',
      justificativa:
        'Gate determinístico terminal: falha central de confirmação/readback/comunicação operacional.',
    })
  }

  const objectiveDecisionText = [
    relato,
    pontoFuga.ato_inseguro_factual,
    pontoFuga.justificativa,
    pontoFuga.momento,
    pontoFuga.agente,
  ]
    .filter(Boolean)
    .join(' ')
  const objectiveDecisionNorm = normalizeEvidenceText(objectiveDecisionText)
  const forcedObjective = forceObjectiveOverride(objectiveDecisionText)

  // A-J prevalece sobre A-I quando o mecanismo causal dominante é falha de confirmação/readback/comunicação operacional.
  if (communicationConfirmationFailure) {
    return finishDeterministic(
      'Gate A-J',
      'A-J',
      ['A-J'],
      'Gate determinístico: falha central de comunicação, readback, recepção, coordenação verbal ou confirmação operacional.',
      'A-A, A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I descartados — comunicação/confirmação explícita prevalece sobre omissão genérica'
    )
  }

  if (temporalExecutionFailure || evidenceOfSpeedManagementAttentionCapture(relatoNorm)) {
    return finishDeterministic(
      'Gate A-H',
      'A-H',
      ['A-H'],
      'Gate determinístico: sequência ou tarefa ficou incompleta por gerenciamento temporal insuficiente na execução, ou parâmetro crítico degradou enquanto atenção estava capturada por tarefa de proximidade operacional.',
      'A-A, A-B, A-C, A-D, A-E, A-F, A-G, A-I, A-J descartados — falha temporal de execução ou gerenciamento de parâmetro sob atenção capturada'
    )
  }

  if (forcedObjective?.code === 'O-C') {
    return finishDeterministic(
      'Gate A-A (O-C)',
      'A-A',
      ['A-A'],
      'Gate determinístico: objetivo contém desvio consciente O-C, sem mecanismo independente de falha de ação.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — desvio de objetivo O-C sem falha de ação independente'
    )
  }

  if (
    forcedObjective?.code === 'O-D' &&
    !communicationConfirmationFailure &&
    !supervisionFailure &&
    !maintenanceOmission &&
    !hasConsciousObjectiveDeviationEvidence(objectiveDecisionNorm) &&
    !evidenceOfKnownLimitDeviationContinuation(objectiveDecisionNorm)
  ) {
    return finishDeterministic(
      'Gate A-A (O-D)',
      'A-A',
      ['A-A'],
      'Gate deterministico: objetivo principal de eficiencia/economia, sem evidencia dominante de erro de execucao, comunicacao ou supervisao.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — desvio de objetivo (O-D) sem falha de acao independente'
    )
  }

  if (administrativeRedundantNoImpact) {
    return finishDeterministic(
      'Gate A-A (administrativo redundante)',
      'A-A',
      ['A-A'],
      'Gate determinístico: atraso/preenchimento de campo administrativo redundante sem falha operacional específica.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — discrepância administrativa redundante sem impacto operacional'
    )
  }

  // Gate A-A (sobrecarga atencional — P-D): alta demanda operacional genuína bloqueou
  // a percepção/verificação. Precede A-I e A-F para proteger casos P-D onde a falha
  // foi de percepção/atenção (não percebeu conflito), não de seleção operacional errada.
  // Usa relatoOnlyNorm para a exclusão de seleção, evitando falso match no ato LLM-gerado.
  if (
    evidenceOfExplicitHighDemandOperationalContext(relatoNorm) &&
    !hasNegatedHighDemand(relatoNorm) &&
    !communicationConfirmationFailure &&
    !evidenceOfSelectionError(relatoOnlyNorm) &&
    !evidenceOfWrongOperationalSelectionUnderLoad(relatoOnlyNorm)
  ) {
    return finishDeterministic(
      'Gate A-A (sobrecarga atencional)',
      'A-A',
      ['A-A'],
      'Gate determinístico: alta demanda operacional genuína (múltiplos conflitos, pico operacional, aeronaves simultâneas) limitou a capacidade perceptiva/atencional do operador.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — falha perceptiva por sobrecarga atencional real, não por omissão voluntária'
    )
  }

  if (wrongOperationalSelectionUnderLoad) {
    return finishDeterministic(
      'Gate A-I',
      'A-I',
      ['A-I'],
      'Gate determinístico: instrução/seleção operacional errada sob pressão temporal explícita.',
      'A-A, A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-J descartados — A-I permitido apenas com pressão temporal explícita'
    )
  }

  if (evidenceOfSelectionError(relatoNorm)) {
    return finishDeterministic(
      'Gate A-F',
      'A-F',
      ['A-F'],
      'Gate determinístico: seleção de procedimento, checklist, modo, item, rota, alternativa ou plano errado entre opções disponíveis.',
      'A-A, A-B, A-C, A-D, A-E, A-G, A-H, A-I, A-J descartados — seleção errada não é falta de verificação'
    )
  }

  if (evidenceOfRoutineViolation(relatoNorm)) {
    return finishDeterministic(
      'Gate A-A',
      'A-A',
      ['A-A'],
      'Gate determinístico: violação rotineira/normalizada sem falha de ação específica independente.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — objetivo desviante rotineiro sem mecanismo de ação específico'
    )
  }

  if (ownActionCheckFailure && !evidenceOfProceduralOmission(relatoNorm)) {
    return finishDeterministic(
      'Gate A-C',
      'A-C',
      ['A-C'],
      'Gate determinístico: falha central foi não verificar, monitorar ou confirmar resultado da própria ação já executada.',
      'A-A, A-B, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — checagem da própria ação'
    )
  }

  if (evidenceOfProtectiveObjective(relatoNorm)) {
    return finishDeterministic(
      'Gate A-A (objetivo protetivo)',
      'A-A',
      ['A-A'],
      'Gate determinístico: motivo protetivo/humano isolado não cria falha específica de ação nem prova O-C.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — motivo protetivo isolado não substitui evidência de mecanismo de ação'
    )
  }

  if (evidenceOfPerceptionAnchoredCoherentAction(relatoNorm) &&
      !feedbackCheckFailure &&
      !supervisionFailure &&
      !maintenanceOmission &&
      !temporalExecutionFailure &&
      !communicationConfirmationFailure &&
      !technicalKnowledgeDeficit &&
      !evidenceOfSelectionError(relatoNorm)) {
    return finishDeterministic(
      'Gate A-A (perception-anchored coherent action)',
      'A-A',
      ['A-A'],
      'Gate determinístico: a falha dominante foi perceptual (monitoramento/informação/atenção) e a ação foi continuação coerente com a percepção incorreta — sem omissão de passo físico/procedural independente do eixo P.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — ação coerente com percepção incorreta, ancorada no eixo P'
    )
  }

  if (proceduralOmissionDetected) {
    return finishDeterministic(
      'Gate A-B',
      'A-B',
      ['A-B'],
      'Gate determinístico: omissão de passo físico/procedural específico obrigatório.',
      'A-A, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — omissão procedural específica'
    )
  }

  if (evidenceOfEfficiencyObjective(relatoNorm)) {
    return finishDeterministic(
      'Gate A-A',
      'A-A',
      ['A-A'],
      'Gate determinístico: o ato inseguro decorre de objetivo de eficiência/economia, sem erro de execução, comunicação, supervisão ou seleção.',
      'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — ação coerente com objetivo operacional desviante'
    )
  }

  const no1 = await askYesNo(
    'Nó 1',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

A execução falhou contra a intenção?
Responda SIM somente se o operador pretendia fazer uma ação, mas a execução falhou por omissão, lapso, não verificação ou falha de completar passo.
Responda NÃO se a falha principal foi decisão, seleção de alternativa, incapacidade, supervisão, comunicação ou escolha sob pressão.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['A-B', 'A-C'],
    false
  )
  nodes.push(no1)

  if (normalizeYesNo(no1.resposta) === 'Sim') {
    const { result, code } = await askCode(
      'Nó 1B',
      `Ato inseguro factual: ${ato}
Relato: ${relato}

Branch de execução. Escolha APENAS um código permitido:
- A-B: omissão de passo físico/procedural específico
- A-C: não verificou, monitorou ou confirmou resultado da própria ação

Responda APENAS com JSON: {"codigo": "A-B/A-C", "justificativa": "..."}`,
      ['A-B', 'A-C'],
      'runStep5 execução'
    )
    nodes.push(result)
    return flowResult(code, nodes, 'A-A, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — branch de execução')
  }

  // Guard rail: quando o nó 1 retorna "Não", ainda pode haver incapacidade real.
  // Avaliamos incapacidade antes do Nó 2 para não colapsar indevidamente em A-A.
  const no1Cap = await askYesNo(
    'Nó 1C',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

A causa principal foi incapacidade para executar corretamente?
Responda SIM se havia limitação física, motora, força, alcance, ergonomia, EPI, equipamento, falta de conhecimento, treinamento, habilidade, familiaridade ou competência técnica.
Responda NÃO quando a causa principal for decisão, seleção, comunicação, supervisão ou pressão temporal.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['A-D', 'A-E'],
    false
  )
  nodes.push(no1Cap)

  if (normalizeYesNo(no1Cap.resposta) === 'Sim') {
    const { result, code } = await askCode(
      'Nó 1C-B',
      `Ato inseguro factual: ${ato}
Relato: ${relato}

Branch de incapacidade. Escolha APENAS:
- A-D: limitação física, motora, força, alcance, ergonomia, EPI ou equipamento
- A-E: falta de conhecimento, treinamento, habilidade, familiaridade ou competência técnica

Responda APENAS com JSON: {"codigo": "A-D/A-E", "justificativa": "..."}`,
      ['A-D', 'A-E'],
      'runStep5 capacidade (pós Nó 1=Não)'
    )
    const remappedCode = remapOrganizationalActionIfInvalidAd(code)
    if (remappedCode !== code) {
      result.codigo = remappedCode
      result.justificativa = `${String(result.justificativa || '')} [guard A-D organizacional: remapeado para ${remappedCode}]`.trim()
    }
    nodes.push(result)
    return flowResult(remappedCode, nodes, 'A-A, A-B, A-C, A-F, A-G, A-H, A-I, A-J descartados — incapacidade pré-requisito')
  }

  const no2 = await askYesNo(
    'Nó 2',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

A ação foi coerente com o que o operador acreditava/percebia no momento?
Responda SIM se a ação fazia sentido dada a percepção/crença do operador, mesmo que a percepção estivesse errada.
Responda NÃO se houve incapacidade, decisão/seleção errada, supervisão, comunicação ou pressão temporal.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['A-A'],
    true
  )
  nodes.push(no2)

  if (normalizeYesNo(no2.resposta) === 'Sim') {
    const code = assertAllowedCode('A-A', ['A-A'], 'runStep5 Nó 2')
    return flowResult(code, nodes, 'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J descartados — ação coerente com crença/percepção')
  }

  const no3 = await askYesNo(
    'Nó 3',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

Havia incapacidade pré-requisito para executar corretamente?
Responda SIM se o operador não tinha capacidade para executar corretamente por limitação física, motora, força, alcance, ergonomia, EPI, equipamento, falta de conhecimento, treinamento, habilidade, familiaridade ou competência técnica.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['A-D', 'A-E'],
    false
  )
  nodes.push(no3)

  if (normalizeYesNo(no3.resposta) === 'Sim') {
    const { result, code } = await askCode(
      'Nó 3B',
      `Ato inseguro factual: ${ato}
Relato: ${relato}

Branch de incapacidade. Escolha APENAS um código permitido:
- A-D: limitação física, motora, força, alcance, ergonomia, EPI ou equipamento impediu execução
- A-E: falta de conhecimento, treinamento, habilidade, familiaridade ou competência técnica impediu saber o que fazer

Responda APENAS com JSON: {"codigo": "A-D/A-E", "justificativa": "..."}`,
      ['A-D', 'A-E'],
      'runStep5 capacidade'
    )
    const remappedCode = remapOrganizationalActionIfInvalidAd(code)
    if (remappedCode !== code) {
      result.codigo = remappedCode
      result.justificativa = `${String(result.justificativa || '')} [guard A-D organizacional: remapeado para ${remappedCode}]`.trim()
    }
    nodes.push(result)
    return flowResult(remappedCode, nodes, 'A-A, A-B, A-C, A-F, A-G, A-H, A-I, A-J descartados — incapacidade pré-requisito')
  }

  const no4 = await askYesNo(
    'Nó 4',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

Havia pressão temporal explícita?
Responda SIM somente se o texto mencionar explicitamente urgência, emergência, alta demanda, múltiplos eventos simultâneos, congestionamento operacional/frequência, prazo crítico ou tempo insuficiente.
Se não houver evidência textual explícita, responda NÃO.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "..."}`,
    ['A-H', 'A-I', 'A-J', 'A-F', 'A-G'],
    false
  )
  nodes.push(no4)

  if (normalizeYesNo(no4.resposta) === 'Não') {
    const { result, code } = await askCode(
      'Nó 5 sem pressão',
      `Ato inseguro factual: ${ato}
Relato: ${relato}

Branch sem pressão temporal. Escolha APENAS um código permitido:
- A-F: seleção errada de procedimento, modo, plano, rota, opção ou alternativa
- A-G: supervisor/coordenador/comandante não verificou execução ou resultado de ação de outro

É proibido responder A-I neste branch.

Responda APENAS com JSON: {"codigo": "A-F/A-G", "justificativa": "..."}`,
      ['A-F', 'A-G'],
      'runStep5 decisão sem pressão'
    )
    nodes.push(result)
    return flowResult(code, nodes, 'A-A, A-B, A-C, A-D, A-E, A-H, A-I, A-J descartados — decisão sem pressão temporal explícita')
  }

  const { result: no5, code } = await askCode(
    'Nó 5 com pressão',
    `Ato inseguro factual: ${ato}
Relato: ${relato}

Branch com pressão temporal explícita confirmada. Escolha APENAS um código permitido:
- A-H: falha de gerenciamento, sequenciamento ou conclusão de tarefa por tempo
- A-I: escolha/instrução operacional errada sob pressão temporal explícita
- A-J: falha de confirmação, readback, recepção, coordenação ou feedback sob pressão

Responda APENAS com JSON: {"codigo": "A-H/A-I/A-J", "justificativa": "..."}`,
    ['A-H', 'A-I', 'A-J'],
    'runStep5 decisão com pressão'
  )
  nodes.push(no5)
  return flowResult(code, nodes, 'A-A, A-B, A-C, A-D, A-E, A-F, A-G descartados — decisão com pressão temporal explícita')
}

async function runStep5Legacy(relato: string, pontoFuga: Step2Result): Promise<StepFlowResult> {
  const system = `CRITICAL RULES:
- Responda SEMPRE em português do Brasil.
- Return ONLY valid JSON. No text outside the JSON block.
- Answer only the local question asked in the user prompt.
- Do not choose SERA codes unless the prompt explicitly asks for one local binary distinction.
- Do not use global semantic similarity. The controller decides the branch.
- A-I is structurally forbidden unless the controller confirms explicit time pressure, wrong choice/instruction, capability present, no confirmation failure, and no execution failure.
- NEVER mention node names or IDs in the output.
${NO_ARTIFACTS}`

  const ato = String(pontoFuga.ato_inseguro_factual || '')
  const relatoNorm = relato
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
  const hasExplicitCommunicationFeedbackFailure =
    /(read-?back|confirmacao de leitura|confirmação de leitura|frequencia|frequência|congestionamento de frequencia|congestionamento de frequência|nao aguardou|não aguardou|resposta do piloto|conteudo completo|conteúdo completo)/.test(
      relatoNorm
    )
  const hasExplicitTimePressureSelection =
    /(conflito iminente|menos de 60 segundos|alta demanda|multiplas comunicacoes|múltiplas comunicações|comunicacoes simultaneas|comunicações simultâneas|nao havia tempo|não havia tempo|agir imediatamente)/.test(
      relatoNorm
    ) &&
    /(emitiu instrucao|emitiu instrução|instrucao de altitude errada|instrução de altitude errada|climb|descend|deveria descer|deveria ser)/.test(
      relatoNorm
    )

  if (hasExplicitCommunicationFeedbackFailure) {
    const noDet: RawFlowNode = {
      resposta: 'Não',
      justificativa:
        'Gate determinístico: falha de comunicação/readback/feedback sob pressão temporal explícita.'
    }
    console.log({
      node: 'A-DET-J',
      pergunta: 'gate de comunicação/readback sob pressão',
      resposta: noDet,
      allowed_next: ['A-J']
    })
    assertAllowedCodes('A-J', ['A-J'], 'A-DET-J')
    return flowResult(
      'A-J',
      [noDet],
      'A-A, A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I descartados — falha primária de comunicação/readback'
    )
  }

  if (hasExplicitTimePressureSelection) {
    const noDet: RawFlowNode = {
      resposta: 'Sim',
      justificativa:
        'Gate determinístico: seleção/instrução operacional errada sob pressão temporal explícita.'
    }
    console.log({
      node: 'A-DET-I',
      pergunta: 'gate de seleção sob pressão temporal',
      resposta: noDet,
      allowed_next: ['A-I']
    })
    assertAllowedCodes('A-I', ['A-I'], 'A-DET-I')
    return flowResult(
      'A-I',
      [noDet],
      'A-A, A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-J descartados — seleção operacional errada sob pressão temporal explícita'
    )
  }
  const hasExplicitTechnicalDeficit =
    /(nao havia recebido treinamento|não havia recebido treinamento|sem treinamento|type-specific|protocolo desconhecido|nao compreendeu|não compreendeu|incapacidade tecnica|incapacidade técnica|desconhecia o sistema)/.test(
      relatoNorm
    )
  const hasSupervisionFailure =
    /(supervisor|supervisao|supervisão|deleg|instruiu|nao retornou|não retornou|nao confirmou|não confirmou|nao acompanhou|não acompanhou)/.test(
      relatoNorm
    )

  if (hasSupervisionFailure) {
    const noDet: RawFlowNode = {
      resposta: 'Não',
      justificativa:
        'Gate determinístico: falha primária de supervisão/coordenação sem confirmação do resultado delegado.'
    }
    console.log({
      node: 'A-DET-G',
      pergunta: 'gate de supervisão explícita',
      resposta: noDet,
      allowed_next: ['A-G']
    })
    assertAllowedCodes('A-G', ['A-G'], 'A-DET-G')
    return flowResult(
      'A-G',
      [noDet],
      'A-A, A-B, A-C, A-D, A-E, A-F, A-H, A-I, A-J descartados — falha primária de supervisão/delegação'
    )
  }

  if (hasExplicitTechnicalDeficit) {
    const noDet: RawFlowNode = {
      resposta: 'Não',
      justificativa:
        'Gate determinístico: evidência explícita de déficit técnico/treinamento para executar corretamente.'
    }
    console.log({
      node: 'A-DET-E',
      pergunta: 'gate de déficit técnico explícito',
      resposta: noDet,
      allowed_next: ['A-E']
    })
    assertAllowedCodes('A-E', ['A-E'], 'A-DET-E')
    return flowResult(
      'A-E',
      [noDet],
      'A-A, A-B, A-C, A-D, A-F, A-G, A-H, A-I, A-J descartados — falha primária por déficit técnico/treinamento explícito'
    )
  }
  const answer = (node: RawFlowNode, key = 'resposta') =>
    String(node[key] || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()

  async function askBinaryNode(node: string, pergunta: string, prompt: string, allowedNext: string[]): Promise<RawFlowNode> {
    let lastError: Error | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const raw = await ask(system, prompt)
        const result = safeParse(raw, `Etapa 5 - ${node}`) as RawFlowNode
        const resposta = answer(result)
        if (resposta !== 'sim' && resposta !== 'nao') {
          throw new Error('Violação metodológica: resposta incompatível com schema binário')
        }
        console.log({ node, pergunta, resposta: result, allowed_next: allowedNext })
        return result
      } catch (e) {
        lastError = e instanceof Error ? e : new Error(String(e))
        if (attempt === 2) throw lastError
      }
    }
    throw lastError!
  }

  function finish(codigo: string, nos: RawFlowNode[], allowed: string[], node: string, descartadas: string) {
    assertAllowedCodes(codigo, allowed, node)
    return flowResult(codigo, nos, descartadas)
  }

  const no1 = await askBinaryNode(
    'A-1',
    'execução correspondeu exatamente à intenção',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a execução correspondeu exatamente à intenção do operador?
Responda "Não" quando o ato inseguro factual for omissão, lapso, esquecimento, item não executado ou ausência de verificação/feedback.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['A-B/A-C', 'A-2']
  )

  if (answer(no1) === 'nao') {
    const no1d = await askBinaryNode(
      'A-1D',
      'não execução por seleção errada entre alternativas',
      `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: o "NÃO" do nó anterior ocorreu porque o operador selecionou/escolheu a alternativa/procedimento errado entre opções possíveis (e não por omissão, não execução ou falta de feedback)?
Responda "Sim" apenas para erro de seleção.
Responda obrigatoriamente "Não" quando a causa principal for falta de conhecimento, falta de treinamento, protocolo desconhecido ou incapacidade técnica.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
      ,
      ['A-2', 'A-1C']
    )

    if (answer(no1d) === 'sim') {
      return finish(
        'A-F',
        [no1, no1d],
        ['A-F'],
        'Nó 1D',
        'A-B, A-C, A-D, A-E, A-G, A-H, A-I, A-J excluídos — seleção/procedimento errado entre alternativas'
      )
    }

    const no1c = await askBinaryNode(
      'A-1C',
      'não execução por incapacidade explícita',
      `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: o "NÃO" do nó anterior ocorreu porque o operador tentou executar a ação correta, mas não conseguiu por incapacidade física/motora/técnica (força, alcance, ergonomia, EPI, equipamento, conhecimento técnico insuficiente)?
Responda "Não" quando o "NÃO" for omissão, esquecimento, não execução voluntária de etapa, ou ausência de verificação/feedback.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
      ,
      ['A-3', 'A-1B']
    )

    if (answer(no1c) === 'sim') {
      const no3 = await askBinaryNode(
        'A-3',
        'capacidade física e técnica',
        `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: o operador tinha capacidade física e técnica para executar a ação correta?
Responda "Não" se havia limitação de força, alcance, ergonomia, EPI, equipamento, falta de treinamento, protocolo desconhecido ou incapacidade técnica.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
        ,
        ['A-D/A-E', 'A-4']
      )

      if (answer(no3) === 'nao') {
        const no3b = await askBinaryNode(
          'A-3B',
          'limitação física versus técnica',
          `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a incapacidade foi física/motora/ergonômica, ligada a força, alcance, EPI, equipamento ou limitação corporal?
Responda "Não" quando a incapacidade for falta de conhecimento, treinamento, competência técnica ou protocolo desconhecido.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
          ,
          ['A-D', 'A-E']
        )
        const codigo = answer(no3b) === 'sim' ? 'A-D' : 'A-E'
        return finish(codigo, [no1, no1d, no1c, no3, no3b], ['A-D', 'A-E'], 'Nó 3B', 'A-B, A-C excluídos por exceção de incapacidade explícita; A-F, A-G, A-H, A-I, A-J excluídos no Nó 3 — sem capacidade')
      }
    }

    const no1b = await askBinaryNode(
      'A-1B',
      'falha de feedback dentro do ramo de execução',
      `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a falha central foi não verificar, monitorar ou confirmar o resultado depois de uma ação já executada?
Responda "Não" se foi omissão de passo físico/procedural específico, checklist, trava, pino, instalação ou item não executado.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
      ,
      ['A-C', 'A-B']
    )
    const codigo = answer(no1b) === 'sim' ? 'A-C' : 'A-B'
    return finish(codigo, [no1, no1d, no1c, no1b], ['A-B', 'A-C'], 'Nó 1B', 'A-A, A-D, A-E, A-F, A-G, A-H, A-I, A-J excluídos — execução não correspondeu à intenção')
  }

  const no2 = await askBinaryNode(
    'A-2',
    'ação fazia sentido dado o que o operador acreditava',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a ação fazia sentido dado o que o operador acreditava/percebia no momento, sem evidência de escolha de procedimento errado, comunicação falha, supervisão falha, incapacidade ou tarefa incompleta?
REGRA ESPECIAL: Se a etapa de percepção identificou falha (qualquer código P-B a P-H), e o operador agiu de forma COERENTE com o que acreditava estar acontecendo — mesmo que sua percepção estivesse errada — responda SIM (A-A). A falha estava na percepção, não na ação.
EXCEÇÃO OBRIGATÓRIA: Se houver evidência de incapacidade física/motora/técnica para executar a ação correta, responda NÃO para seguir ao Nó 3.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['A-A', 'A-3']
  )

  if (answer(no2) === 'sim') {
    return finish('A-A', [no1, no2], ['A-A'], 'Nó 2', 'A-B, A-C, A-D, A-E, A-F, A-G, A-H, A-I, A-J excluídos — ação coerente com a percepção/crença do operador')
  }

  const no3 = await askBinaryNode(
    'A-3',
    'capacidade física e técnica',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: o operador tinha capacidade física e técnica para executar a ação correta?
Responda "Não" se havia limitação de força, alcance, ergonomia, EPI, equipamento, falta de treinamento, protocolo desconhecido ou incapacidade técnica.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['A-D/A-E', 'A-4']
  )

  if (answer(no3) === 'nao') {
    const no3b = await askBinaryNode(
      'A-3B',
      'limitação física versus técnica',
      `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a incapacidade foi física/motora/ergonômica, ligada a força, alcance, EPI, equipamento ou limitação corporal?
Responda "Não" quando a incapacidade for falta de conhecimento, treinamento, competência técnica ou protocolo desconhecido.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
      ,
      ['A-D', 'A-E']
    )
    const codigo = answer(no3b) === 'sim' ? 'A-D' : 'A-E'
    return finish(codigo, [no1, no2, no3, no3b], ['A-D', 'A-E'], 'Nó 3B', 'A-B, A-C excluídos no Nó 1; A-F, A-G, A-H, A-I, A-J excluídos no Nó 3 — sem capacidade')
  }

  const no4 = await askBinaryNode(
    'A-4',
    'pressão temporal explícita',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: havia pressão temporal EXPLÍCITA no relato?
Responda "Sim" somente se houver urgência, emergência, múltiplas demandas, congestionamento, prazo crítico ou pressão operacional explicitamente mencionados.
Se o relato não mencionar esses elementos, a resposta obrigatória é "Não".
NÃO configuram pressão temporal explícita (responda NÃO):
• rotina normal sem urgência descrita
• operador escolheu agir rápido por conveniência
• tarefa simples sem prazo mencionado
• falha de supervisão sem elemento temporal
• desconhecimento técnico
• violação por hábito

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['A-H/A-I/A-J', 'A-C/A-F/A-G']
  )
  const houvePressaoTemporal = answer(no4) === 'sim'

  if (!houvePressaoTemporal) {
    const no5a = await askBinaryNode(
      'A-5A',
      'supervisão ou delegação sem pressão',
      `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a falha central foi de supervisão, coordenação ou comando por não verificar uma ação delegada ou não confirmar que outro executou corretamente?

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
      ,
      ['A-G', 'A-5B']
    )

    if (answer(no5a) === 'sim') {
      const codigoFinal = 'A-G'
      assertAllowedCodes(codigoFinal, ['A-C', 'A-F', 'A-G'], 'Nó 5 sem pressão')
      return finish(codigoFinal, [no1, no2, no3, no4, no5a], ['A-C', 'A-F', 'A-G'], 'Nó 5 sem pressão', 'A-B, A-D, A-E, A-H, A-I, A-J excluídos — ramo sem pressão temporal')
    }

    const no5b = await askBinaryNode(
      'A-5B',
      'seleção errada sem pressão',
      `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a falha central foi selecionar/escolher procedimento, opção, item, rota, modo ou resposta errada entre alternativas (confusão por similaridade)?
Responda "Não" quando a falha central foi não verificar, monitorar ou confirmar o resultado após ação já executada.

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
      ,
      ['A-C', 'A-F']
    )

    const codigoFinal = answer(no5b) === 'sim' ? 'A-F' : 'A-C'
    assertAllowedCodes(codigoFinal, ['A-C', 'A-F', 'A-G'], 'Nó 5 sem pressão')
    return finish(codigoFinal, [no1, no2, no3, no4, no5a, no5b], ['A-C', 'A-F', 'A-G'], 'Nó 5 sem pressão', 'A-B, A-D, A-E, A-H, A-I, A-J excluídos — ramo sem pressão temporal')
  }

  const no5c = await askBinaryNode(
    'A-5C',
    'falha de confirmação sob pressão',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a falha central foi comunicação, readback, confirmação verbal, transmissão, escuta ou coordenação de mensagem?

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['A-J', 'A-5D']
  )

  if (answer(no5c) === 'sim') {
    const codigoFinal = 'A-J'
    assertAllowedCodes(codigoFinal, ['A-H', 'A-I', 'A-J'], 'Nó 5 pressão')
    return finish(codigoFinal, [no1, no2, no3, no4, no5c], ['A-H', 'A-I', 'A-J'], 'Nó 5 pressão', 'A-B, A-C, A-D, A-E, A-F, A-G excluídos — ramo com pressão temporal')
  }

  const no5d = await askBinaryNode(
    'A-5D',
    'tarefa incompleta sob pressão',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: a tarefa ficou incompleta por falta de tempo, interrupção, estimativa errada de duração ou sequência não concluída?

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['A-H', 'A-5E']
  )

  if (answer(no5d) === 'sim') {
    const codigoFinal = 'A-H'
    assertAllowedCodes(codigoFinal, ['A-H', 'A-I', 'A-J'], 'Nó 5 pressão')
    return finish(codigoFinal, [no1, no2, no3, no4, no5c, no5d], ['A-H', 'A-I', 'A-J'], 'Nó 5 pressão', 'A-B, A-C, A-D, A-E, A-F, A-G excluídos — ramo com pressão temporal')
  }

  const no5e = await askBinaryNode(
    'A-5E',
    'escolha operacional errada sob pressão',
    `Ato inseguro: ${ato}
Relato: ${relato}

Pergunta local: houve escolha, seleção ou emissão de instrução operacional errada entre alternativas possíveis sob a pressão temporal já confirmada?

Responda APENAS com JSON: {"resposta": "Sim/Não", "justificativa": "evidência textual local"}`
    ,
    ['A-I', 'A-H']
  )

  const falhaConfirmacao = answer(no5c) === 'sim'
  const falhaExecucao = answer(no1) === 'nao'
  const tinhaCapacidade = answer(no3) === 'sim'
  const erroDeEscolha = answer(no5e) === 'sim'
  const podeSerAI =
    houvePressaoTemporal &&
    erroDeEscolha &&
    tinhaCapacidade &&
    !falhaConfirmacao &&
    !falhaExecucao

  if (!podeSerAI) {
    const codigoFinal = 'A-H'
    assertAllowedCodes(codigoFinal, ['A-H', 'A-I', 'A-J'], 'Nó 5 pressão')
    return finish(codigoFinal, [no1, no2, no3, no4, no5c, no5d, no5e], ['A-H', 'A-I', 'A-J'], 'Nó 5 pressão', 'A-I bloqueado por regra estrutural; ramo com pressão temporal sem seleção operacional válida')
  }

  const codigoFinal = 'A-I'
  assertAllowedCodes(codigoFinal, ['A-H', 'A-I', 'A-J'], 'Nó 5 pressão')
  return finish(codigoFinal, [no1, no2, no3, no4, no5c, no5d, no5e], ['A-H', 'A-I', 'A-J'], 'Nó 5 pressão', 'A-B, A-C, A-D, A-E, A-F, A-G, A-J excluídos — seleção operacional errada sob pressão temporal explícita')
}

export async function runStep6_7(
  relato: string,
  pontoFuga: Step2Result,
  step3: StepFlowResult,
  step4: StepFlowResult,
  step5: StepFlowResult
): Promise<Step67Result> {
  const system = `CRITICAL RULES:
- Responda SEMPRE em português do Brasil.
- Return ONLY valid JSON. No text outside the JSON block.
- NEVER repeat information already stated in steps 3, 4, or 5.
- NEVER create a recommendation without a direct link to an identified failure code.
- NEVER duplicate recommendations — each must address a distinct failure or precondition.
- Each recommendation MUST target what CAN be changed (precondition/systemic factor), not the active failure itself.
- Minimum 3, maximum 6 recommendations.
- Each precondition MUST have direct evidence from the report — no inferences.
- If evidence is insufficient for a conclusion, state it explicitly.
- Never include active-failure codes (A-*, O-*, P-*) as preconditions.

OUTPUT FORMAT (strict):
{
  "erc_level": <número inteiro de 1 a 5>,
  "precondicoes": [
    {"codigo": "string: e.g. P2", "descricao": "nome da pré-condição", "etapa": "3, 4 ou 5", "evidencia_no_relato": "citação ou paráfrase do relato"}
  ],
  "conclusoes": "síntese das descobertas, 80-120 palavras",
  "recomendacoes": [
    {"acao": "ação concreta e específica", "falha_relacionada": "X-X", "justificativa": "por que essa ação mitiga essa falha"}
  ]
}

TABELA ERC (Error Recovery Characteristics — Hendy 2003):
1 = Erro imediatamente evidente e facilmente reversível antes de consequências
2 = Erro detectável com atenção normal, reversível com esforço moderado
3 = Erro detectável apenas com verificação ativa; reversão possível mas não trivial
4 = Erro dificilmente detectável sem inspeção específica; reversão difícil
5 = Erro latente, não detectável na operação normal; consequências irreversíveis

CALIBRAÇÃO PARA ESTE PROJETO:
- Omissão de pino/trava/check técnico esperado → ERC 3
- Não verificar trem de pouso após comando → ERC 2
- Incapacidade física de fechar válvula crítica → ERC 3
- Desconhecimento de sistema/protocolo novo → ERC 2
- Seleção errada de procedimento de emergência → ERC 2
- Instrução ATC errada sob alta demanda → ERC 1
- Readback/confirmação em frequência congestionada → ERC 1

Você é um especialista SERA gerando pré-condições e recomendações.
Pré-condições disponíveis: ${loadDocJson('Pre-Conditions.json', 4000)}
Guidelines: ${loadDocJson('Guidelines.json')}
Template: ${loadDocJson('Template.json')}
Base científica e critérios decisores (tutorial): ${loadDocJson('tutorial.json', 3000)}`

  const parsed = await askJson(
    system,
    `Ato inseguro: ${pontoFuga.ato_inseguro_factual}
Falha Percepção: ${step3.codigo}
Falha Objetivo: ${step4.codigo}
Falha Ação: ${step5.codigo}
ERC: Usando a tabela acima, avalie quão difícil era detectar e reverter este erro específico ANTES das consequências. Retorne erc_level: 1 a 5.
Relato: ${relato}

REGRAS OBRIGATÓRIAS:
1. Cada pré-condição deve ter evidência DIRETA no relato — sem inferências
2. Organize por etapa: cada pré-condição pertence a Etapa 3, 4 ou 5
3. SEM duplicatas de código
4. Se pressão de tempo foi descartada no fluxo de Percepção, T1 só pode aparecer vinculada à Etapa 4 ou 5 com justificativa específica
5. Recomendações vinculadas aos códigos reais identificados (${step3.codigo}, ${step4.codigo}, ${step5.codigo})

	Responda APENAS com JSON.`,
    'Etapa 6-7',
    { maxTokens: 12000 }
  ) as unknown as Step67Result
  const relatoNorm = normalizeEvidenceText(`${relato}\n${pontoFuga.ato_inseguro_factual || ''}`)
  const ercLevel = inferDeterministicErcLevel(relatoNorm, step3.codigo, step4.codigo, step5.codigo, parsed.erc_level)
  if (typeof ercLevel === 'number') parsed.erc_level = ercLevel
  return parsed
}
