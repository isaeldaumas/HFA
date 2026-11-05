# HFA — Patches Propostos pela Auditoria da Jornada de Eventos
**Agente Proponente:** AGENTE GEMINI 1 (Conversa 1)  
**Data:** 05/11/2026  
**Regra de Governança:** O Agente 1 NÃO edita arquivos fora de sua fronteira de propriedade (`tests/hfa-audit/gemini-event-journey/**` e `docs/hfa-backlog/gemini-event-journey/**`). As alterações abaixo são propostas formais e estruturadas para os agentes responsáveis (especialmente AGENTE GEMINI 2 e Coordenador).

---

## Patch 1: Unificação do Armazenamento de Documentos Anexos entre Safety e HFA

- **Alvo:** `frontend/src/app/api/events/route.ts`
- **Linhas originais:** 348–367
- **Responsável pela edição:** AGENTE GEMINI 2 (propriedade de rotas de eventos e upload de documentos)
- **Causa / Problema:** Em `register_only`, o arquivo físico é gravado na tabela `event_documents` e no bucket sob `events/${submittedById}/${eventId}/${safeName}`. Em modo `hfa`, o arquivo é gravado sob `${submittedById}/${result.analysis.id}/${safeName}` e salvo **apenas** no campo JSON `metadata` de `sera_vnext_analyses`, ficando invisível na tabela `event_documents`.
- **Impacto:** A listagem de documentos da ocorrência fica vazia para eventos criados diretamente em modo HFA, quebrando o futuro multi-upload (issue #122).

### Modificação Proposta:
```diff
--- a/frontend/src/app/api/events/route.ts
+++ b/frontend/src/app/api/events/route.ts
@@ -352,18 +352,30 @@ export async function POST(req: Request) {
         const ext = sourceFile.name.toLowerCase().endsWith('.docx') || kind === 'docx' ? 'docx' : 'pdf'
         if (!kind || (ext === 'docx' && kind !== 'docx') || (ext === 'pdf' && kind !== 'pdf')) throw new Error('Tipo de arquivo inválido para armazenamento')
         const safeName = sourceFile.name.replace(/[^\w.\-]/g, '_').slice(0, 180)
-        const path = `${submittedById}/${result.analysis.id}/${safeName}`
+        const path = `events/${submittedById}/${eventId}/${safeName}`
         const { error: uploadError } = await admin.storage.from('analysis-documents').upload(path, buf, {
           contentType: sourceFile.type || (kind === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
           upsert: true,
         })
         if (!uploadError) {
+          await admin.from('event_documents').insert({
+            tenant_id: user.tenantId,
+            event_id: eventId,
+            uploaded_by: submittedById,
+            file_name: sourceFile.name,
+            storage_path: path,
+            mime_type: sourceFile.type || null,
+            size_bytes: sourceFile.size,
+          })
           await admin
             .from('sera_vnext_analyses')
             .update({ metadata: { ...result.analysis.metadata, sourceFileUrl: path, sourceFileName: sourceFile.name, sourceType: sourceMeta.sourceType ?? input_type } })
             .eq('id', result.analysis.id)
             .eq('tenant_id', user.tenantId)
         }
       }
```

---

## Patch 2: Normalização de Strings Vazias para Campos Opcionais em Payload JSON

- **Alvo:** `frontend/src/app/api/events/route.ts`
- **Linhas originais:** 166–168
- **Responsável pela edição:** AGENTE GEMINI 2
- **Causa / Problema:** Se o payload JSON enviar `""` (string vazia), a expressão `body.operation_type != null ? String(body.operation_type) : null` mantém `""`, ao passo que no multipart a expressão `form.get('operation_type') ? String(...) : null` converte para `null`.
- **Impacto:** Inconsistência no banco de dados entre submissões JSON e FormData.

### Modificação Proposta:
```diff
--- a/frontend/src/app/api/events/route.ts
+++ b/frontend/src/app/api/events/route.ts
@@ -166,3 +166,3 @@ export async function POST(req: Request) {
-      operation_type = body.operation_type != null ? String(body.operation_type) : null
-      aircraft_type = body.aircraft_type != null ? String(body.aircraft_type) : null
-      occurred_at = body.occurred_at != null ? String(body.occurred_at) : null
+      operation_type = body.operation_type ? String(body.operation_type).trim() || null : null
+      aircraft_type = body.aircraft_type ? String(body.aircraft_type).trim() || null : null
+      occurred_at = body.occurred_at ? String(body.occurred_at).trim() || null : null
```

---

## Patch 3: Exclusão de Eventos com Status 'failed' na Verificação de Duplicatas

- **Alvo:** `frontend/src/lib/server/event-duplicates.ts`
- **Linha original:** 55
- **Responsável pela edição:** AGENTE GEMINI 2 / Coordenador
- **Causa / Problema:** Se uma análise falhar após a gravação inicial do evento (gerando retorno HTTP 503 com `event_id`), o evento é marcado como `status = 'failed'`. Se o usuário tentar novamente na tela de cadastro, a query de duplicatas inclui esse registro falho, bloqueando a nova tentativa com 409 e exigindo justificativa de 20 caracteres desnecessariamente.
- **Impacto:** Falso positivo de duplicata travando o fluxo de recuperação de falhas operacionais do usuário.

### Modificação Proposta:
```diff
--- a/frontend/src/lib/server/event-duplicates.ts
+++ b/frontend/src/lib/server/event-duplicates.ts
@@ -55,1 +55,1 @@ export async function findTenantDuplicateCandidates(args: {
-    .eq('tenant_id', args.tenantId).is('deleted_at', null).neq('deletion_status', 'PURGED')
+    .eq('tenant_id', args.tenantId).is('deleted_at', null).neq('deletion_status', 'PURGED').neq('status', 'failed')
```

---

## Patch 4: Expansão de Padrões Naturais para Inferência de Data da Ocorrência

- **Alvo:** `frontend/src/lib/sera-vnext/occurrence-date.ts`
- **Linhas originais:** 10–14
- **Responsável pela edição:** Coordenador / Engenheiro de Domínio
- **Causa / Problema:** Apenas rótulos rígidos com "data da ocorrência" são detectados. Relatos cotidianos redigidos com "no dia DD/MM/AAAA" ou "em DD/MM/AAAA" são ignorados e resultam em `null`.

### Modificação Proposta:
```diff
--- a/frontend/src/lib/sera-vnext/occurrence-date.ts
+++ b/frontend/src/lib/sera-vnext/occurrence-date.ts
@@ -10,4 +10,6 @@ export function inferOccurrenceDateFromNarrative(narrative?: string | null): st
   const explicitPatterns = [
     /\bdata\s*\/?\s*hora\s+da\s+ocorr[eê]ncia\s*[-–—:]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i,
     /\bdata\s+da\s+ocorr[eê]ncia\s*[-–—:]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i,
     /\boccurrence\s+date(?:\/time)?\s*[-–—:]?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i,
+    /\b(?:no\s+dia|em\s+data\s+de)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i,
   ]
```
