# Plano de Validação

Objetivo: elevar a confiança metodológica do HFA a um nível que satisfaça os critérios de
aceitação da seção 9 da tarefa.

## 1. Decisões metodológicas a coletar (pré-requisito)

Registrar formalmente, no Methodology Control Board, decisão autoral sobre:

- **D1** — Motor de produção: promover vNext (candidate-only → released sob revisão humana) ou
  manter legado com rótulo explícito de "estimativa não canônica". (F-02/F-06)
- **D2** — Contrato de incerteza: pipeline de produção deve emitir `UNRESOLVED`/`HOLD`. (F-03)
- **D3** — ERC canônico: escala única + fonte/decisão que sustente (ou remoção do) índice de
  risco; caveat de amostra obrigatório. (F-04/F-05/F-10)
- **D4** — Reconciliação código↔rótulo↔eixo e divergência Hendy×Daumas. (F-07)

## 2. Casos de referência (blind test)

- Implementar os **30 casos** de `04-testes-metodologicos.md §3` como fixtures versionadas,
  independentes do código atual.
- Para cada caso, definir *a priori*: entrada, evidências, classificações aceitáveis/
  inaceitáveis, estados de incerteza, resultado persistido e esperado no relatório.
- Casos #13, #15, #22, #30 são os **testes de aceitação P0/P1** (UNRESOLVED, não-lexical,
  reconciliação numérica).

## 3. Revisão por especialistas e concordância entre avaliadores

- Recrutar ≥3 revisores humanos (o piloto já está bloqueado em `EXPANDED_COHORT_SINGLE_REVIEWER`;
  meta é REVIEWER-02/03 — ver plano em `docs/sera-vnext/human-reviewer-pilot/`).
- Medir concordância inter-avaliadores (Cohen/Fleiss κ) entre analistas e entre analista×motor.
- Comparação cega motor × análise humana nos 30 casos.

## 4. Métricas e critérios de aceitação

| Métrica | Critério |
|---|---|
| Casos de referência aprovados | 100% dos P0/P1 (#13,#15,#22,#30) |
| Emissão de UNRESOLVED em evidência insuficiente | 100% dos casos sem evidência |
| Reconciliação numérica card↔trend↔banco↔relatório | divergência = 0 |
| Isolamento de tenant (RLS + app) com JWT real | 12/12 cenários; 0 leak |
| Concordância inter-avaliadores | κ ≥ 0,6 (substancial) como piso |
| Rastreabilidade evidência→classificação | 100% das classificações com evidência ligada |
| Reprodutibilidade determinística (regras) | mesma entrada → mesma saída |

## 5. Amostra mínima

- Metodológica: os 30 casos de referência + os casos reais já adjudicados no Control Board.
- Risco operacional: **não** publicar perfil de risco como consolidado até amostra suficiente
  (Daumas: 4 eventos são insuficientes) — exibir sempre `data-confidence` + caveat.

## 6. Processo de regressão futura

- Adicionar os 30 casos ao `test-manifest.json` como `CONTRACT`/`UNIT` requeridos.
- Gate de CI: falha de qualquer caso P0/P1 bloqueia merge.
- Trial dedicado de reconciliação ERC e de emissão de UNRESOLVED.
- Trial `REAL_DB` de isolamento executado em staging a cada mudança de auth/RLS.

## 7. Registro de divergências

- Toda divergência motor×humano e card×trend deve ser registrada com evidência e encaminhada ao
  Control Board, nunca resolvida silenciosamente (regra da tarefa e da skill).
