# Mapa Comparativo dos Motores (Legado × vNext × Fontes)

`Produção atual` = comportamento efetivo com as flags default (vNext canônico **off**), ou seja,
o **legado**.

| Função metodológica | Fonte canônica | Legado (`lib/sera`) | vNext (`lib/sera-vnext`) | Produção atual | Divergência | Impacto |
|---|---|---|---|---|---|---|
| Perguntas canônicas SERA | Hendy STEP 2–5 | Não percorre; LLM+keyword | Árvore canônica `sera-pt-v1` | Legado (não canônico) | **Alta** | F-02 (violação de lock) |
| Sequência decisória (ladders) | Hendy Fig.5 | Ausente | `traverse-tree`/`run-evidence-traversal` | Legado | Alta | F-02 |
| Escape point ("quando…") | Hendy STEP1 + lock | `safe_operation_escape_point` textual | `escape-point-enforcement` estruturado | Legado (parcial) | Média | — |
| P/O/A no escape point | A4R137 | Não garante | Sim (gated) | Legado | Média | — |
| Múltiplos fatores/atos | Hendy p.71 | Códigos únicos por eixo | Estrutura multi-ator/mixed | Legado (limitado) | Média | multifatorialidade |
| Evidência ligada à classificação | Auditoria 3.4 | Parcial (evidencia_no_relato) | `evidence`/`evidenceForEach` por eixo | Legado (parcial) | Média | rastreabilidade |
| Incerteza / `UNRESOLVED` | Lock L-02 | **Nunca** emite | `UNRESOLVED`/`INSUFFICIENT_EVIDENCE` | Legado (ausente) | **Alta** | F-03 |
| Fallback `P-A/O-A/A-A` | — | **Sim** (na ausência) | Não (fica UNRESOLVED) | Legado | **Alta** | F-03 |
| Fatores fora da taxonomia | Auditoria 3.6 | Não suporta | `UNKNOWN_OR_UNCATEGORIZED` (evidence category) | Legado | Média | — |
| Classificação por IA | Auditoria 3.8 | LLM é base primária | LLM opcional; codes só por humano | Legado | Alta | F-13 |
| Validação humana | Auditoria 3.8 | Não gated (edições pós-fato) | `humanReviewRequired`, decision gate | Legado | Alta | F-13 |
| Versionamento (motor/taxonomia) | Auditoria 3.5 | `motor_version` só | `engineVersion`, `taxonomyVersion`, `canonical_tree_version` | Legado (parcial) | Média | — |
| Rastreabilidade de código | Auditoria 3.5 | Limitada | `code-traceability` (derivationPath) | Legado (parcial) | Média | — |
| Atualização/revisão | Auditoria 3.5 | `analysis_edits` | revisions + reviews + audit events | Legado (parcial) | Baixa | — |
| Relatórios | Auditoria 8.2 | `pdf-report`, flow-renderer | `build-reviewer-output` | Legado | Média | F-14 |
| Indicadores ERC/risco | Hendy p.33 | Gera ERC/HFACS/risco (heurístico) | **Locked** (sem risco/HFACS/recomendações) | Legado gera | **Alta** | F-04/F-05/L-07 |

## Observações-chave (reproduzidas)

1. **Filosofias opostas de commit.** vNext (experimento `EXP-VNEXT-01`) nunca fecha um eixo sem
   humano; legado sempre fecha. Ver [04-execucao-paralela.md](04-execucao-paralela.md).
2. **vNext não substitui o legado como classificador automático.** Ele é um estruturador +
   gate de decisão humana; adotá-lo redefine o produto.
3. **vNext respeita os locks L-05/L-06/L-07** (O-E proibido, proposedCode≠releasedCode, downstream
   locked); o legado **viola** L-01/L-02/L-07 na prática.

## Conclusão comparativa
Nenhum dos dois é "automaticamente correto". O **vNext é metodologicamente fiel** mas **não
produz classificação automática** (candidate-only, human-gated). O **legado produz classificação
automática** mas **não é metodologicamente fiel** (sem perguntas canônicas, sem incerteza, com
índices de risco não fundamentados). A escolha de D1 é entre **fidelidade+humano** e
**automação+risco metodológico** — não entre dois classificadores equivalentes.
