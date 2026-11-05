# Recomendações de Correções Mínimas de Configuração e Testes (2026-11-05)

**Executor:** AGENTE GEMINI 4  
**Worktree:** `/private/tmp/hfa-gemini-release-qa-20261105`  
**Branch:** `gemini/hfa-release-qa-20261105`  
**Aviso de Governança:** Este documento contém **propostas e recomendações técnicas**. Nenhuma dessas alterações foi efetuada, cumprindo a regra de não alterar configurações remotas, DNS, Vercel ou Supabase sem autorização expressa.

---

## 1. Recomendação 1: Alinhamento da Conexão Git do Projeto Vercel (systemhfa)

### O Problema Identificado
O projeto Vercel ativo (`systemhfa`, ID `prj_Zqt0szU9Uxgglx710lABPAYJ7Rfa`) está vinculado ao repositório GitHub `system-hfa/HFA` (que está congelado em julho de 2026 no SHA `315eac1`), enquanto todo o desenvolvimento, PRs e CI acontecem no repositório `isaeldaumas/HFA`. Por isso, o projeto opera em modo `sourceless: true` e depende de deploys manuais via CLI.

### Proposta de Correção
Avaliar com o coordenador e o proprietário duas opções:
- **Opção A (Recomendada):** Manter o deploy governado via CLI com injeção estrita de proveniência de SHA (`scripts/deploy-hfa-production.sh`), formalizando que não há CD automático do GitHub para produção. Isso evita deploys acidentais em merge.
- **Opção B:** Reconectar o projeto Vercel a `isaeldaumas/HFA` configurando `productionBranch: main` com "Deploy Hooks" e aprovações manuais ativadas (Environment Protection).

### Teste de Validação Proposto
Consultar a API da Vercel em modo somente-leitura após a decisão para confirmar se `link.repo` reflete a política escolhida sem disparar builds automáticos.

---

## 2. Recomendação 2: Aprovisionamento de Ambiente de Staging Contínuo

### O Problema Identificado
Atualmente, não existe um ambiente de staging contínuo e persistente no Vercel para `isaeldaumas/HFA`. Os deploys de preview são efêmeros e manuais via CLI. O workflow `HFA Integrated Regression` no GitHub Actions já está pronto com todas as guardrails de segurança, mas depende de secrets de staging (`SUPABASE_STAGING_URL`, `SUPABASE_STAGING_ANON_KEY`, etc.).

### Proposta de Correção
1. Configurar um projeto Vercel dedicado `systemhfa-staging` (ou usar branch domains com preview deployments automáticos para PRs).
2. Manter isolamento estrito entre o banco Supabase de staging (`vbdpweliprcsktyxodss`) e qualquer dado de produção.
3. Cadastrar as variáveis de ambiente necessárias nos GitHub Actions Secrets/Variables conforme inventariado no workflow.

### Teste de Validação Proposto
Disparar manualmente o workflow `HFA Integrated Regression` com `confirm_staging_only: true` e verificar se a saída do step `check-environment` reporta `available=true`.

---

## 3. Recomendação 3: Runbook de Renovação do Snapshot do Ledger de Migrações

### O Problema Identificado
O script `scripts/release/preflight-migration-history.mjs` possui uma trava estrita de expiração: snapshots com mais de 24 horas falham automaticamente (`snapshot stale or timestamp invalid`). O snapshot atual (`migration-ledger-snapshot-20261103.json`) possui mais de 42 horas, bloqueando a pré-validação de release.

### Proposta de Correção
Criar um script read-only para reobter o snapshot do ledger de migrações diretamente do Supabase Management API (sem executar SQL e sem mutação de banco), gerando um novo arquivo datado no formato `docs/release/migration-ledger-snapshot-<YYYYMMDD>.json`.

### Teste de Validação Proposto
Executar localmente:
```bash
node scripts/release/preflight-migration-history.mjs --snapshot docs/release/migration-ledger-snapshot-<novo>.json
```
Verificar se o status retorna `SOURCE_SNAPSHOT_MATCH` com idade < 24h.

---

## 4. Recomendação 4: Resiliência do Build Local sem Variáveis Supabase

### O Problema Identificado
Durante `npm run build`, o Next.js executa a fase de prerender de 72 páginas estáticas. Caso `NEXT_PUBLIC_SUPABASE_URL` não esteja definida no ambiente local ou no arquivo `.env.local`, a importação de `src/lib/supabase.ts` quebra o build com erro `Error: supabaseUrl is required`.

### Proposta de Correção (Não aplicada)
Proposta de patch em `src/lib/supabase.ts`:
Adicionar um fallback seguro em tempo de build/prerender para que o cliente não lance erro fatal de inicialização se executado fora de runtime de produção ou com mock de build:
```typescript
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
```

### Teste de Validação Proposto
Executar `npm run build` em uma worktree limpa sem `.env.local` e validar se a compilação é concluída sem quebrar as guardrails de autenticação em runtime.
