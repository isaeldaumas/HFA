# D4 — Plano de Harmonização de Taxonomia Versionada

**Status**: `D4_TAXONOMY_HUMAN_DECISION_REQUIRED`
**Criado em**: 2026-09-10
**Referência**: `docs/auditoria-hfa/segunda-etapa/09-decisao-d4-taxonomia.md`
                `docs/auditoria-hfa/terceira-etapa/07-taxonomia-versionada.md`

---

## Contexto

Existe fragmentação de código↔rótulo↔eixo em múltiplos arquivos:
- `frontend/src/lib/sera/failure-names.ts` (legado)
- `frontend/src/lib/sera/hfacs-mapper.ts`
- `frontend/src/lib/sera/canonical-codes.ts` (vNext)
- `frontend/src/lib/sera/canonical-tree.ts` (vNext)
- `supabase/migrations/20260707_sera_taxonomy_versioned.sql` (tabela criada, vazia — não populada remotamente)

## Locks ativos (inegociáveis)

| Lock | Descrição |
|------|-----------|
| `O-E` não existe | `NON_EXISTENT_IN_SERA_PT_V1` |
| P/O/A no escape point | Análise somente no momento do escape point |
| Pós-escape não redefine escape point | Eventos posteriores não alteram P/O/A |
| Ausência de evidência ≠ P-A/O-A/A-A | Insuficiência → UNRESOLVED/HOLD |
| A-A = ausência de action failure específica | Não confundir com "sem ação" |
| A-C = action failure após feedback | Distinto de A-G |
| Insuficiência → UNRESOLVED/HOLD | Não classificar onde não há evidência |

## Divergências registradas (pendentes de decisão autoral)

| Código | Divergência | Decisão necessária |
|--------|-------------|-------------------|
| P-D e P-G | Rótulo idêntico "Falha de Atenção" — perde distinção D/G | Rótulos distintivos |
| P-E e A-H | Rótulo idêntico "Falha no Gerenciamento do Tempo" — eixos diferentes | Rótulos distintivos |
| P-F | "Falha de Percepção" (legado) vs "Informação Ilusória/Ambígua" (Daumas) | Alinhar fonte |
| P-C → HFACS | Mapeado para "Decision Error" (cruzamento de eixo) | Confirmar ou revisar F-07 |
| A-E | "Knowledge (Decision) Failure" — eixo Ação (legado/Daumas) vs leitura de Hendy | Confirmar alocação |
| A-C vs A-G | Quase-duplicatas: "feedback da execução" vs "feedback" | Confirmar distinção semântica |

## Fontes em conflito

| Fonte | Eixo P | Eixo O | Eixo A |
|-------|--------|--------|--------|
| Hendy | 8 códigos | 4 códigos | 10 códigos |
| Daumas | usa Hendy com adaptações | idem | idem |
| Legado (`failure-names.ts`) | mapeamento parcialmente divergente | ok | algumas variantes |
| `canonical-codes.ts` vNext | Hendy + versionamento | ok | ok |

## Plano de harmonização (proposta técnica — requer aprovação autoral)

### Passo 1 (Decisão autoral): Resolver divergências
Para cada item da tabela de divergências acima, o autor decide:
- Rótulo canônico escolhido
- Fonte citada (Hendy, Daumas, legado)
- Se o mapeamento HFACS de P-C é legítimo

### Passo 2 (Técnico, após decisão): Popular `sera_taxonomy_entries`
- Inserir cada código com: `canonical_code`, `canonical_name`, `translated_name`, `axis`,
  `source_reference`, `methodology_version`, `taxonomy_version='1.0'`, `valid_from`
- NÃO usar o código atual como fonte de verdade — usar a decisão autoral

### Passo 3 (Técnico, após passo 2): Migrar consumidores
- `failure-names.ts` → ler de `sera_taxonomy_entries` via API
- `hfacs-mapper.ts` → derivado versionado, não definição paralela
- `canonical-codes.ts` → unificar com tabela

### Passo 4 (Técnico, após passo 3): Deprecar arquivos duplicados
- Remover duplicação código↔rótulo em 3+ arquivos

## Restrições ativas

- `NO_REMOTE_MIGRATION` — a migration de taxonomia NÃO foi aplicada remotamente
- `NO_TAXONOMY_POPULATION_WITHOUT_D4_DECISION` — não popular `sera_taxonomy_entries` sem decisão formal
- Tabela local existe e está vazia (conforme verificado na 3ª etapa)

## Próximo passo

Decisão autoral nos pontos 1-6 de `09-decisao-d4-taxonomia.md`.
Nenhum passo técnico deve ser executado antes.
