# HFA — Estratégia Comercial e Expansão Safety v1.0

**Data:** 2026-10-02
**Status:** decisão de produto + implantação comercial inicial
**Direção:** especializar primeiro; ampliar depois sem diluir o diferencial metodológico.

## 1. Decisão de produto

O HFA não deve tentar nascer como mais um SGSO genérico. A entrada no mercado será por uma capacidade de alta diferenciação: investigação estruturada de fatores humanos com SERA, evidência rastreável, revisão humana e inteligência organizacional.

A expansão ocorrerá em camadas:

1. **HFA Investigate** — fatores humanos e investigação profunda.
2. **HFA Events** — relato, triagem e ciclo do evento, inclusive eventos sem fator humano confirmado.
3. **HFA Risk** — perigos, risco inicial/residual, controles e registro de risco.
4. **HFA Actions** — CAPA, responsáveis, prazos e verificação de eficácia.
5. **HFA Intelligence** — padrões recorrentes, SPIs, tendências, eventos similares e briefing executivo.
6. **HFA Change** — Management of Change, somente após a base operacional estar madura.

Auditorias, LMS, treinamento, escala, qualificação e FRMS não devem ser reconstruídos no HFA enquanto o AirTrust já possuir essas capacidades.

## 2. Benchmark de mercado

### AviSMS
- assinatura por organização, todos os módulos e usuários ilimitados;
- trial completo de 60 dias sem cartão;
- ocorrência, investigação, trends, risk register, audits/findings, documents e safety promotion;
- IA como assistente: rascunha, mas uma pessoa aceita antes de virar registro;
- não cobra por assento, explicitamente para não criar incentivo contra o relato.

### SafetyManager365 / iQSMS
- suíte modular de Safety, Quality e Risk;
- reporting, risk management e quality como núcleo;
- reporting offline e sincronização;
- AI Co-Analyst para identificação de hazards, correlações e tendências em grandes volumes de relatos;
- integração entre produtos e dados como parte central da proposta.

### Ideagen Aviation Safety
- reporting, hazards, risk, investigation, CAPA, audits e analytics conectados;
- busca semântica de eventos similares, resumos e apoio de IA;
- acompanhamento da ação até verificação e encerramento.

### SMS Pro
- issue reporting, risk, corrective actions, audit, performance monitoring, documentos e lessons learned;
- evento tratado como work-item com responsáveis, prazos, revisão e fechamento.

## 3. O que o AirTrust já oferece

A inspeção do repositório operacional do AirTrust mostrou uma base SGSO relevante:

- RELPREV offline-first, confidencial/anônimo/identificado e sincronização;
- triagem, workflow, responsáveis e SLA;
- matriz de risco ICAO 5×5;
- Bowtie e estado de barreiras;
- FRAT com aprovação/escalation e ligação com fadiga;
- CAPA, não conformidades e auditorias;
- SPIs, tendências e indicadores leading/lagging;
- Management of Change e lessons learned no backend;
- contexto operacional nativo: funcionário, treinamento, qualificação, escala, aeronave e FRMS.

A maturidade não é homogênea: existem superfícies ainda marcadas como desenvolvimento/dados de teste. Portanto, a integração deve reaproveitar capacidades comprovadas sem assumir que todo o SGSO do AirTrust já é produto final fechado.

## 4. Regra arquitetural

**Não fundir os dois repositórios.**

- AirTrust continua sendo o sistema operacional integrado da Costa do Sol e de clientes que desejem a suíte completa.
- HFA continua standalone e comercializável independentemente.
- HFA expõe capacidades de investigação/inteligência por API.
- AirTrust consome HFA como serviço especializado quando um evento exigir análise de fatores humanos.
- No futuro, a mesma API pode ser oferecida a outros SGSO/SMS de terceiros.

## 5. Fluxo-alvo de Safety

O relato não deve consumir crédito nem disparar automaticamente uma análise HFA.

```text
Relato / evento
    ↓
Triagem e classificação
    ↓
Avaliação de risco
    ↓
Escolha do tratamento
    ├─ registro/monitoramento
    ├─ investigação geral
    └─ análise HFA profunda
           ↓
      revisão humana
           ↓
Ações / CAPA
    ↓
Risco residual e eficácia
    ↓
Encerramento / lições aprendidas
    ↓
Inteligência organizacional / SPIs / tendências
```

**Princípio comercial:** usuários e relatos devem ser ilimitados. O consumo deve estar associado à capacidade analítica profunda, não ao ato de reportar.

## 6. Integração AirTrust → HFA

1. Investigador abre um relato SGSO no AirTrust.
2. Aciona **Analisar fatores humanos no HFA** quando aplicável.
3. AirTrust envia somente evidências autorizadas e a proveniência de cada dado.
4. Contexto opcional pode incluir FRMS, escala, treinamento, qualificação e aeronave, sempre identificado como dado contextual e nunca como causalidade automática.
5. HFA executa SERA e devolve análise estruturada em estado de rascunho/revisão.
6. Investigador aceita, corrige ou rejeita os resultados.
7. Resultado aceito é vinculado ao relato do AirTrust.
8. Recomendações aceitas podem gerar CAPA no AirTrust.
9. Dados agregados alimentam tendência, SPI e lessons learned.

### Contrato mínimo de integração

