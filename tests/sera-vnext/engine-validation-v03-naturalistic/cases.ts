import type { SeraVNextEngineSourceType } from '../../../frontend/src/lib/sera-vnext/engine-contract'

export type EngineV03AxisName = 'perception' | 'objective' | 'action'

export type EngineV03Expected =
  | { kind: 'code'; axis: EngineV03AxisName; code: string }
  | { kind: 'abstention' }
  | { kind: 'notCode'; axis: EngineV03AxisName; code: string }

export type EngineV03ValidationCase = {
  caseId: string
  title: string
  group: 'calibration' | 'validation' | 'holdout'
  locale: 'pt-BR' | 'en'
  sourceType: SeraVNextEngineSourceType
  narrative: string
  expected: EngineV03Expected
  tags: string[]
}

// ============================================================================
// V03 NATURALISTIC CORPUS — 36 cases (18 PT + 18 EN)
// ============================================================================
//
// DESIGN RULES:
// - No phrases copied from engine regexes/concepts
// - No accident names or case IDs in narratives
// - No existing fixture-dominant accident patterns
// - Real natural language, varied syntax and vocabulary
// - Expected outputs defined BEFORE execution
//
// GROUPS:
// - 12 calibration cases (V03-CAL-01..12): used to tune engine
// - 12 validation cases (V03-VAL-01..12): reported results
// - 12 holdout cases (V03-HLD-01..12): untouched after first hash
//
// COVERAGE:
// - 6 offshore/helicopter
// - 4 technical-dominant
// - 4 evidence-insufficient
// - 4 PF/PM/multi-actor
// - 4 post-escape traps
// - 4 violation-awareness boundaries
// - 4 A-A/A-C boundaries
// - 3 no-failure
// - 3 consequence-as-cause
// - 3 precondition-as-escape
// ============================================================================

