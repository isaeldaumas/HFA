# HFA — Verificação de migrações antes de liberar uma versão

**Data da evidência:** 03/11/2026. **Escopo:** histórico do projeto Supabase HFA e migrations da branch consolidada local.

## O que foi comprovado

- O Supabase registrou **51 versões**; o checkout contém **47 arquivos SQL**.
- **36** versões locais coincidem com as remotas.
- Outros **10** arquivos locais têm conteúdo SQL equivalente a uma versão remota diferente (comparação lexical realizada na auditoria de 03/11/2026).
- Uma migration histórica, `20260710010000_methodology_provenance_and_shadow_infra.sql`, não corresponde ao conjunto dos scripts de recuperação de produção que a substituíram. Não é segura para reaplicação automática.
- Existem **5 versões complementares** no Supabase que não têm um arquivo correspondente no checkout. Preservar seu histórico.
- Diferença específica: `public.sera_taxonomy_entries.created_at` aparece no SQL histórico de julho, mas não existe no schema de produção verificado em 03/11/2026. Não foi encontrado uso direto dessa coluna no frontend ou nos testes inspecionados.
- A tabela de shadow de produção mantém `UNIQUE(tenant_id, shadow_run_id)`, RLS sem acesso direto dos papéis públicos e gatilhos no schema `private`. Não substituir pelo SQL antigo.

## Gate local, sem acesso à rede

```bash
node scripts/release/preflight-migration-history.mjs --mode source-check
node scripts/release/preflight-migration-history.mjs --mode db-push
```

O primeiro comando comprova que os arquivos locais e a fotografia do ledger remoto não mudaram desde o inventário. Ele pode sair com sucesso, mas **não libera deploy**. O segundo deve **falhar com código 2** enquanto houver histórico divergente: não realiza nenhum `db push`.

O snapshot é um inventário produzido por consulta *read-only* ao Supabase: `docs/release/migration-ledger-snapshot-20261103.json`. Traz versões, nomes e hashes SHA-256 dos 46 arquivos SQL locais. Não contém dados de usuários nem credenciais.

O gate rejeita snapshots com mais de **24 horas**, alterações dos arquivos SQL ou versões não classificadas. Um snapshot recente não prova que o banco não mudou após a consulta; portanto, **nunca substitui** a checagem em tempo real e o plano de migrations aprovado.

## Procedimento obrigatório antes de publicar

1. Reconsultar o histórico com acesso somente de leitura à fonte autoritativa Supabase.
2. Comparar versão e conteúdo SQL, identificar migrações extras e preservar as alterações históricas e mecanismos de segurança posteriores.
3. Tratar a divergência da migration de julho por reconciliação específica, **não** executando o SQL legado indiscriminadamente.
4. Confirmar separadamente a compatibilidade do schema de staging com o código exato a publicar; validar funcionalidade e isolamento de organização.
5. Só então propor uma sequência versionada e reversível de migrations a quem possui autorização. **Não usar `migration repair`, `db push` ou `apply_migration` na produção sem aprovação explícita e avaliação do impacto.**

A correção de `public.reject_event_duplicate_link_mutation()` (`ALTER FUNCTION ... SET search_path = ''`) foi ensaiada em PostgreSQL 16 isolado. Está fora do checkout para não contornar gates protegidos. Os testes confirmaram que `UPDATE` e `DELETE` permanecem bloqueados.

## O que este gate não prova

A igualdade lexical de uma migration não certifica que todos os seus objetos persistem intactos hoje, porque migrations posteriores podem tê-los alterado. Da mesma forma, esta comparação não homologa autenticação real, permissões de usuários, cálculos de risco, a validação humana naturalística ou o runtime em produção. Os critérios são gates separados.

## Correção de segurança 03/11/2026

A migration `20261103204541_fix_event_duplicate_link_mutation_search_path_20261103.sql` foi aplicada no Supabase de produção como alteração isolada de configuração da função de imutabilidade. A versão local e a registrada no ledger remoto são idênticas. O hash MD5 do corpo da função permaneceu `0f7920a11ee5d99f799d951196aa613c`, com os dois gatilhos ativos e `prosecdef=false`. O verificador de segurança deixou de sinalizar `function_search_path_mutable`. O gate de `db-push` continua bloqueado por divergências históricas independentes.
