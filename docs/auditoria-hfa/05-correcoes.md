# Registro de Alterações (Correções)

## Nenhuma correção de código foi aplicada nesta fase — e por quê

Esta auditoria operou sob os locks da skill `sera-safe-phase` e das fontes Tier 0:

- **Não alterar motor, fixtures, baseline, migrations fora do escopo** (skill).
- **Dúvidas metodológicas relevantes exigem decisão autoral** (skill).
- **`proposedCode` não vira `releasedCode` automaticamente**; sem downstream/HFACS/risco/
  recomendações sem governança separada explícita (Canonical Method Question Lock, L-06/L-07).

Todos os achados **P0 e P1** desta auditoria caem em pelo menos uma das condições que a própria
tarefa (seção 6) define como impeditivas de correção automática — **ambiguidade metodológica
real** ou **necessidade de decisão formal**:

| Achado | Por que não corrigir automaticamente agora |
|---|---|
| F-02 | A correção "certa" é promover o vNext a produção ou desativar o legado — decisão estratégica/autoral, alto risco de regressão, mexe no motor. |
| F-03 | Introduzir `UNRESOLVED` no pipeline legado muda a semântica de classificação exibida ao usuário; precisa de decisão sobre o contrato de saída e de casos de referência (não deve reusar os testes atuais, que validam o comportamento errado). |
| F-01 | Corrigir RLS exige alterar `migration`/hook de auth — explicitamente fora do escopo da fase; precisa de validação com JWT real em staging. |
| F-04 / F-05 | Unificar/declarar a fórmula ERC é decisão metodológica (qual escala é canônica, qual fonte sustenta a matriz ARMS). |
| F-06 | Estender governança ao runtime de produção é decisão de arquitetura/produto. |
| F-13 | Separar IA de regras determinísticas redesenha o contrato do pipeline. |

Fazer qualquer uma dessas mudanças "no menor patch seguro" ainda assim **alteraria conclusões
metodológicas** — o que a seção 6 proíbe sob ambiguidade. Portanto, a entrega desta fase é o
**diagnóstico rastreável + recomendação**, com as correções encaminhadas para decisão.

## Procedimento recomendado para as correções (quando autorizadas)

Para cada P0/P1, seguir o rito da seção 6 da tarefa:

1. Escrever primeiro um teste de referência (da suíte da §3 de `04-testes-metodologicos.md`) que
   **demonstre a falha** — ex.: caso #15 esperando `UNRESOLVED`.
2. Confirmar que o teste falha no comportamento atual.
3. Aplicar a menor alteração segura **após decisão autoral** registrada.
4. Rodar tsc + lint + build + regressão vNext + suíte de referência.
5. Atualizar a matriz de rastreabilidade e este registro.
6. Commit atômico `tipo(escopo): descrição` em português (regra do projeto).

## Ordem de prioridade sugerida (quando houver decisão)

1. **F-03** (UNRESOLVED) — menor superfície, maior ganho metodológico; testável de forma
   determinística; não depende de infraestrutura.
2. **F-04/F-05** (ERC único e fundamentado) — reconciliação de números; testável.
3. **F-01** (RLS) — em staging, com JWT real.
4. **F-02/F-06** (motor de produção) — decisão estratégica; maior.
5. **F-13** (separação IA) — junto com F-02.