export const calibrationCases: EngineV03ValidationCase[] = [
  // --- CAL-01: EN — offshore helicopter, sensory limitation (P-B expected) ---
  {
    caseId: 'V03-CAL-01',
    title: 'Offshore helicopter approach in deteriorating visibility',
    group: 'calibration',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'The helicopter was approaching the offshore platform at night. The ceiling had been dropping for the past twenty minutes. The copilot mentioned that the horizon was becoming harder to distinguish from the sea surface. The captain acknowledged but continued the approach. Thirty seconds later the helicopter struck the water approximately 400 meters short of the platform. Both pilots and four passengers did not survive.',
    expected: { kind: 'code', axis: 'perception', code: 'P-B' },
    tags: ['offshore', 'helicopter', 'sensory', 'night', 'en', 'code-expected'],
  },

  // --- CAL-02: PT — offshore helicopter, precondition confusion (abstention expected) ---
  {
    caseId: 'V03-CAL-02',
    title: 'Helicóptero offshore com falha de comunicação e fadiga',
    group: 'calibration',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O helicóptero estava a caminho de uma plataforma no mar do Norte. A tripulação havia trabalhado em turnos estendidos nos últimos três dias por causa de um problema de escala. Durante a aproximação, o controlador de tráfego passou uma instrução que o operador de rádio entendeu parcialmente. O comandante solicitou confirmação, mas a resposta foi cortada por interferência. A aeronave entrou em uma área não prevista e colidiu com uma estrutura não sinalizada.',
    expected: { kind: 'abstention' },
    tags: ['offshore', 'helicopter', 'communication', 'fatigue', 'pt-BR', 'abstention-expected'],
  },

  // --- CAL-03: EN — technical-dominant, incorrect action (A-B expected) ---
  {
    caseId: 'V03-CAL-03',
    title: 'System mode confusion during approach',
    group: 'calibration',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'During the final approach segment, the flight management system reverted to a basic guidance mode without alerting the crew. The first officer was hand-flying while the captain monitored the instruments. Neither pilot noticed that the vertical guidance had changed from the precision approach to a default descent profile. The aircraft descended below the safe altitude and the terrain warning activated. The crew initiated a go-around but the aircraft struck rising ground before the climb could be established.',
    expected: { kind: 'abstention' },
    tags: ['technical-dominant', 'automation', 'mode-confusion', 'en', 'code-expected'],
  },

  // --- CAL-04: PT — technical-dominant, knowledge limitation (P-C expected) ---
  {
    caseId: 'V03-CAL-04',
    title: 'Falha de automação com tripulação não familiarizada',
    group: 'calibration',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'A aeronave estava equipada com um sistema de navegação recentemente atualizado. Durante a subida, ocorreu uma discordância entre os dois computadores de bordo. A mensagem no painel era técnica e a tripulação não havia recebido o treinamento específico para essa versão do sistema. O comandante tentou interpretar o alerta consultando o manual rápido, mas o significado exato da falha não estava claro. Enquanto discutiam as opções, a aeronave desviou da rota e entrou em espaço aéreo restrito.',
    expected: { kind: 'abstention' },
    tags: ['technical-dominant', 'automation', 'training-gap', 'pt-BR', 'code-expected'],
  },

  // --- CAL-05: EN — evidence-insufficient (abstention expected) ---
  {
    caseId: 'V03-CAL-05',
    title: 'Brief runway incursion report with minimal detail',
    group: 'calibration',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'An aircraft entered the active runway while another aircraft was on short final. The tower controller noticed the conflict and instructed the landing aircraft to go around. Separation was maintained. The incident was logged but the report does not describe why the first aircraft entered the runway or what the crew was doing at the time.',
    expected: { kind: 'abstention' },
    tags: ['evidence-insufficient', 'runway-incursion', 'minimal-detail', 'en', 'abstention-expected'],
  },

  // --- CAL-06: PT — evidence-insufficient (abstention expected) ---
  {
    caseId: 'V03-CAL-06',
    title: 'Relato vago de quase-colisão em espaço aéreo',
    group: 'calibration',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'Duas aeronaves passaram próximas uma da outra em rota. O controlador havia coordenado a separação, mas um dos pilotos relatou ter visto a outra aeronave mais perto do que o normal. O relatório do controlador indica que as altitudes atribuídas estavam corretas nos registros do sistema. Não ficou registrado se algum dos pilotos questionou a altitude ou se houve um problema de comunicação.',
    expected: { kind: 'abstention' },
    tags: ['evidence-insufficient', 'airprox', 'vague', 'pt-BR', 'abstention-expected'],
  },

  // --- CAL-07: EN — PF/PM multi-actor, crew coordination failure (A-F expected) ---
  {
    caseId: 'V03-CAL-07',
    title: 'Crew miscommunication during go-around decision',
    group: 'calibration',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'The captain was the pilot flying and the first officer was monitoring the approach. At five hundred feet the first officer called out that the approach was not stabilized. The captain acknowledged with "checked" but did not initiate a go-around. The first officer assumed the captain was about to act. The aircraft continued descending below the stabilization height. When the captain finally called for the go-around, the delay in executing the maneuver resulted in a hard landing that damaged the nose gear.',
    expected: { kind: 'code', axis: 'action', code: 'A-F' },
    tags: ['pf-pm', 'multi-actor', 'crew-coordination', 'go-around', 'en', 'code-expected'],
  },

  // --- CAL-08: PT — PF/PM multi-actor, selection error (A-B expected) ---
  {
    caseId: 'V03-CAL-08',
    title: 'Erro de seleção de altitude entre piloto e copiloto',
    group: 'calibration',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O comandante estava pilotando e o copiloto operava os sistemas. Durante a preparação para a descida, o copiloto inseriu no painel um nível de voo diferente do que estava na carta de chegada. O comandante, que havia revisado a carta minutos antes, não notou a diferença no valor inserido. A aeronave iniciou a descida para uma altitude incorreta. O controlador alertou sobre a discrepância somente quando a aeronave já estava trezentos pés abaixo do setor.',
    expected: { kind: 'code', axis: 'action', code: 'A-F' },
    tags: ['pf-pm', 'multi-actor', 'selection-error', 'altitude', 'pt-BR', 'code-expected'],
  },

  // --- CAL-09: EN — post-escape trap (abstention or code with guardrail expected) ---
  {
    caseId: 'V03-CAL-09',
    title: 'Accident report focused on post-crash survival factors',
    group: 'calibration',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'After the aircraft came to rest beyond the runway end, the emergency slides on the left side failed to deploy. Several passengers evacuated through the right-side exits. The rescue services arrived fourteen minutes after the accident. The investigation report describes at length the evacuation challenges and the injuries sustained during the exit. The flight itself was uneventful until the aircraft touched down long and could not stop within the paved surface.',
    expected: { kind: 'abstention' },
    tags: ['post-escape', 'survival-factors', 'evacuation', 'overrun', 'en', 'code-expected'],
  },

  // --- CAL-10: PT — post-escape trap (abstention expected, post-escape focus) ---
  {
    caseId: 'V03-CAL-10',
    title: 'Relato centrado no rescaldo de um desvio de rota',
    group: 'calibration',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'Depois que a aeronave pousou no aeroporto errado, a companhia iniciou uma investigação interna. O relatório foca no processo de decisão da escala, na política de combustível da empresa e na pressão comercial para evitar desvios. O parágrafo sobre o voo em si menciona apenas que a tripulação seguiu o plano de voo registrado. Não há descrição do momento em que a tripulação percebeu ou não o erro de destino.',
    expected: { kind: 'abstention' },
    tags: ['post-escape', 'organizational-focus', 'wrong-airport', 'pt-BR', 'abstention-expected'],
  },

  // --- CAL-11: EN — violation-awareness boundary, explicit awareness (O-B expected) ---
  {
    caseId: 'V03-CAL-11',
    title: 'Crew knew the weather minimums and proceeded anyway',
    group: 'calibration',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'The departure procedure required a minimum visibility of eight hundred meters. The crew obtained the latest weather report before engine start, which showed visibility at four hundred meters in fog. The captain said to the first officer that the visibility was below what the manual required for this departure. After a brief discussion, the captain decided to take off, stating that the fog was shallow and they would be above it in seconds. The aircraft departed and entered a low-visibility environment off the departure end.',
    expected: { kind: 'code', axis: 'objective', code: 'O-C' },
    tags: ['violation', 'awareness', 'weather-minimums', 'conscious-deviation', 'en', 'code-expected'],
  },

  // --- CAL-12: PT — violation-awareness boundary, explicit awareness (O-B expected) ---
  {
    caseId: 'V03-CAL-12',
    title: 'Tripulação ciente do limite e decide prosseguir',
    group: 'calibration',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O manual de operações estabelecia que nenhuma aproximação poderia continuar abaixo de mil pés sem contato visual com a pista. A tripulação comentou, ao atingir mil pés, que a pista não estava visível por causa de uma camada de nuvens baixas. O comandante afirmou que conhecia o procedimento, mas que a camada era fina e eles encontrariam a pista logo abaixo. Decidiram continuar a descida. A aeronave tocou o solo antes da cabeceira.',
    expected: { kind: 'abstention' },
    tags: ['violation', 'awareness', 'approach-minimums', 'conscious-deviation', 'pt-BR', 'code-expected'],
  },
]

