# Auditoria de Mapeamento Repositório Git → Vercel e Estado de Publicação (2026-11-05)

**Executor:** AGENTE GEMINI 4  
**Worktree:** `/private/tmp/hfa-gemini-release-qa-20261105`  
**Branch:** `gemini/hfa-release-qa-20261105`  
**Base SHA:** `9168beab5b2bcd7dcc060e4bdd221b939b4e78dd` (`origin/main`)  

---

## 1. Resumo Executivo da Divergência

A auditoria identificou e comprovou documentalmente uma **divergência estrutural crítica** entre o repositório de desenvolvimento ativo (`isaeldaumas/HFA`), o repositório vinculado ao projeto Vercel (`system-hfa/HFA`) e os deployments efetivamente ativos em produção.

1. **Repositório de desenvolvimento das PRs e CI:** `https://github.com/isaeldaumas/HFA.git`.
   - Branch `main` em: `9168beab5b2bcd7dcc060e4bdd221b939b4e78dd` (Merge PR #119).
2. **Repositório vinculado ao projeto Vercel `systemhfa`:** `https://github.com/system-hfa/HFA.git`.
   - Branch `main` congelada em: `315eac1a4728346dc893d6b09e7c9e91a4e000f6` (último commit em 09/07/2026).
3. **Deployment ativo em Produção (`systemhfa.vercel.app`):**
   - Deployment ID: `dpl_CxLqEKX5wxKEbQnVzywXAiRHGdpZ`.
   - SHA publicado: `cb13923b0009bdce1c13b1403516a820c425a002` (Merge PR #115, 04/11/2026 10:09 BRT).
   - Método de deploy: CLI / Detached HEAD (`/private/tmp/hfa-shadow-prod-publish-20261104`), **sem acionamento automático por webhook do GitHub**.
4. **Defasagem de Produção:**
   - A produção está **3 commits atrás de `origin/main`**.
   - Os commits de PR #116 (`a46ef24`), PR #117 (`ed3f1d6`) e PR #119 (`7f16e76`) estão merged na `main` de `isaeldaumas/HFA`, mas **NÃO estão publicados em produção**.
5. **Ambiente de Staging no Vercel:**
   - **NOT_CONFIGURED / NOT_VERIFIED**: Não há projeto de staging ou branch preview contínuo configurado para PRs de `isaeldaumas/HFA`. Os únicos previews registrados são efêmeros e manuais via CLI de 21 dias atrás.

---

## 2. Inventário de Projetos Vercel (Conta `systemhfa`)

| Projeto Vercel | Project ID | Root Directory | Framework | Link GitHub | Status de Deploy | Domínio / URL Ativa |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **systemhfa** | `prj_Zqt0szU9Uxgglx710lABPAYJ7Rfa` | `frontend` | Next.js (Turbopack) | `system-hfa/HFA` (sourceless: true) | **READY** (Produção) | `systemhfa.vercel.app` |
| **frontend** | `prj_8oRx3BxsuvQfGIVOsYEWkQCrV7AJ` | `.` | Next.js | `null` (desconectado) | **ERROR** (38d atrás) | `frontend-systemhfa.vercel.app` (stale/inativo) |
| **ro-dbt-diary** | `prj_...` | -- | -- | Desconhecido | -- | Não relacionado ao HFA |
| **techplay** | `prj_...` | -- | -- | Desconhecido | -- | Não relacionado ao HFA |

---

## 3. Detalhamento do Deployment de Produção Atual

- **ID do Deployment:** `dpl_CxLqEKX5wxKEbQnVzywXAiRHGdpZ`
- **URL Canônica:** `https://systemhfa-2tpzcxcvn-systemhfa.vercel.app`
- **Domínio Atribuído:** `https://systemhfa.vercel.app` (HTTP 200, cache Vercel ativo)
- **Criado em:** `2026-11-04T13:09:31.307Z` (1 dia atrás)
- **Creator UID:** `XWTji0HoZXUPATQI7G9o7M5U` (`systemhfa@gmail.com`)
- **Git Commit SHA:** `cb13923b0009bdce1c13b1403516a820c425a002`
- **Git Commit Message:** `Merge pull request #115 from isaeldaumas/fix/hfa-shadow-public-rollback-release-guard-20261104`
- **Git Commit Ref:** `HEAD` (indicando deploy via worktree desanexada e CLI `vercel deploy --prod`)
- **Flags de Build Observadas:**
  - `prebuild`: `node tools/prebuild-shadow-production-guard.mjs` → PASS (todas as 6 flags Shadow OFF).
  - Turbopack compilation: Next.js 16.4.5.

---

## 4. Análise de Divergência de Commits (Produção vs main)

```
[cb13923] (PUBLICADO EM PRODUÇÃO) Merge PR #115: fix(shadow): prevent false rollback
   │
   ├── [a46ef24 / eeb06d8] Merge PR #116: test(security): audit Supabase Auth signup (NÃO DEPLOYADO)
   │
   ├── [ed3f1d6 / 1b3f729] Merge PR #117: test(tenancy): safe authenticated read-only gate (NÃO DEPLOYADO)
   │
   └── [7f16e76 / 9168bea] Merge PR #119: fix(next): restore Next.js route build isolation (NÃO DEPLOYADO, HEAD atual de main)
```

**Conclusão Técnica:** O fato de a CI do GitHub estar verde em `main` (`9168bea`) **NÃO significa** que esse código está em produção. A produção continua estritamente travada no SHA `cb13923`. Qualquer afirmação de que correções posteriores à PR #115 estão ativas em produção é falsa.

---

## 5. Script de Verificação Automatizada

A verificação acima foi codificada no script idempotente:
`tests/hfa-audit/gemini-release-readiness/verify-vercel-git-linkage.ts`

Comando para execução:
```bash
./frontend/node_modules/.bin/tsx tests/hfa-audit/gemini-release-readiness/verify-vercel-git-linkage.ts
```
Resultado: **PASS (100% dos checks validados)**.
