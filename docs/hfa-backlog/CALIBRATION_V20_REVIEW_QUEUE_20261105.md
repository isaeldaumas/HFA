# HFA/SERA — Fila técnica de revisão metodológica v20

Data: 2026-11-05. **Apenas desenvolvimento offline de 24 casos sintéticos V03 já expostos**. Não é validação científica, não altera oráculos, taxonomia, motor nem produção.

## Critério de prioridade

Os 24/24 MATCH com os oráculos parciais V03 não demonstram validade independente dos três eixos. A bancada identificou um código O-A adicional não julgado, frases de apoio sem vínculo textual direto, suporte posterior à âncora na ordem do documento e lacunas de informação.

Priorizar revisão não é classificar risco: **P1/P2/P3 não estimam probabilidade de erro e não implicam diagnóstico automático**.

| Classe | Gatilho técnico | Casos | Trabalho necessário |
|---|---|---:|---|
| P1 — Adjudicação metodológica | Código adicional sem oráculo por eixo OU sensibilidade de código à retirada de texto posterior | 1 | Revisar O-A x O-C e A-F x A-H segundo as regras canônicas |
| P2 — Origem e temporalidade | Evidência textual depois da âncora no documento OU frase sem vínculo literal a registro factual | 7 | Separar dado, interpretação, sequência factual e ator |
| P3 — Lacunas documentais | Restantes, com ponto de fuga ou evidências insuficientes | 16 | Avaliar esclarecimentos necessários sem completar por suposição |

**P1:** V03-CAL-07. O código O-A aparece fora do eixo verificado pelo oráculo e desaparece quando as frases posteriores ao ponto de fuga são retiradas; o código A-F permanece. Isso sinaliza sensibilidade ao contexto e exige adjudicação autoral.

## Implementação e validação

- Bancada: tests/sera-vnext/dev-calibration-workbench.ts — campos reviewQueue, reviewQueueTierCounts e reviewQueuePolicy.
- Relatório local: tests/sera-vnext/dev-calibration-html.ts — fila com referências internas para os 24 cartões.
- Testes: tests/sera-vnext/dev-calibration-workbench-trial-001.ts — ordenação, distribuição, bloqueios científicos e ausência de alterações automáticas.
- Comando: ./frontend/node_modules/.bin/tsx tests/sera-vnext/dev-calibration-workbench.ts --out /tmp/hfa-calibration-v20.json --html /tmp/hfa-calibration-v20.html

Não ler V04 selado. Não oferecer o relatório, que mostra códigos do motor, a avaliadores cegos. Não reduzir artificialmente o número de NEEDS_CLARIFICATION. A elaboração de um patch metodológico exige justificativa com fontes primárias e comparação de casos independentes.

## Sequência segura de trabalho

Investigar temporalidade e suporte de O_ROOT; revisar falsos bloqueios das perguntas canônicas; preservar regras autorais e documentação. A melhoria de upload múltiplo e OCR permanece na issue #122. Segurança, SMTP e produção permanecem frente separada.

**Gates:** ENGINE_NATURALISTIC_VALIDATION_NOT_READY, Shadow OFF, produção não autorizada, PR #121 em rascunho sem merge ou deploy.