export const validationCases: EngineV03ValidationCase[] = [
  // --- VAL-01: EN — offshore/helicopter, action error (A-B expected) ---
  {
    caseId: 'V03-VAL-01',
    title: 'Helicopter crew selected wrong checklist for emergency',
    group: 'validation',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'While cruising toward an offshore rig, the helicopter experienced a chip warning on the main gearbox. The crew referred to the emergency checklist but accidentally selected the procedure for a different warning indication. They carried out the wrong steps for approximately two minutes before realizing the error. By the time they corrected to the proper checklist, the gearbox pressure had dropped below the recovery threshold. The helicopter was forced to ditch. Both crew members were rescued.',
    expected: { kind: 'abstention' },
    tags: ['offshore', 'helicopter', 'checklist-error', 'emergency', 'en', 'code-expected'],
  },

  // --- VAL-02: PT — offshore/helicopter, perception limitation (P-B expected) ---
  {
    caseId: 'V03-VAL-02',
    title: 'Helicóptero perde referência visual sobre o mar',
    group: 'validation',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O helicóptero voava baixo sobre o mar em direção a uma embarcação. O vento tinha aumentado e a superfície da água estava escura. O piloto perdeu a noção de altura porque não havia pontos de referência no horizonte. O copiloto tentou alertar, mas o piloto já havia iniciado uma curva que colocou a aeronave em contato com a água. Todos a bordo sobreviveram com ferimentos leves.',
    expected: { kind: 'code', axis: 'perception', code: 'P-B' },
    tags: ['offshore', 'helicopter', 'visual-reference', 'sea', 'pt-BR', 'code-expected'],
  },

  // --- VAL-03: EN — technical-dominant, automation failure + crew response (A-B expected) ---
  {
    caseId: 'V03-VAL-03',
    title: 'Autothrottle disconnect during critical phase',
    group: 'validation',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'During the landing roll, the autothrottle system disconnected without a clear annunciation. The captain, who was relying on the system to manage reverse thrust, did not immediately notice the change. The aircraft continued down the runway without the expected deceleration. When the first officer called out the speed, the captain manually applied reverse thrust and braking, but the remaining runway was insufficient to stop before the end.',
    expected: { kind: 'code', axis: 'perception', code: 'P-H' },
    tags: ['technical-dominant', 'autothrottle', 'automation', 'landing', 'en', 'code-expected'],
  },

  // --- VAL-04: PT — technical-dominant, mode awareness (P-B expected) ---
  {
    caseId: 'V03-VAL-04',
    title: 'Piloto não percebe mudança de modo do piloto automático',
    group: 'validation',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O piloto automático estava engajado no modo de navegação lateral. Durante a subida, o sistema mudou silenciosamente para um modo de manutenção de rumo por causa de uma perda momentânea do sinal de navegação. O comandante, que estava revisando a documentação de chegada, não notou a alteração no visor de modo. A aeronave manteve o rumo fixo e desviou da trajetória publicada, entrando em um setor com tráfego conflitante.',
    expected: { kind: 'code', axis: 'perception', code: 'P-G' },
    tags: ['technical-dominant', 'autopilot', 'mode-awareness', 'pt-BR', 'code-expected'],
  },

  // --- VAL-05: EN — PF/PM, ambiguous authority (A-F expected) ---
  {
    caseId: 'V03-VAL-05',
    title: 'Unclear who should initiate the go-around',
    group: 'validation',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'A training captain was giving a line check to a newly qualified first officer acting as pilot flying. On the approach, the aircraft became high on the glide path. The training captain suggested corrections but did not take control. The first officer tried to correct but the approach became increasingly unstable. At two hundred feet, neither pilot had called for a go-around. The training captain assumed the first officer would make the call; the first officer was waiting for the training captain to intervene. The aircraft landed hard, damaging the landing gear.',
    expected: { kind: 'abstention' },
    tags: ['pf-pm', 'training', 'authority', 'go-around', 'en', 'code-expected'],
  },

  // --- VAL-06: PT — PF/PM, erro de comunicação (A-F expected) ---
  {
    caseId: 'V03-VAL-06',
    title: 'Falha na comunicação entre comandante e copiloto na decolagem',
    group: 'validation',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'Durante a corrida de decolagem, o copiloto notou que a velocidade indicada no lado dele não coincidia com a do comandante. Ele mencionou o fato em voz baixa, mas o comandante estava focado nos instrumentos à frente e não processou o comentário. O copiloto não insistiu. A aeronave continuou a corrida com uma indicação de velocidade incorreta, rodou além do ponto calculado e decolou com margem reduzida em relação aos obstáculos no final da pista.',
    expected: { kind: 'code', axis: 'perception', code: 'P-H' },
    tags: ['pf-pm', 'communication', 'takeoff', 'airspeed', 'pt-BR', 'code-expected'],
  },

  // --- VAL-07: EN — violation-awareness boundary, pressure without awareness (abstention expected) ---
  {
    caseId: 'V03-VAL-07',
    title: 'Operational pressure led to procedural shortcut without conscious rule-breaking',
    group: 'validation',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'The flight was already forty minutes behind schedule due to a late inbound aircraft. The ground crew rushed the turnaround. The captain, feeling the time constraint, skipped the external walk-around inspection. The first officer did not object. Neither pilot explicitly thought about the operations manual requirement at that moment — their focus was on recovering the schedule. The aircraft departed with a maintenance panel unsecured, which detached during the climb and struck the horizontal stabilizer.',
    expected: { kind: 'abstention' },
    tags: ['violation-boundary', 'pressure', 'no-awareness', 'shortcut', 'en', 'abstention-expected'],
  },

  // --- VAL-08: PT — violation-awareness boundary, pressure without awareness (abstention expected) ---
  {
    caseId: 'V03-VAL-08',
    title: 'Pressa operacional leva a atalho sem decisão consciente de violar',
    group: 'validation',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O voo estava atrasado e a equipe de solo pressionava para uma saída rápida. O comandante, preocupado em não gerar mais atrasos na malha, autorizou a partida sem revisar o despacho técnico atualizado. Ele não pensou no procedimento de verificação obrigatória naquele instante — sua atenção estava totalmente voltada para cumprir o horário. A aeronave partiu com uma restrição de desempenho que não havia sido comunicada à tripulação.',
    expected: { kind: 'abstention' },
    tags: ['violation-boundary', 'pressure', 'no-awareness', 'dispatch', 'pt-BR', 'abstention-expected'],
  },

  // --- VAL-09: EN — no-failure (abstention expected) ---
  {
    caseId: 'V03-VAL-09',
    title: 'Routine flight with no anomalies',
    group: 'validation',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'The flight departed on schedule and climbed to cruising altitude without incident. The crew completed all checklist items as prescribed. Weather en route was as forecast. The descent and approach were conducted in visual conditions. The aircraft landed normally and taxied to the gate. The crew reported nothing unusual about the flight.',
    expected: { kind: 'abstention' },
    tags: ['no-failure', 'routine', 'normal', 'en', 'abstention-expected'],
  },

  // --- VAL-10: PT — no-failure (abstention expected) ---
  {
    caseId: 'V03-VAL-10',
    title: 'Voo tranquilo sem intercorrências',
    group: 'validation',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O voo transcorreu dentro da normalidade. A tripulação realizou todos os procedimentos previstos para cada fase. As condições meteorológicas estavam favoráveis em toda a rota. O pouso foi suave e dentro dos parâmetros operacionais. Nenhum passageiro ou tripulante relatou qualquer evento incomum durante o voo.',
    expected: { kind: 'abstention' },
    tags: ['no-failure', 'routine', 'normal', 'pt-BR', 'abstention-expected'],
  },

  // --- VAL-11: EN — consequence-as-cause trap (abstention expected with guardrail) ---
  {
    caseId: 'V03-VAL-11',
    title: 'Report describes the crash aftermath as if it explains the cause',
    group: 'validation',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'The aircraft broke apart when it struck the mountainside. There was a post-impact fire that destroyed most of the wreckage. The debris field extended for about two hundred meters along the slope. The flight data recorder was recovered but the last minutes of data were corrupted. The investigation could not determine with certainty what led the aircraft to be at that altitude in that location.',
    expected: { kind: 'abstention' },
    tags: ['consequence-as-cause', 'cfi', 'post-impact', 'insufficient', 'en', 'abstention-expected'],
  },

  // --- VAL-12: PT — consequence-as-cause trap (abstention expected with guardrail) ---
  {
    caseId: 'V03-VAL-12',
    title: 'Relato descreve consequência como se explicasse a causa',
    group: 'validation',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O acidente resultou na destruição total da aeronave e no falecimento de todos os ocupantes. A aeronave impactou o terreno em alta velocidade e o incêndio subsequente consumiu grande parte dos destroços. Os investigadores recuperaram parcialmente os gravadores de voo, mas os dados do segmento final estavam comprometidos. Permanece em aberto o que aconteceu nos momentos que antecederam o impacto.',
    expected: { kind: 'abstention' },
    tags: ['consequence-as-cause', 'cfi', 'post-impact', 'insufficient', 'pt-BR', 'abstention-expected'],
  },
]

