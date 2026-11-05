# HFA/SERA — Protocolo v21 de registro da revisão humana em corpus de desenvolvimento

**Data:** 2026-11-05
**Estado:** ferramenta de coleta de entrada humana, NÃO resultado de adjudicação, NÃO validação científica, NÃO avaliação cega.
**Corpo de prova permitido:** casos sintéticos V03-CAL e V03-VAL já expostos ao desenvolvimento. Excluídos: V03-HLD, V04_SEALED_001, relatos reais, tenants e produção.
**Fonte metodológica vigente:** SERA_ENGINE_VNEXT_METHODOLOGY_CONTROL_BOARD_A4R135_v0.2.0, com override A4R137, e fonte-mestra HFA_01.

## Objetivo

Uma parte significativa da calibração estava concentrada em relatórios de diagnóstico, sem canal estruturado para registrar quais decisões se apoiam em fatos verificáveis. A v21 cria um instrumento **de trabalho** para separar:

1. Texto original do caso sintético, por frase, com SHA-256 fixado ao relato completo;
2. Identificação explícita e justificada do ponto de fuga, inclusive opção NÃO RESOLVIDO;
3. Adjudicação **provisória** de Percepção, Objetivo e Ação com indicação da fonte, relação temporal e fundamento;
4. Declaração de limitações técnicas: entrada do revisor não constitui identificação/autenticidade comprovada, revisão independente ou liberação do motor.

Esta ferramenta NÃO pede nem infere o que o autor deve decidir. O JSON inicial tem os três eixos PENDING e nenhum código. O HTML também não contém códigos do motor, oráculos nem supostas respostas certas; ainda assim, o corpus V03 já foi exposto à engenharia e a revisão não é cientificamente cega.

## Gerar a ficha e a base estruturada

Na raiz do worktree isolado:

    ./frontend/node_modules/.bin/tsx tests/sera-vnext/dev-author-adjudication-contract.ts \
      --case V03-CAL-07 \
      --out /tmp/hfa-cal07-autor.json \
      --html /tmp/hfa-cal07-autor.html

Cada execução exige caminhos absolutos fora do repositório e novos nomes de saída para evitar sobrescrever registros. Os arquivos recebem permissão 0600 por padrão. A ficha HTML é autocontida, sem script, iframe ou dependência de rede.

## Validar um registro JSON editado pelo revisor

    ./frontend/node_modules/.bin/tsx tests/sera-vnext/dev-author-adjudication-contract.ts \
      --validate /tmp/hfa-cal07-autor.json

Para registrar entrada, preencher a referência do revisor e alterar reviewStatus para HUMAN_INPUT_RECORDED_NOT_VERIFIED. O revisor pode registrar uma decisão parcial, desde que justificada, sem obrigatoriedade de inventar código em eixos sem evidência. Estados de eixo: PENDING, UNRESOLVED, PROVISIONAL_CODE ou REJECT_ENGINE_CANDIDATE. A aceitação provisória de um código só passa no validador de **formato** se houver:

- Ponto de fuga aceito como candidato com referência a frase do relato;
- Código dentro da taxonomia ativa do eixo e pelo menos uma frase original citada;
- TemporalBasis PRE_OR_AT_ESCAPE ou RETROSPECTIVE_ABOUT_ESCAPE;
- Justificativa substantiva; caso a frase citada venha depois da âncora na ordem textual, **justificativa temporal explícita**;
- Referências SOURCE-Snnn existentes e texto/hash do caso sem alteração.

Uma frase posterior no documento pode se referir a um fato anterior. O validador exige fundamentação para esse caso, mas **não consegue verificar a verdade da afirmação do revisor**. Tampouco reconhece autenticação ou prova de autoria: o campo reviewerReference é apenas texto informado.

O retorno de um registro preenchido é HUMAN_INPUT_FORMAT_VALID_NOT_VERIFIED, mesmo quando há código inserido. O retorno declara explicitamente reviewerIdentityVerified=false, approvedForRuntime=false, releasedCodes=null, downstreamAllowed=false e independentScientificValidation=NOT_RUN.

## Caso prioritário CAL-07

O diagnóstico da v19 identificou o O-A adicional: a frase final de arremetida tardia gera uma inferência de objetivo no ponto de fuga, sensível ao vocabulário. A v21 não converte esse diagnóstico em decisão nem exibe o código O-A ao revisor na ficha. O objetivo é pedir evidência de **intenção naquele momento**, com reconhecimento expresso de quando a única frase disponível é uma recuperação posterior.

Não confundir respostas formais no instrumento com adjudicação metodológica completa. Na ausência de evidência de objetivo no ponto de fuga, manter UNRESOLVED como opção legítima e encaminhar a questão ao pesquisador responsável.

## Contratos automatizados

Tests: tests/sera-vnext/dev-author-adjudication-contract-trial-001.ts. Os controles incluem:

- Rejeição de V03-HLD/V04 e casos não cadastrados na coorte exposta;
- Imutabilidade do SHA-256 do relato, das frases de origem, metadados científicos e estrutura;
- Bloqueio de campos adicionais como releasedCode;
- Rejeição de O-E e de referências fictícias;
- Bloqueio de código se ponto de fuga não estiver aceito como candidato;
- Bloqueio de código apoiado em informação exclusivamente POST_ESCAPE_ONLY;
- Justificativa temporal obrigatória para fontes posteriores à âncora documental;
- Verificação de ausência de respostas do motor no HTML, sem script nem dependência externa.

## Governança

Não altera engine, taxonomia, oráculos ou fixtures. Não autentica reviewer nem cria registro remoto. Nenhuma decisão é escrita em banco de dados ou em arquivos do repositório. Não executa V04 selado. A PR #121 permanece DRAFT, sem merge/deploy. Outros agentes podem atuar em UI, upload ou segurança sem editar esses arquivos.
