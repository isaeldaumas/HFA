# HFA — Endurecimento de privilégios de anexos, 12/11/2026

## Achado factual em Supabase de produção

- public.event_documents tem RLS habilitado e uma policy SELECT para authenticated, mas o grants inventory mostrou permissões explícitas SELECT, INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER e REFERENCES para anon/authenticated.
- As policies de linha bloqueiam gravações não autorizadas, mas RLS não cobre TRUNCATE. Remover o privilégio no próprio PostgreSQL é necessário como defesa adicional.
- A policy SELECT anterior usa public.users.id = auth.uid(), enquanto a identidade canônica do backend usa public.users.auth_user_id = auth.uid(). Usuários legados com IDs divergentes podiam ser recusados na leitura direta do índice.
- A tabela de anexos tinha zero linhas no momento da inspeção, portanto a alteração não converte nem reclassifica dados reais.

## Correção isolada

- REVOKE ALL para anon e authenticated no índice documental; reatribuir somente SELECT a authenticated.
- service_role mantém os privilégios necessários aos uploads, indexação e exclusão gerenciados pelo servidor.
- Política RLS SELECT por tenant_id = public.get_tenant_id(), função existente que resolve auth_user_id e verifica usuário/empresa ativos, usada também nas policies da tabela events.
- Sem mexer em storage.objects, taxas, P/O/A, classificação científica, formato do documento, Shadow, login ou cadastro.

## Gates e evidências esperadas

- Após aplicar migration aditiva de privilégios, exigir has_table_privilege(anon, event_documents, SELECT/INSERT/UPDATE/DELETE/TRUNCATE) false.
- Exigir has_table_privilege(authenticated, event_documents, SELECT) true; INSERT/UPDATE/DELETE/TRUNCATE false.
- Exigir que service_role mantenha SELECT, INSERT, UPDATE, DELETE e TRUNCATE.
- Verificar pg_policies USING tenant_id = public.get_tenant_id(), RLS ativo e SELECT SQL para sub sintético não vinculado retornando 0 linhas, com ROLLBACK.
- CI Core e SERA na PR e na main antes do deploy direto; sem alteração no motor. Homologação autenticada de dois tenants verdadeiros continua NOT_RUN até haver fixtures seguras.

## Evidência Supabase PROD

Migration registrada como versão 20261112182721, nome
event_document_least_privilege; SQL foi renomeado sem qualquer mudança.
ACL pós-aplicação: anon SELECT/INSERT/TRUNCATE=false;
authenticated SELECT=true, INSERT/UPDATE/DELETE/TRUNCATE=false;
service_role preserva SELECT/INSERT/UPDATE/DELETE/TRUNCATE=true;
RLS ON e policy tenant_id = public.get_tenant_id() ativa.
Em transação SQL real com role authenticated e JWT sub sintético
não vinculado, SELECT event_documents teve zero linhas e ROLLBACK.
Sem recriar usuários/eventos reais ou consultar relatórios.