Entrada:
- `source_system`, `source_event_id`, `tenant_id`;
- narrativa/evidências e anexos autorizados;
- datas e contexto operacional;
- evidência contextual com `source`, `captured_at` e nível de confiança.

Saída:
- `hfa_analysis_id`, versão do motor e versão metodológica;
- suficiência de evidência e pendências;
- classificação P/O/A e trilha de decisão;
- pré-condições sustentadas;
- recomendações propostas;
- limitações, warnings e status de revisão humana.

Nenhum resultado deve ser automaticamente aceito ou fechar um evento.

## 7. Roadmap de expansão

### Fase 0 — Comercialização do core HFA
**Agora.**
- piloto guiado de 60 dias;
- até 15 análises completas;
- sem cartão;
- primeiro caso recomendado: ocorrência histórica já investigada;
- dados preservados e exportáveis;
- revisão de piloto ao final com métricas de uso e padrões observados.

### Fase 1 — HFA Events
- separar `evento de safety` de `análise HFA`;
- relato simples, confidencial ou anônimo;
- anexos, categorização, responsável e workflow de triagem;
- um evento pode permanecer sem análise HFA;
- botão explícito para iniciar investigação HFA quando aplicável.

### Fase 2 — HFA Risk + Actions
- hazard/perigo e consequência;
- avaliação inicial e residual configurável;
- controles/mitigações;
- CAPA com responsável, prazo, evidência de conclusão e verificação de eficácia;
- vínculo rastreável evento → análise → ação → controle → risco residual.

### Fase 3 — HFA Intelligence
- eventos similares e clusters com revisão humana;
- padrões recorrentes de fatores humanos e hazards;
- SPIs e metas;
- tendências temporais e por frota/operação/local;
- briefing executivo com proveniência e limites explícitos;
- sinalização de candidatos a Safety Issue, nunca confirmação automática.

### Fase 4 — Integração AirTrust
- endpoint autenticado de criação/consulta de análise HFA;
- botão nativo no SGSO AirTrust;
- importação contextual controlada de FRMS/escala/treinamento/qualificação;
- retorno de recomendações para CAPA;
- agregados do HFA disponíveis aos indicadores SGSO.

### Fase 5 — Safety ampliado
- MoC standalone;
- Bowtie/FRAT somente quando houver demanda de clientes sem AirTrust;
- auditorias/quality somente se o mercado demonstrar necessidade real no HFA standalone.

## 8. O que NÃO construir no HFA agora

- LMS/SCORM;
- matriz de compliance de treinamento;
- escala operacional;
- controle de qualificações;
- FRMS completo;
- auditoria/quality duplicada do AirTrust;
- editor documental amplo.

Esses módulos desviariam o produto do diferencial e aumentariam custo de manutenção sem melhorar a proposta inicial de aquisição.

## 9. Estratégia comercial implantada

### Desafio HFA
A porta de entrada é uma comparação, não uma apresentação comercial:

> Escolha uma ocorrência que sua empresa já investigou. O HFA analisa as mesmas evidências. Compare os resultados.

### Piloto guiado
- 60 dias;
- até 15 casos HFA;
- sem cartão;
- usuários participantes sem cobrança por assento;
- implantação e orientação inicial incluídas;
- falha técnica não consome caso;
- reanálise por complementação de evidência deve permanecer vinculada ao mesmo caso, sujeito a política de fair use a ser fechada.

### Conversão
Preço de referência já definido:
- Business: **R$ 990/mês**;
- Founding Companies: **R$ 690/mês por 24 meses** para as primeiras 20 empresas elegíveis;
- contratação durante o piloto ou até 15 dias após seu encerramento para manter a condição founding.

A cobrança não deve ser apresentada como custo de IA. O valor vendido é investigação estruturada, padronização, rastreabilidade, redução de trabalho administrativo e inteligência organizacional.

## 10. Alinhamento com SGSO brasileiro

A expansão deve mapear capacidades aos quatro componentes do SGSO sem alegar que o software, sozinho, garante conformidade:

1. **Política e objetivos** — governança, papéis, documentação e futuro módulo de configuração.
2. **Gerenciamento de riscos** — HFA Events + Risk + investigação.
3. **Garantia da segurança** — SPIs, eficácia de controles, MoC e melhoria contínua.
4. **Promoção** — lessons learned e comunicação; treinamento formal pode continuar no AirTrust.

## 11. Critérios para avançar de fase

A expansão para Safety não deve atrasar a validação do HFA core.

Avançar da Fase 0 para Fase 1 quando houver:
- pelo menos 3 organizações utilizando o piloto com dados próprios;
- pelo menos 1 organização usando HFA em evento real durante o piloto;
- evidência de que o resultado foi útil ao investigador humano;
- telemetria de uso/custo funcionando;
- fluxo de conversão comercial utilizável.

Avançar para módulos de risco/assurance somente quando o ciclo evento → investigação → ação estiver funcionando de ponta a ponta.

## 12. Decisão operacional imediata

A implantação atual altera somente a camada comercial/trial e preserva o motor SERA. A próxima mudança estrutural recomendada é desacoplar criação de evento e execução de análise, permitindo que o HFA passe a receber todos os eventos de Safety sem obrigar que todos sejam classificados como fatores humanos.
