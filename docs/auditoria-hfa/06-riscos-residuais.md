# Riscos Residuais

O que **ainda não está comprovado** ao fim desta auditoria.

## Decisões metodológicas pendentes (bloqueiam correção)

1. **Qual motor é o de produção?** (F-02/F-06) Enquanto a flag vNext estiver desligada por
   padrão, o usuário recebe classificações heurísticas fora da governança canônica.
2. **Contrato de incerteza no runtime de produção** (F-03). É preciso decidir se o pipeline
   legado passará a emitir `UNRESOLVED`/`HOLD` ou se será descontinuado.
3. **Definição canônica de ERC e fonte da fórmula de risco** (F-04/F-05). Qual escala é canônica
   e qual decisão formal/fonte sustenta a matriz ARMS de severidade.
4. **Alocação código↔rótulo↔eixo** (F-07) e divergência de fonte Hendy×Daumas para
   "Knowledge (Decision) Failure" / A-E.

## Ausência de dados / validação científica

- **Amostra insuficiente para perfil de risco** (R-10): o próprio Daumas alertou que 4 eventos
  não bastam. O sistema não deve apresentar tendência consolidada; o `data-confidence` mitiga
  parcialmente, mas o card de ERC/tendência ainda pode ser lido como risco (F-10).
- **Fórmulas de risco não validadas** (R-08, Hendy): apresentadas de forma conceitual na fonte;
  o sistema as materializa como índice (F-05).

## Ausência de testes / validação dinâmica

- **RLS nunca exercida com JWT real** nesta fase (F-01) — 43 trials `REAL_DB/REAL_API/REAL_UI`
  pulados por falta de ambiente externo. A conclusão de F-01 é estática (alta confiança, mas
  recomenda-se confirmação com JWT emitido em staging).
- **Comportamento do LLM não executado** (F-13) — reprodutibilidade real do fluxo de produção
  não medida; risco de classificações divergentes em execuções equivalentes permanece aberto.
- **Reconciliação de números** (F-04) não coberta por teste.

## Limitações de arquitetura

- Dois motores SERA coexistindo aumentam a superfície de divergência (rótulos, escalas ERC,
  estados de incerteza). Regras críticas ainda vivem parcialmente em heurísticas soltas do
  pipeline legado, contrariando a arquitetura esperada (seção 7).

## Dependências externas

- Provedores de LLM (DeepSeek/OpenAI/Anthropic/Google/Groq) configuráveis por tenant
  (`llm.ts`) — comportamento e disponibilidade fora do controle do sistema.
- Supabase (auth, RLS, storage) — a correção de F-01 depende de configuração de projeto/hook.

## Comportamento probabilístico de IA

- Mesmo com `temperature=0`, os modelos não garantem determinismo; o fluxo de produção usa a
  saída do LLM como base primária de P/O/A (F-13). Enquanto não houver validação humana marcada
  e schema canônico, o resultado exibido não é garantidamente reproduzível.
