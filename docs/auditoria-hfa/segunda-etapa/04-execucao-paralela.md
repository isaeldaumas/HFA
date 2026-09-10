# Execução Paralela Controlada (área isolada)

Experimentos rodados fora da suíte oficial, em `scratchpad`, sem alterar produção.

## Limitação de ambiente
- O **motor legado** requer chamada a LLM (runStep1..6_7). Sem chaves de provider, não roda
  ponta a ponta; suas funções `infer*` são **module-internal** (não exportadas), então o
  comportamento de fallback foi verificado por **leitura direta de fonte** (fatos citados) e a
  divergência de ERC por **importação das funções exportadas** (`erc-divergence.ts`).
- O **motor vNext** é **determinístico** (funções puras) e foi executado (`vnext-experiment.ts`,
  `allowLlm:false`).

## Resultado — vNext (EXP-VNEXT-01)

| Caso | Resultado esperado (metodológico) | Legado (por fonte) | vNext (executado) | Concordância | Explicação |
|---|---|---|---|---|---|
| CASE-15 sem evidência | UNRESOLVED nos 3 eixos | **P-A/O-A/A-A** (fallback) | **UNRESOLVED**/INSUFFICIENT, humanReview | Divergem | vNext preserva incerteza; legado força "sem falha" |
| CASE-22 léxico enganoso ("complacência" mas evidência = informação ilusória) | não deixar a palavra decidir; tender a P-F | keyword "complacencia" ⇒ **P-G** (`pipeline.ts:274`) | **UNRESOLVED** (exige humano) | Divergem | legado é vulnerável a palavra-chave enganosa; vNext não decide sozinho |
| CASE-01 simples (atenção) | P de atenção plausível, O-A, ação conforme | classificaria automaticamente | **UNRESOLVED** (exige humano) | Divergem | vNext não auto-classifica nem casos claros |

**Interpretação:** confirma F-03 e o achado central de que os motores têm filosofias opostas.
No CASE-22, o legado é demonstravelmente suscetível ao "vocabulário enganoso" (a palavra
"complacência" dispara P-G por substring, ignorando a evidência contrária) — exatamente o risco
descrito no caso de referência #22.

## Resultado — divergência ERC (EXP-ERC-01)

Ver [05-auditoria-erc.md](05-auditoria-erc.md). Para os mesmos códigos, card e trend divergem
(reproduzido).

## Nota metodológica
O vNext **não** foi tratado como "verdade automática": ele foi comparado ao **resultado
metodológico previamente definido**. O fato de o vNext devolver UNRESOLVED até para o caso simples
é, à luz das fontes, **conservador e correto** para um motor candidate-only sem input humano —
mas significa que, como classificador autônomo, ele **não entrega classificação** (relevante para
D1). O legado entrega classificação, porém com os defeitos F-02/F-03.

## Reprodutibilidade
- `scratchpad/vnext-experiment.ts` — 3 casos, saída determinística.
- `scratchpad/erc-divergence.ts` — 5 combinações de código, divergência card×trend.
- Comandos: `npx tsx <arquivo>` a partir de `frontend/`. Saídas capturadas em `evidence-index.csv`.
