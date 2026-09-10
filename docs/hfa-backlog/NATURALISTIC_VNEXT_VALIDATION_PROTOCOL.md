# SERA vNext — Protocolo de Validação Naturalística

**Status**: `ENGINE_NATURALISTIC_VALIDATION_NOT_READY`
**Criado em**: 2026-09-10
**Restrição ativa**: `SHADOW_FLAGS_OFF` | `NO_PRODUCTION_VALIDATION`

---

## Estado atual

O gate naturalístico do SERA vNext está em `NOT_READY`.

**Não converter para PASS artificialmente.**

## Separação de validações

| Tipo | Descrição | Estado |
|------|-----------|--------|
| Validação técnica | Tests determinísticos do CI (159 casos) | `CI_PASS` |
| Validação científica | Cobertura canônica da árvore de travessia | Em progresso |
| Validação humana | Avaliadores humanos comparando legado vs vNext | `NOT_STARTED` |
| Autorização de produto | Decisão de promoção para produção | `NOT_AUTHORIZED` |

## O que é "validação naturalística"

Validação em que avaliadores humanos (pilotos, tripulantes, investigadores) usam o sistema
vNext para analisar eventos reais e avaliam se:
1. As perguntas da árvore de decisão são claras e contextualmente adequadas
2. As classificações P/O/A resultantes correspondem ao julgamento humano
3. Os casos de borda (ambiguidade, UNRESOLVED) são tratados corretamente
4. O sistema não força classificações onde evidência é insuficiente

## Protocolo proposto (rascunho — requer aprovação autoral)

### Fase A — Preparação
1. Definir conjunto de casos de calibração (eventos com classificação humana conhecida)
2. Confirmar que cada caso tem escape point definido
3. Criar protocolo de instruções para avaliadores
4. Obter aprovação ética/metodológica para envolver avaliadores humanos

### Fase B — Piloto técnico
1. Executar vNext nos casos de calibração (environment staging/dev)
2. Comparar output vNext vs classificação humana de referência
3. Calcular concordância por código e por eixo

### Fase C — Validação humana
1. Avaliadores usam o sistema sem ver a classificação de referência
2. Comparar independentemente com o output do vNext
3. Calcular métricas de concordância (Cohen's Kappa ou equivalente)

### Fase D — Decisão
1. Definir threshold mínimo de concordância para promoção
2. Revisão metodológica do autor
3. Autorização formal de produto

## Restrições

- `SHADOW_FLAGS_OFF`: shadow mode permanece OFF durante toda preparação
- `NO_PRODUCTION_VALIDATION`: todas as fases em dev/staging
- `NOT_READY` permanece até decisão formal no Passo 4D

## Próximos passos (humanos)

1. Aprovar rascunho do protocolo
2. Definir conjunto de casos de calibração
3. Obter avaliadores qualificados
4. Configurar ambiente staging para piloto técnico
