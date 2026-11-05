# Checklist de Promoção Segura com Autorização Humana (2026-11-05)

**Executor:** AGENTE GEMINI 4  
**Worktree:** `/private/tmp/hfa-gemini-release-qa-20261105`  
**Branch:** `gemini/hfa-release-qa-20261105`  

---

## 1. Princípio Fundamental de Governança

> **CI VERDE NÃO É DEPLOY.**  
> O fato de uma PR ou a branch `main` estar com status de checks verdes no GitHub **não autoriza** deploy em produção, mutação de schema nem promoção automática de release.
> Qualquer promoção para produção exige aprovação humana explícita vinculada a **SHA, artefato e escopo exatos**.

---

## 2. Checklist Obrigatório em 7 Portais (Gates)

Antes de qualquer promoção para ambiente produtivo, o operador humano e o coordenador do projeto (ChatGPT) devem atestar cumulativamente os 7 portais abaixo:

### Portal 1: Convergência de Código e Auditoria de Delta (SHA Exato)
- [ ] O SHA candidato a release é exatamente o commit final de `main` em `isaeldaumas/HFA`.
- [ ] O diff entre o SHA atualmente em produção (`cb13923b0009bdce1c13b1403516a820c425a002`) e o SHA candidato foi revisado linha a linha.
- [ ] Nenhuma alteração não autorizada no motor canônico do SERA, taxonomia P/O/A ou códigos de classificação foi introduzida.

### Portal 2: Gates Obrigatórios de CI Verde
- [ ] `HFA Core CI` executado com sucesso (20 steps verdes, 0 vulnerabilidades).
- [ ] `SERA vNext Deterministic Regression` executado com sucesso (194 PASS, 0 FAIL, 0 timeouts).
- [ ] Build de produção verificado com Turbopack (72 páginas estáticas geradas com sucesso).

### Portal 3: Bloqueio Estrito de Flags Shadow e Modo Experimental
- [ ] Prebuild guard executado com sucesso:
  - `SERA_SHADOW_EXECUTION_ENABLED = false`
  - `SERA_SHADOW_PERSISTENCE_ENABLED = false`
  - `SERA_SHADOW_ADMIN_VIEW_ENABLED = false`
  - `SERA_SHADOW_AUTO_COMPARISON_ENABLED = false`
  - `SERA_SHADOW_VALIDATION_REPORTS_ENABLED = false`
  - `NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED = false`
- [ ] Nenhum bypass de UI ou flag de depuração ativada no client-side.

### Portal 4: Reconciliação do Ledger de Migrações (Supabase)
- [ ] O script `scripts/release/preflight-migration-history.mjs` foi executado contra um snapshot recente (< 24h).
- [ ] Todas as migrações locais (atualmente 47) correspondem às migrações do ledger do Supabase (atualmente 51) através de mapeamentos léxicos ou hashes idênticos.
- [ ] NENHUM script ad-hoc ou SQL manual foi executado diretamente no banco de produção.

### Portal 5: Validação em Staging Controlado (Smoke Test Sintético)
- [ ] Workflow `HFA Integrated Regression` disparado manualmente em ambiente de staging isolado.
- [ ] Testes de isolamento multi-tenant (Tenants A e B) validados sem vazamento de dados.
- [ ] Nenhuma conta de usuário real ou e-mail de cliente foi tocado.

### Portal 6: Resolução da Amarração Vercel ↔ GitHub
- [ ] O projeto Vercel de produção foi formalmente verificado para garantir se deve receber push manual via CLI autenticada com proveniência (`scripts/deploy-hfa-production.sh`) ou via integração controlada.
- [ ] O commit SHA exato é injetado como variável de build: `SERA_CODE_COMMIT=<SHA>`.

### Portal 7: Decisão e Autorização Humana Registrada
- [ ] O coordenador e o proprietário aprovaram expressamente o deploy para o SHA específico.
- [ ] Registro formal em log / issue de release com data, hora, autor e commit SHA.

---

## 3. Procedimento Seguro de Rollback

Caso ocorra qualquer anomalia de latência, erro 500 ou instabilidade após a promoção:
1. **Reversão Instantânea na Vercel:**
   Executar rollback imediato para o deployment anterior conhecido como estável:
   `dpl_CxLqEKX5wxKEbQnVzywXAiRHGdpZ` (SHA `cb13923b0009bdce1c13b1403516a820c425a002`).
   Comando:
   ```bash
   vercel rollback systemhfa-2tpzcxcvn-systemhfa.vercel.app
   ```
2. **Preservação de Dados:**
   Como as migrações devem ser retrocompatíveis (expand and contract), o código da versão anterior deve operar sem quebras no schema atual.
3. **Comunicação:** Registrar o evento de rollback e congelar novas promoções até triagem da causa raiz.
