# Congelamento do Motor Legado

## O que foi feito

Avisos de congelamento inline, no topo dos arquivos que implementam classificação/ERC do motor
legado:

- `frontend/src/lib/sera/pipeline.ts`
- `frontend/src/lib/sera/all-steps.ts`
- `frontend/src/lib/risk-profile/erc.ts`

Cada aviso proíbe explicitamente: novas perguntas/regras de classificação P/O/A, nova fórmula de
ERC, novos códigos de taxonomia hardcoded, e alteração silenciosa da semântica de prompts —
permitindo continuar correções de segurança/integridade/disponibilidade que não mudem semântica
metodológica.

Um teste-tripwire (`tests/hfa-audit/legacy-freeze/legacy-freeze-trial-001.ts`) fixa três
invariantes verificáveis automaticamente:
1. Os três arquivos acima declaram o aviso de congelamento (texto literal).
2. A matriz `ARMS_ERC` continua com exatamente 16 entradas (4 severidades × 4 barreiras).
3. Os conjuntos de códigos canônicos permanecem 8 (P), 4 (O), 10 (A).

Se qualquer PR futuro expandir a matriz ou os conjuntos de códigos, ou remover os avisos, este
teste falha.

## Achado durante a implementação: congelamento fragmentado pré-existente

Ao rodar a regressão oficial após tocar em `frontend/src/lib/sera/all-steps.ts` (só para
adicionar o comentário de aviso), **8 trials do manifesto oficial falharam**, todos pela mesma
causa: cada um faz `git diff --name-only`/`--cached` e afirma que `frontend/src/lib/sera/` (ou
especificamente `all-steps.ts`) **não aparece como alterado**. Esses testes vêm de fases
anteriores da governança vNext (A4R212, A4R213, A4R214, A4R216, A4R220,
`product-beta-integrity`, `human-pilot-preparation-integrity`, `risk-profile-integrity`) e cada
um foi originalmente escrito para congelar o estado do repositório **naquela fase específica**,
não como um mecanismo de congelamento unificado e contínuo.

**Isso não é uma regressão de comportamento** — é uma checagem de "diff zero" que qualquer
mudança não commitada nesses arquivos sempre dispara. Confirmamos que, após o commit desta etapa
(working tree limpo), os 8 trials voltam a passar (`09-testes-e-resultados.md`).

**Implicação para a governança:** o repositório já tinha, de forma implícita e fragmentada, um
conceito de "área protegida" equivalente ao que esta etapa formaliza — mas espalhado em ~8 testes
de fases distintas, sem um documento único de referência, e amarrado a um nome de migration
específico de uma fase (`20260608190000_risk_profile_exclusions.sql`), o que sugere que esses
guards ficaram obsoletos/orfãos assim que aquela fase terminou. Recomenda-se, como trabalho
futuro (fora do escopo autorizado aqui), consolidar esses guards fragmentados em um único
mecanismo de congelamento explícito e documentado — o que esta etapa começa a fazer com os
avisos inline + o teste-tripwire acima, mas sem remover os testes antigos (não estava autorizado
a alterar testes existentes de fases anteriores).

## O que NÃO foi feito
- Nenhuma linha de lógica de classificação foi alterada em `pipeline.ts`/`all-steps.ts` (só
  comentários + os novos campos de proveniência, que são metadados, não classificação).
- Nenhum teste pré-existente foi modificado para "passar" — os 8 trials afetados continuam
  intactos; eles simplesmente refletem corretamente o estado do working tree em cada momento.