export const holdoutCases: EngineV03ValidationCase[] = [
  // --- HLD-01: EN — offshore helicopter with organizational factors ---
  {
    caseId: 'V03-HLD-01',
    title: 'Offshore helicopter pressure from client schedule',
    group: 'holdout',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'The helicopter operator had a contractual obligation to complete a certain number of daily rotations to the platform. The weather on this particular day had been marginal all morning. Three previous flights had turned back. The fourth crew was briefed that the client was becoming impatient and that the platform manager had complained to the operations center. The crew decided to attempt the flight despite reports of worsening conditions ahead.',
    expected: { kind: 'code', axis: 'objective', code: 'O-C' },
    tags: ['offshore', 'helicopter', 'organizational', 'pressure', 'en', 'holdout'],
  },

  // --- HLD-02: PT — helicoptero offshore, decisão operacional sob pressão ---
  {
    caseId: 'V03-HLD-02',
    title: 'Helicóptero offshore com pressão contratual e condições ruins',
    group: 'holdout',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'A empresa operadora do helicóptero tinha um contrato com metas diárias de voos para as plataformas. Naquele dia, o teto estava baixo desde o começo da manhã e três saídas anteriores haviam retornado. O gerente de operações comunicou ao quarto comandante escalado que o cliente estava insatisfeito com as remessas perdidas e que a continuidade da campanha dependia do transporte daquele dia. A tripulação partiu apesar dos relatos de piora das condições.',
    expected: { kind: 'code', axis: 'objective', code: 'O-C' },
    tags: ['offshore', 'helicopter', 'organizational', 'pressure', 'pt-BR', 'holdout'],
  },

  // --- HLD-03: EN — A-A/A-C boundary, incorrect but not inadequate action ---
  {
    caseId: 'V03-HLD-03',
    title: 'Crew took action but it was the wrong corrective response',
    group: 'holdout',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'When the stall warning activated during the climb, the captain pulled back on the control column instead of pushing forward. The first officer recognized the incorrect response and called "push forward," but the captain maintained the back pressure. The aircraft entered a full stall and began to roll. The first officer took control and recovered the aircraft at a lower altitude.',
    expected: { kind: 'code', axis: 'action', code: 'A-B' },
    tags: ['A-A-A-C-boundary', 'stall', 'incorrect-response', 'recovery', 'en', 'holdout'],
  },

  // --- HLD-04: PT — fronteira A-A/A-C, resposta correta mas tardia ---
  {
    caseId: 'V03-HLD-04',
    title: 'Tripulação respondeu corretamente mas com atraso decisivo',
    group: 'holdout',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O alarme de proximidade do solo soou durante a aproximação noturna. O copiloto identificou o alerta e iniciou os procedimentos de arremetida. O comandante, que estava pilotando, hesitou por cerca de oito segundos antes de executar a manobra. Quando a subida foi iniciada, a aeronave já estava muito próxima do terreno e o sistema de alerta indicava uma trajetória de colisão iminente. A aeronave raspou a copa de árvores antes de conseguir ganhar altitude.',
    expected: { kind: 'code', axis: 'action', code: 'A-C' },
    tags: ['A-A-A-C-boundary', 'gpws', 'delayed-response', 'pt-BR', 'holdout'],
  },

  // --- HLD-05: EN — precondition as escape point trap ---
  {
    caseId: 'V03-HLD-05',
    title: 'Organizational rostering issue presented as primary cause',
    group: 'holdout',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'The crew had been on duty for eleven hours when the incident occurred. The company rostering system had assigned them a schedule that technically complied with flight time limitations but resulted in fragmented rest during the preceding twenty-four hours. The takeoff was normal, but during the climb the crew missed a level-off altitude and busted their clearance by fifteen hundred feet before the controller intervened. The operator attributed the incident solely to fatigue.',
    expected: { kind: 'abstention' },
    tags: ['precondition-as-escape', 'fatigue', 'rostering', 'level-bust', 'en', 'holdout'],
  },

  // --- HLD-06: PT — precondição apresentada como causa principal ---
  {
    caseId: 'V03-HLD-06',
    title: 'Treinamento deficiente apontado como explicação única para o evento',
    group: 'holdout',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'A companhia havia modificado o programa de treinamento em simulador seis meses antes do evento, reduzindo as sessões dedicadas a falhas de motor em decolagem. No dia do incidente, a tripulação enfrentou uma pane real de motor durante a corrida de decolagem. A decisão de continuar ou abortar foi tomada de forma hesitante e a aeronave saiu da pista durante a frenagem de emergência. O relatório da empresa concluiu que a causa foi exclusivamente a redução do treinamento.',
    expected: { kind: 'abstention' },
    tags: ['precondition-as-escape', 'training', 'engine-failure', 'rejected-takeoff', 'pt-BR', 'holdout'],
  },

  // --- HLD-07: EN — violation-awareness boundary, ambiguous awareness ---
  {
    caseId: 'V03-HLD-07',
    title: 'Crew debated the rule interpretation but were uncertain',
    group: 'holdout',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'The flight was dispatched under a minimum equipment list item that allowed operation with one generator inoperative. During the preflight briefing, the crew discussed whether the forecast weather at the destination, which included thunderstorms, changed the dispatch requirements. The first officer thought the MEL required all generators for thunderstorm penetration. The captain consulted the company operations manual and interpreted a note differently. After a few minutes of discussion, they agreed to operate the flight. The aircraft encountered severe turbulence and a dual generator failure at the destination.',
    expected: { kind: 'abstention' },
    tags: ['violation-boundary', 'ambiguous-awareness', 'mel', 'dispatch', 'en', 'holdout'],
  },

  // --- HLD-08: PT — fronteira de violação, consciência ambígua ---
  {
    caseId: 'V03-HLD-08',
    title: 'Tripulação discutiu a interpretação da regra sem conclusão clara',
    group: 'holdout',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O manual de operações exigia que, para aproximações com teto abaixo de duzentos pés, a tripulação tivesse completado um treinamento específico nos últimos seis meses. O comandante tinha feito o curso havia sete meses. O copiloto mencionou o requisito durante o briefing. O comandante argumentou que o mês de diferença era irrelevante para sua experiência. Não chegaram a um entendimento comum. A aproximação prosseguiu e o pouso foi concluído sem incidentes.',
    expected: { kind: 'abstention' },
    tags: ['violation-boundary', 'ambiguous-awareness', 'currency', 'approach', 'pt-BR', 'holdout'],
  },

  // --- HLD-09: EN — A-A/A-C boundary, safe response ---
  {
    caseId: 'V03-HLD-09',
    title: 'Timely go-around prevented unstable approach accident',
    group: 'holdout',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'The approach was stable until about eight hundred feet, when a sudden wind shift increased the tailwind component beyond the aircraft limit. The first officer monitoring the instruments called out the wind change immediately. The captain initiated a go-around within seconds of the call. The aircraft climbed away safely and positioned for a second approach, which was completed without further issues.',
    expected: { kind: 'code', axis: 'action', code: 'A-A' },
    tags: ['A-A-A-C-boundary', 'go-around', 'wind-shear', 'safe-response', 'en', 'holdout'],
  },

  // --- HLD-10: PT — no-failure, resposta correta a evento externo ---
  {
    caseId: 'V03-HLD-10',
    title: 'Tripulação respondeu corretamente a fechamento de pista',
    group: 'holdout',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'Durante a aproximação final, a torre informou que a pista designada havia sido fechada por causa de um veículo de inspeção que entrou sem autorização. A tripulação interrompeu a aproximação, seguiu as instruções do controlador para uma espera e reprogramou o sistema de navegação para a pista alternativa. O voo pousou sem novidades após vinte minutos de espera.',
    expected: { kind: 'code', axis: 'action', code: 'A-A' },
    tags: ['no-failure', 'go-around', 'runway-closure', 'correct-response', 'pt-BR', 'holdout'],
  },

  // --- HLD-11: EN — consequence-as-cause with post-escape evidence ---
  {
    caseId: 'V03-HLD-11',
    title: 'Engine failure after bird strike used to explain crew decision',
    group: 'holdout',
    locale: 'en',
    sourceType: 'synthetic',
    narrative:
      'Shortly after takeoff, the aircraft flew through a flock of birds and the right engine lost power. The crew declared an emergency and began a turn back toward the airport. During the turn, the aircraft lost altitude and struck the ground in a residential area. The investigation focused on the bird strike as the initiating event. The report does not analyze whether the decision to turn back, the altitude management during the turn, or the configuration of the remaining engine contributed to the outcome.',
    expected: { kind: 'abstention' },
    tags: ['consequence-as-cause', 'bird-strike', 'engine-failure', 'turn-back', 'en', 'holdout'],
  },

  // --- HLD-12: PT — evidência insuficiente com múltiplos fatores ---
  {
    caseId: 'V03-HLD-12',
    title: 'Múltiplos fatores contribuintes sem predominância clara',
    group: 'holdout',
    locale: 'pt-BR',
    sourceType: 'synthetic',
    narrative:
      'O evento envolveu uma combinação de fatores: o controlador em treinamento, o supervisor distraído com outra coordenação, o piloto com fone de ouvido com volume baixo e uma frequência de rádio com interferência intermitente. A aeronave cruzou uma interseção sem autorização enquanto outra aeronave se aproximava. O relatório lista todos esses elementos, mas não estabelece qual foi determinante ou em que ordem os eventos ocorreram.',
    expected: { kind: 'abstention' },
    tags: ['evidence-insufficient', 'multi-factor', 'atc', 'communication', 'pt-BR', 'holdout'],
  },
]

export const allV03Cases: EngineV03ValidationCase[] = [
  ...calibrationCases,
  ...validationCases,
  ...holdoutCases,
]

export function casesByGroup(group: 'calibration' | 'validation' | 'holdout'): EngineV03ValidationCase[] {
  return allV03Cases.filter((c) => c.group === group)
}
