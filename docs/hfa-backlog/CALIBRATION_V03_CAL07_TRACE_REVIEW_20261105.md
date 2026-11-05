# HFA/SERA — Exame da rastreabilidade do caso sintético V03-CAL-07
Data: 2026-11-05
Estado: HIPÓTESES DE DESENVOLVIMENTO, SEM ADJUDICAÇÃO HUMANA
Corpus: V03-CAL-07 (exposto ao desenvolvimento; não elegível ao holdout cego)
Versão de referência: main @ 9168beab5b2bcd7dcc060e4bdd221b939b4e78dd

## Fatos efetivamente descritos no caso

Fonte: tests/sera-vnext/engine-validation-v03-naturalistic/cases.ts, V03-CAL-07.

1. Comandante é PF; copiloto é PM.
2. Aos 500 pés, PM informa que a aproximação não está estabilizada.
3. Comandante responde "checked" mas não inicia arremetida naquele momento.
4. PM presume que o comandante agirá.
5. A aeronave continua descendo abaixo da altura de estabilização.
6. O comandante finalmente comanda a arremetida; a demora culmina em pouso duro.

O caso sintético não fornece documento de SOP, fonte de gravação real, relato do PF sobre sua intenção ou evidência de habitualidade. O resultado (pouso duro) não deve, por si, ser importado como mecanismo causal do ponto de fuga.

## Saída observada na bancada offline

- O motor propõe no eixo A: A-F, conforme expectativa de desenvolvimento V03.
- O motor propõe adicionalmente no eixo O: O-A, com status NO_FAILURE; o oráculo V03 só pontua A-F e não verifica O-A.
- O motor inclui a formulação "The operator intended to execute a go-around." como apoio a O-A. Ela **não ocorre literalmente** na narrativa. Pode ser interpretação derivada de uma chamada posterior; não é intenção declarada pelo PF antes/no ponto de fuga.
- O motor informa NEEDS_CLARIFICATION, com nó de percepção P_ROOT sem resposta e evidência de percepção insuficiente.
- MATCH de V03 não prova adequação dos três eixos. Saídas finais permanecem bloqueadas.

## Critérios de avaliação, com origem metodológica

Fonte: docs/SERA_CODE_EVIDENCE_MATRIX.md.

| Hipótese | Critério positivo na matriz | Evidência do caso | Situação |
|---|---|---|---|
| A-F | Seleção incorreta entre procedimentos/ações disponíveis e conhecidos | O relato descreve não execução imediata e chamada tardia de arremetida, mas não descreve seleção de uma opção errada entre alternativas | REQUER ADJUDICAÇÃO |
| A-H | Erro de timing/sequenciamento interno, sem pressão de tempo externa explícita | A demora é relatada. Falta estabelecer se o momento correto era obrigatório pela regra aplicável e se a causa era seleção ou temporização | HIPÓTESE A EXAMINAR |
| O-A | Ausência de intenção desviante, com objetivo nominal apoiado em evidência positiva | Não há relato expresso da intenção do PF no primeiro aviso. A menção à intenção de arremeter é derivada | NÃO CONFIRMADO |
| O-C | Violação consciente, excepcional e não rotineira de regra/procedimento conhecido | A chamada de aproximação não estabilizada pode apontar ciência de condição insegura, mas não comprova sozinha todos os requisitos de O-C | NÃO INFERIR |
| P | Percepção e informações disponíveis no ponto de fuga | PM fez chamada; o que PF acreditava e compreendeu não está estabelecido | ESCLARECIMENTO P_ROOT |

Não mudar automaticamente A-F para A-H nem O-A para O-C. Não acrescentar rótulos ao oráculo V03 exposto para simular validação. A escolha depende de fonte operacional e decisão autoral, podendo terminar em UNRESOLVED.

## Questões de calibração para o investigador

1. Qual o ponto de fuga: decisão de continuar após callout, não execução de arremetida ou outro ato?
2. Qual era o procedimento obrigatório de aproximação estabilizada e qual altura/condição objetiva para arremetida?
3. O PF entendeu a chamada e escolheu continuar deliberadamente, ou houve atraso na tradução de intenção em ação? O relato distingue essas alternativas?
4. Havia evidência anterior ao ponto de fuga sobre intenção, compreensão, percepção e opções do PF?
5. Qual a função de PM no callout e qual o limite de responsabilidade causal de cada tripulante no ato selecionado?
6. É possível sustentar A-F ou A-H sem recorrer à gravidade do resultado posterior ao ponto de fuga?

## Gates

- Natureza: caso sintético previamente exposto. Nenhuma evidência científica nova.
- Sem labels humanos independentes. Sem alteração de taxa de acerto, taxonomia, runtime ou baseline.
- ENGINE_NATURALISTIC_VALIDATION_NOT_READY permanece.
- Shadow OFF, sem merge/deploy/produção.
