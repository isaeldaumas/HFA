# HFA — Escopo operacional mínimo e calibração de desenvolvimento
Data de referência: 2026-11-05

## Decisão de execução

Concentrar o trabalho no motor SERA e no caminho mais curto para gerar dados de calibração sem exigir novas contas, caixa postal, SMTP, configuração externa ou custos. O código de recuperação de senha (PR #118) e convite de registro (PR #120) deve continuar segregado em DRAFT; nenhum deles é requisito para executar o motor determinístico offline.

O caminho mínimo disponível para desenvolvimento é:
1. Entrada textual de narrativa de evento, em ambiente local controlado e sem dados pessoais reais.
2. Cálculo de propostas por eixo Percepção/Objetivo/Ação pelo motor vNext candidato, com saída final bloqueada.
3. Diagnóstico de lacunas, abstenção, evidências, ponto de fuga e divergências esperadas.
4. Revisão humana posterior para decisões metodológicas. Não alterar taxonomia, perguntas ou locks automaticamente.

Este plano NÃO é autorização de acesso de usuários reais à produção, não valida o isolamento entre tenants, não habilita Shadow, nem aprova relatório científico.

## Ferramenta executada nesta etapa

Código: tests/sera-vnext/dev-calibration-workbench.ts

Comando no diretório raiz, após instalar as dependências do frontend:

    ./frontend/node_modules/.bin/tsx tests/sera-vnext/dev-calibration-workbench.ts --out /tmp/hfa-dev-calibration.json
    ./frontend/node_modules/.bin/tsx tests/sera-vnext/dev-calibration-workbench-trial-001.ts

- A ferramenta executa somente 24 narrativas sintéticas do corpus V03-CAL/V03-VAL, que já eram expostas ao desenvolvimento; não executa V03-HLD nem acessa fontes V04 seladas.
- Cada execução roda o motor candidato local e determinístico, com allowLlm=false e revisão humana requerida. Não efetua rede, login, migrations, escrita no banco nem alteração de flags.
- Resultados por caso: hash SHA-256 da narrativa, P/O/A individual, status, confiança, contagens de evidência e contraindicação, eventual evidência pós-ponto-de-fuga, expectativa original e divergências.
- Os relatórios são gravados exclusivamente fora da árvore versionada, com permissão 0600, sem texto integral das narrativas.
- O método de comparação V03 é conservado **somente como diagnóstico de regressão**; não se transforma a expectativa global de abstenção num rótulo humano independente para cada eixo.
- Um segundo código, fora do eixo esperado por V03, é evidenciado separadamente em pendingHumanReview. Não passa silenciosamente como conformidade metodológica de três eixos.
- Os bloqueios: no O-E, selectedCode=null, releasedCode=null, finalConclusion=null, classifiedOutput=false, readyPromotion=false, downstreamAllowed=false, revisão humana obrigatória, vedação de reutilizar evidência excluída pós-ponto-de-fuga.

### Primeira rodada de desenvolvimento

HEAD de referência do código inicial: main 9168beab5b2bcd7dcc060e4bdd221b939b4e78dd.

- 24 casos V03-CAL/V03-VAL: 24 correspondências com os oráculos parciais de desenvolvimento, nenhuma divergência desses oráculos.
- Um caso com código adicional não julgado independentemente pelo oráculo: V03-CAL-07, A-F esperado no eixo A e O-A proposto no eixo O. O-OA tem status de ausência de falha de objetivo (NO_FAILURE) e evidência inferida a partir de uma decisão de arremetida. **Não é automaticamente erro nem aprovação científica**; exige avaliação metodológica de P/O/A no ponto de fuga com fonte e adjudicação independente.
- Não alterar os oráculos nem treinar o motor apenas para elevar 24/24.
- O V03 usa expectativas de classificação parcial por caso; o V04 exige referência cega por eixo. Os 100% históricos do V03 não substituem o V04.
- Scientific validation: NOT_RUN. Gate: ENGINE_NATURALISTIC_VALIDATION_NOT_READY.
- CI regressão determinística inclui ensaio sintético da bancada, sem tratar MATCH como validação científica.

## Próxima etapa de calibração dentro do ambiente técnico

1. Revisar, em lote, casos com códigos adicionais não julgados ou evidência de baixo suporte; abrir decisões de adjudicação apenas como pendências, não modificar código sem referência autoral.
2. Construir um painel de comparação por eixo para corpus de desenvolvimento, depois submetê-lo a referências humanas externas quando houver disponibilidade.
3. Validar que o fluxo mínimo de registro e de análise HFA/SERA não libera outputs finais automáticos, preservando a separação entre registro de Safety e análise.
4. Quando forem fornecidos casos novos e avaliadores independentes, cumprir o protocolo V04: travar fontes/hash, avaliação humana cega, adjudicação, só depois execução do vNext e análise descritiva. O holdout V04_SEALED_001 não pode ser exposto neste ciclo.

## Melhoria explicitamente diferida: múltiplos anexos do evento

Objetivo de produto: permitir anexar e processar múltiplos arquivos distintos num único evento, mantendo a origem de cada evidência. Não deve bloquear o ciclo atual de calibração.

Diagnóstico do código:
- A tela events/new e o componente DocumentUpload trabalham com um único File.
- O POST /api/events recebe apenas o primeiro campo file; armazena um PDF/DOCX por evento. O fluxo Safety usa event_documents; o fluxo de análise HFA usa metadados de um único arquivo.
- /api/extract-document extrai texto de PDF textual e DOCX; ainda não implementa OCR, leitura de imagens ou DOC legado.
- Não confundir persistência do arquivo com extração/entendimento do seu conteúdo.

Critérios de aceite para a etapa posterior:
1. Upload de vários arquivos PDF, DOCX, texto UTF-8, PNG, JPG/JPEG e WebP, com estado e erro individuais. DOC legado requer conversão suportada e comprovada, não leitura simulada.
2. OCR/visão multimodal de imagens e PDFs digitalizados testado com arquivos representativos, sem inventar texto quando faltar capacidade. Extratos devem ser identificados como extração automática passível de correção humana.
3. Arquivos vinculados ao evento e tenant; hash, tipo identificado por assinatura, nome, origem, contagem/tamanho e texto extraído com referência de arquivo/página quando disponível.
4. Impedir perda silenciosa em upload parcial; garantir downloads autorizados e exclusão/retention coerentes com a política de evento e o direito de acesso.
5. Limites por tamanho total, tamanho por arquivo e quantidade; não confiar em extensão nem em MIME fornecido pelo navegador; política explícita de tratamento de dados confidenciais.
6. Testes de 3–5 anexos mistos, arquivos corrompidos, duplicados, páginas escaneadas, erro em um arquivo, tenant cruzado e usuário sem autorização. Nenhum documento vira código causal final sem revisão humana.

## Dependências externas adiadas

- PR #118, PR #120, SMTP, reset, email/convites, rate limit distribuído e anti-bot: não bloquear ferramentas de calibração offline.
- Produção Vercel deve ser investigada separadamente por causa do vínculo system-hfa/HFA versus isaeldaumas/HFA.
- Não executar merge, migrations, deploy de produção, alterações Auth Supabase, ativação de Shadow ou promoção científica sem autorização específica.

## Observação metodológica

Fonte mestra e locks: Hendy -> processo SERA, Daumas -> aplicação operacional MDC/SERA; perguntas canônicas e taxonomia são autoridade do autor. A ausência de evidência fica UNRESOLVED/INSUFFICIENT_EVIDENCE, nunca se converte por silêncio em P-A/O-A/A-A. O-C exige consciência, regra aplicável, desvio consciente e natureza não rotineira. A-C exige falha de ação após feedback. A-A não representa falha. O-E é inexistente. Evidência pós-ponto-de-fuga não redefine o mecanismo causal no ponto de fuga.

## Atualização técnica — bancada visual e rastreabilidade (v18)

A mesma ferramenta agora aceita saída HTML autossuficiente, sem login, scripts ou recursos externos:

    ./frontend/node_modules/.bin/tsx tests/sera-vnext/dev-calibration-workbench.ts --out /tmp/hfa-dev-calibration-v18.json --html /tmp/hfa-dev-calibration-v18.html

Abrir o HTML localmente. Ele mostra por caso: P/O/A, resultado parcial V03, excertos de evidências sintéticas, trilha canônica, razões bloqueantes e perguntas que o motor solicita. Esse relatório **não é cego** e nunca deve ser entregue aos avaliadores do V04. Os artefatos são gravados com abertura exclusiva e permissão restrita fora do repositório.

Resultados da rodada de baseline executada nesta worktree (ainda sujeitos ao CI):
- 24/24 casos sintéticos compatíveis com as expectativas parciais V03; 1 código adicional O-A não pontuado no CAL-07.
- 24/24 com NEEDS_CLARIFICATION; 9 pontos de fuga candidatos e 15 INSUFFICIENT_EVIDENCE.
- Motivos bloqueantes por caso: OBJECTIVE_EVIDENCE_INSUFFICIENT = 22, ACTION_EVIDENCE_INSUFFICIENT = 22, PERCEPTION_EVIDENCE_INSUFFICIENT = 19, ESCAPE_POINT_NOT_ESTABLISHED = 15. Razões coexistem.
- Inspeção de suporte textual **não literal** encontrou 14 formulações em 8 casos ao percorrer todos os trechos de evidência dos eixos. Não significa fabricação: abrange frases geradas/parafraseadas pelo motor e distingue dado primário e interpretação. Uma contagem exploratória anterior de quatro excertos por eixo e busca exata bruta encontrou 12; números e denominadores não são intercambiáveis.
- Detalhe do CAL-07: docs/hfa-backlog/CALIBRATION_V03_CAL07_TRACE_REVIEW_20261105.md.
- **Não** alterar oráculos nem gates para tornar a taxa de esclarecimento artificialmente menor; investigar se o corpus carece de fatos ou se existe bloqueio indevido.

## Atualização V19 — triagem temporal e sensibilidade ao contexto

- A bancada acrescenta vínculo da evidência de apoio à extração factual (id, índice da frase, origem e relação temporal) e destaca 6 referências de frases com índice posterior ao ponto de fuga em 4 casos.
- Nos 6 apoios a temporalidade é UNKNOWN. Uma frase posterior no documento pode narrar fato anterior; validar caso a caso.
- Teste offline de retirada de frases posteriores aplicado a 9 casos ancorados: somente CAL-07 mudou, pois O-A desapareceu, preservando A-F e ponto de fuga. Diagnóstico de sensibilidade, não prova de classificação incorreta.
- Não foram alterados runtime, oráculos, locks e conjunto selado.
- Documentação: docs/hfa-backlog/CALIBRATION_V19_TEMPORAL_PROVENANCE_20261105.md.

Comando: ./frontend/node_modules/.bin/tsx tests/sera-vnext/dev-calibration-workbench.ts --out /tmp/calibracao-v19.json --html /tmp/calibracao-v19.html
