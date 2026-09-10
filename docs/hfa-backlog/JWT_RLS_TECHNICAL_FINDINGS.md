# JWT/RLS — Achado Técnico e Plano de Resolução

**Status**: `JWT_RLS_HUMAN_VALIDATION_REQUIRED`
**Criado em**: 2026-09-10
**Restrição ativa**: `NO_PRODUCTION_VALIDATION` | `NO_REAL_CROSS_TENANT_VALIDATION`

---

## Achado

`get_tenant_id()` (migration `20260507120000_rls_policies.sql`) lê o claim `tenant_id`
diretamente do JWT via `current_setting('request.jwt.claims')`:

```sql
create or replace function public.get_tenant_id()
returns uuid language sql stable security definer
as $$
  select nullif(
    current_setting('request.jwt.claims', true)::json ->> 'tenant_id', ''
  )::uuid;
$$;
```

### Problema

O claim `tenant_id` no JWT depende de ser populado pelo provedor de identidade (Supabase Auth /
hook de sessão) no momento do login. Se **não** estiver populado, `get_tenant_id()` retorna
`NULL`, e todas as policies RLS falham silenciosamente (usuário não vê nada) ou potencialmente
permitem acesso errado dependendo da implementação de cada policy.

### Variante vNext

A função `sera_vnext_beta_jwt_tenant_id()` (migration `20260607135727`) tenta múltiplos paths:
1. `app_metadata.tenant_id`
2. `tenant_id` (raiz do JWT)
3. Fallback para `public.get_tenant_id()`

### Divergência detectada

Migration `20260507180000_add_analysis_edits.sql` usa caminho diferente:
```sql
USING (tenant_id = (auth.jwt() -> 'user_metadata' ->> 'tenant_id')::UUID);
```
— ou seja, `user_metadata` em vez de claim raiz. Inconsistência entre migrations.

## Onde o claim precisa ser populado

Para que o RLS funcione:
1. O Supabase Auth precisa incluir `tenant_id` no JWT durante a autenticação
2. Isso tipicamente é feito via Hook de sessão (Supabase) ou trigger de login

**Achado**: não há evidência no repositório de que o hook/trigger que popula `tenant_id` no JWT
esteja configurado. As migrations criam a função mas não o mecanismo de população.

## Plano de resolução (requer ambiente dev/staging)

### Passo 1 — Confirmar estado atual
```bash
# Em ambiente dev/staging (NUNCA produção)
# Verificar se claim tenant_id está presente no JWT de usuário real
# SELECT auth.jwt() -> 'tenant_id' após login de um usuário com tenant
```

### Passo 2 — Criar fixture de tenant isolada em dev
- Criar tenant de desenvolvimento/teste no Supabase dev
- Criar usuário com esse tenant associado
- Confirmar que `tenant_id` aparece no JWT após login

### Passo 3 — Validar RLS com fixture
- Testar `tests/sera-vnext/provenance-db-real-trial-001.ts` em dev (nunca produção)
- Confirmar que dados do tenant A não são acessíveis pelo tenant B
- Teste de cruzamento com dois tenants de dev

### Passo 4 — Resolver inconsistência de paths JWT
Decidir qual path é o canônico:
- `current_setting('request.jwt.claims')::json ->> 'tenant_id'` (get_tenant_id atual)
- `auth.jwt() -> 'user_metadata' ->> 'tenant_id'` (migration add_analysis_edits)
- `app_metadata.tenant_id` (vNext)

### Passo 5 — Harmonizar migrations
Após decisão de Passo 4: criar migration de correção (NÃO aplicar remotamente sem aprovação).

## Bloqueios externos

| Bloqueio | Requer |
|---------|--------|
| Fixture de tenant dev | Acesso ao painel Supabase dev |
| Validação JWT real | Ambiente Supabase dev configurado |
| Cross-tenant real | Dois tenants de dev + sessões reais |
| Migration de correção | Aprovação + ambiente staging |

## Restrição permanente

`NO_PRODUCTION_VALIDATION` — nunca testar acesso cruzado em produção.
`NO_REAL_CROSS_TENANT_VALIDATION` — somente dev/staging com dados sintéticos.
