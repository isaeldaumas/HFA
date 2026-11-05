# HFA/SERA — V19: rastreabilidade e sensibilidade temporal no corpus exposto

Data: 2026-11-05
Estado: DIAGNÓSTICO DE DESENVOLVIMENTO, não validação científica nem adjudicação autoral.
Baseline de comparação: main 9168beab5b2bcd7dcc060e4bdd221b939b4e78dd
Corpus: V03-CAL + V03-VAL, 24 casos sintéticos expostos; NÃO executar V03-HLD/V04_SEALED_001.

## Pergunta investigada

A correspondência com o oráculo parcial V03 (24/24) pode encobrir suporte P/O/A derivado do contexto textual posterior à primeira saída da operação segura? Existem trechos de suporte sem vínculo exato ao registro de evidência de entrada?

## Triagem de proveniência por item

A bancada associa cada trecho de apoio a uma entrada factual do mesmo texto, quando houver. Expõe evidenceId, sourceSentenceIndex, temporalRelation, collectionSource, sourceSection e assertionStatus. Ausência de correspondência exata não implica falsidade.

- 14 formulações em 8 casos NÃO são substrings literais normalizadas da narrativa.
- As mesmas 14 não possuem correspondência exata de statement nos itens de factualExtraction.evidence da execução. Esse critério não cobre paráfrases legitimamente sustentadas por outros trechos.
- 6 itens de apoio aparecem em frases com índice documental maior que a frase do ponto de fuga; ocorrem em 4 casos: V03-CAL-07, V03-CAL-11, V03-VAL-03, V03-VAL-06.
- Nenhum dos 6 apresenta metadados temporais POST_ESCAPE; todos os identificados foram marcados UNKNOWN. Metadado UNKNOWN não é evidência pré-escape. Frase posterior no documento também não prova fato posterior no evento.

O gate anterior que compara apoios com excludedPostEscapeEvidence permanece verde. Como a lista de exclusão pode ficar vazia apesar de referências posteriores, não interpretar o PASS isolado como ausência comprovada de contaminação temporal.

## Ablação exploratória do texto posterior

Em 9 casos cujo ponto de fuga foi identificado antes da última frase, foi criada uma variante sintética com apenas os registros até a frase do ponto de fuga, inclusive. O motor rodou offline, allowLlm=false, CANDIDATE_ONLY, outputs finais bloqueados.

- 8/9: códigos P/O/A inalterados com o truncamento.
- 1/9: no V03-CAL-07, O-A (NO_FAILURE) deixou de ser proposto ao remover as frases posteriores; A-F permaneceu.
- O ponto de fuga do V03-CAL-07 permaneceu CANDIDATE no original e no truncamento.
- Corpus, rótulo original e runtime permaneceram inalterados.

Isso aponta dependência do contexto textual posterior, mas não demonstra por si só erro. A retirada pode apagar uma referência retrospectiva legítima à intenção anterior. Diferenciar fato posterior que esclarece estado anterior de consequência que retrojustifica causa.

## V03-CAL-07: questão central

- PM comunica aproximação não estabilizada a 500 ft; PF reconhece mas não arremete.
- Posteriormente, PF finalmente chama a arremetida; há pouso duro.
- A saída O-A utiliza a formulação de apoio "The operator intended to execute a go-around.", ausente literalmente no relato.
- O-A só aparece com a narrativa completa, contendo a arremetida tardia.

Questão: é defensável inferir objetivo nominal no ponto de fuga a partir de uma chamada posterior de arremetida, sem relato direto da intenção do PF naquele momento? A matriz SERA exige evidência positiva de O-A; ausência não autoriza código nominal. Depende de adjudicação metodológica e fonte operacional.

A-F x A-H também permanece não resolvido: a narrativa enfatiza atraso/omissão; a matriz descreve A-F como escolha incorreta entre alternativas conhecidas e A-H como problema de temporização. Sem SOP aplicável e informação sobre percepção, objetivo e ação do PF, não trocar códigos por heurística.

## Critérios para eventual correção do runtime — não executada aqui

1. Distinguir ordem da frase, tempo factual, tipo de fonte e relação com a primeira saída segura.
2. Admitir fato posterior como suporte de intenção anterior apenas com vínculo verificável e sem inferência circular; separar retrospectiva de consequência.
3. Tratar temporalRelation=UNKNOWN como incerteza, não como confirmação de pré-escape.
4. Investigar o mecanismo de influência de contexto posterior em O-A no CAL-07 antes de qualquer patch.
5. Testar outras narrativas sintéticas e casos reais autorizados; não fazer sobreajuste para CAL-07.
6. Nunca alterar oráculos, taxonomia ou locks só para preservar 24/24.

## Governança

- Motor, oráculos, Shadow e fonte oficial não modificados.
- Nenhuma chamada externa, conta real, merge ou deploy.
- V04 selado não executado; campanha selada atual não corresponde à árvore do runtime.
- Relatório HTML exibe códigos do motor e não é instrumento de revisão cega.
- Gate permanece ENGINE_NATURALISTIC_VALIDATION_NOT_READY.

## Contrastes sintéticos controlados CAL-07 (segunda rodada)

Runner reproduzível: tests/sera-vnext/dev-calibration-cal07-contrast-trial-001.ts.

O relato até a frase da primeira não-arremetida do PF permanece idêntico em todas as variantes. Varia somente a frase acrescentada depois. Não são casos de validação independentes: todos derivam de um caso já exposto ao desenvolvimento.

| Variante | Modificação após o ponto de fuga | Resultado O | Resultado A |
|---|---|---|---|
| FULL_ORIGINAL | Narrativa sintética integral | O-A | A-F |
| PREFIX_TO_ANCHOR | Removidos todos os fatos textuais posteriores | sem código | A-F |
| LATER_GO_AROUND_ONLY | Adicionada informação que o comandante FINALMENTE chamou a arremetida | O-A | A-F |
| LATER_OUTCOME_ONLY | Adicionada somente consequência/dano após o evento | sem código | A-F |
| LATER_GO_AROUND_NEUTRAL | Adicionada informação neutra de que houve chamada de arremetida depois | sem código | A-F |
| LATER_INTENDED_GO_AROUND | Adicionada frase explicando intenção posterior e atraso | sem código | A-F |
| LATER_PM_TESTIMONY | Adicionado depoimento posterior do PM sobre a intenção do comandante | sem código | A-F |

Todas as variantes permaneceram com escapePoint.status=CANDIDATE e outputs finais bloqueados.

A diferença entre "finally called for the go-around" e "later called for a go-around" com a mesma sequência anterior sugere sensibilidade textual/lexical específica da regra atual. Isso é **evidência de fragilidade de generalização candidata**, não prova de que O-A seja necessariamente errado. Sem adjudicação do estado objetivo do PF no ponto de fuga, NÃO criar teste que force o motor a manter O-A em produção.

O runner trava os bloqueios de publicação e apenas emite observações; não compara resultados com um novo oráculo autoral inventado. Mudanças futuras devem ser avaliadas por evidência e pela matriz canônica, não pela preservação de outputs observados.
