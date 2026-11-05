# HFA — Proposta de Patches de Segurança de Runtime (Agente Gemini 3)

**Data de elaboração:** 05/11/2026  
**Nota de Governança:** Conforme os limites estritos da CONVERSA 3 (`HFA_GEMINI_4_AGENTES_PROMPTS_2026-11-05.md`), o Agente Gemini 3 **NÃO edita diretamente** rotas de eventos, criação, extração, autenticação, código de produção ou migrações do Supabase. As correções abaixo são fornecidas em formato de patch detalhado com linhas, condições, impacto e estratégia para execução pelo Coordenador (ChatGPT) ou pelo executor responsável pelo runtime.

---

## 1. PATCH PROPOSTO 1: Segregação de Superadmin vs Tenant Admin (VULN-03 - P0)

### Arquivo Alvo
`frontend/src/lib/server/admin-auth.ts` (linhas 5–22)

### Condição e Impacto
Atualmente, qualquer cliente com plano `enterprise` e papel `admin` atende aos requisitos de `requireAdmin(req)` e ganha acesso a rotas globais da plataforma (`/api/admin/tenants`, `/api/admin/payments/transactions`, `/api/admin/settings`).

### Patch Proposto
```diff
--- a/frontend/src/lib/server/admin-auth.ts
+++ b/frontend/src/lib/server/admin-auth.ts
@@ -5,14 +5,35 @@ import { NextResponse } from 'next/server'
 export async function requireAdmin(req: Request): Promise<ApiUserContext> {
   const user = await requireBearerUser(req)
   const admin = getSupabaseAdmin()
   const [tenant, userRow] = await Promise.all([
     admin.from('tenants').select('plan').eq('id', user.tenantId).single(),
     admin.from('users').select('role').eq('id', user.publicUserId).maybeSingle(),
   ])
   const role = String(userRow.data?.role ?? user.role ?? '').toLowerCase()
   if (tenant.data?.plan !== 'enterprise' || role !== 'admin') {
     throw new Response(
       JSON.stringify({ detail: 'Acesso restrito a administradores enterprise' }),
       { status: 403, headers: { 'Content-Type': 'application/json' } }
     )
   }
   return user
 }
+
+/**
+ * Exige privilégio de Superadmin da Plataforma (operador HFA),
+ * impedindo que administradores de organizações clientes acessem dados globais.
+ */
+export async function requireSuperAdmin(req: Request): Promise<ApiUserContext> {
+  const user = await requireBearerUser(req)
+  const admin = getSupabaseAdmin()
+  const { data: superadminRecord } = await admin
+    .from('system_admins')
+    .select('id, is_active')
+    .eq('user_id', user.publicUserId)
+    .eq('is_active', true)
+    .maybeSingle()
+
+  if (!superadminRecord) {
+    throw new Response(
+      JSON.stringify({ detail: 'Acesso restrito a operadores globais do sistema.' }),
+      { status: 403, headers: { 'Content-Type': 'application/json' } }
+    )
+  }
+  return user
+}
```

Nas rotas `frontend/src/app/api/admin/tenants/route.ts`, `frontend/src/app/api/admin/tenants/[id]/route.ts` e `frontend/src/app/api/admin/payments/transactions/route.ts`, substituir a chamada `await requireAdmin(req)` por `await requireSuperAdmin(req)`.

---

## 2. PATCH PROPOSTO 2: Eliminação de Mutação Global de `process.env` (VULN-02 - P0)

### Arquivo Alvo
`frontend/src/lib/server/apply-user-ai-settings-to-env.ts` (linhas 50–85)

### Condição e Impacto
A função grava chaves de API desencriptadas diretamente em `process.env[API_KEY_ENV_KEYS[provider]]`. Em um servidor Node.js compartilhado (Vercel serverless worker ou container), o ambiente é compartilhado entre requisições concorrentes e subsequentes, vazando chaves de clientes para outros tenants.

### Patch Proposto
Em vez de mutar `process.env`, criar um helper que retorne um objeto de configuração com escopo de requisição (`RequestAiContext`):

```diff
--- a/frontend/src/lib/server/apply-user-ai-settings-to-env.ts
+++ b/frontend/src/lib/server/apply-user-ai-settings-to-env.ts
@@ -50,30 +50,32 @@ export async function applyUserAiSettingsToEnv(admin: SupabaseClient, userId: s
+export type ScopedAiClientConfig = {
+  provider: AIProvider
+  apiKey: string | null
+  model: string | null
+}
+
+export async function resolveScopedAiSettings(
+  admin: SupabaseClient,
+  userId: string
+): Promise<ScopedAiClientConfig> {
   const globalSettingsMap: Record<string, string> = {}
   try {
     const { data: globalRows } = await admin.from('system_settings').select('key, value')
     for (const row of globalRows ?? []) {
       globalSettingsMap[String(row.key)] = String(row.value ?? '')
     }
   } catch (error) {
     console.warn('[resolveScopedAiSettings] Falha ao ler system_settings', error)
   }
 
   const { data: row } = await admin
     .from('ai_settings')
     .select('*')
     .eq('user_id', userId)
     .maybeSingle()
 
   const active = row ? parseProvider(row.active_provider) : parseProvider(globalSettingsMap.ai_provider)
-  process.env.AI_PROVIDER = active
-  // NUNCA mutar process.env globalmente
   let key: string | null = null
   if (row) {
     const enc = row[`${active}_api_key`]
     if (enc) key = decryptString(enc)
   }
   if (!key) {
     key = globalSettingsMap[`${active}_api_key`] || process.env[API_KEY_ENV_KEYS[active]] || null
   }
-  return active
+  return {
+    provider: active,
+    apiKey: key,
+    model: globalSettingsMap[`${active}_model`] || process.env[MODEL_ENV_KEYS[active]] || null,
+  }
 }
```

---

## 3. PATCH PROPOSTO 3: Correção de Ownership em `DELETE /api/events/[eventId]` (VULN-04 - P1)

### Arquivo Alvo
`frontend/src/app/api/events/[eventId]/route.ts` (linhas 100–125)

### Condição e Impacto
A rota emite logs de auditoria e insere em `event_deletion_events` relacionando `user.tenantId` com o `eventId` fornecido na URL **antes** de verificar se aquele evento pertence à organização do usuário.

### Patch Proposto
```diff
--- a/frontend/src/app/api/events/[eventId]/route.ts
+++ b/frontend/src/app/api/events/[eventId]/route.ts
@@ -104,6 +104,13 @@ export async function DELETE(req: Request, ctx: { params: Promise<{ eventId: st
     const user = await requireAdmin(req)
     const { eventId } = await ctx.params
     const admin = getSupabaseAdmin()
+
+    // Validar se o evento existe e pertence à organização antes de auditar ou negar
+    const { data: eventExists, error: lookupError } = await admin
+      .from('events')
+      .select('id')
+      .eq('id', eventId)
+      .eq('tenant_id', user.tenantId)
+      .maybeSingle()
+    if (lookupError || !eventExists) {
+      return jsonError(requestId, 'EVENT_NOT_FOUND', 'Evento não encontrado.', 404)
+    }
+
     const publicUserId = await resolvePublicUserId({
       admin,
       tenantId: user.tenantId,
```

---

## 4. PATCH PROPOSTO 4: Depreciação ou Resolução Autoritativa no Backend FastAPI (VULN-01 - P0)

### Arquivo Alvo
`backend/app/api/routes/events.py`, `analyses.py`, `actions.py`, `credits.py`

### Condição e Impacto
O backend consome `user.user.user_metadata.get("tenant_id")`, permitindo que qualquer usuário autenticado altere seu metadado e comprometa qualquer organização do sistema.

### Patch Proposto
No arquivo de dependências `backend/app/api/deps.py`:

```diff
--- a/backend/app/api/deps.py
+++ b/backend/app/api/deps.py
@@ -1,6 +1,6 @@
 from fastapi import Header, HTTPException
-from supabase import Client
 from app.database import get_supabase_client, get_supabase_admin
 
-async def get_current_user(authorization: str = Header(...)):
+async def get_current_user_context(authorization: str = Header(...)):
     if not authorization.startswith("Bearer "):
         raise HTTPException(status_code=401, detail="Token inválido")
     token = authorization.split(" ")[1]
@@ -9,6 +9,23 @@ async def get_current_user(authorization: str = Header(...)):
     try:
         user = client.auth.get_user(token)
-        return user
+        admin = get_supabase_admin()
+        # Resolução DB-autoritativa a partir de public.users:
+        user_row = admin.table("users")\
+            .select("id, tenant_id, role, is_active")\
+            .eq("id", user.user.id)\
+            .single()\
+            .execute()
+        if not user_row.data or not user_row.data.get("is_active"):
+            raise HTTPException(status_code=403, detail="Conta inativa ou não autorizada")
+        return {
+            "auth_user_id": user.user.id,
+            "public_user_id": user_row.data["id"],
+            "tenant_id": user_row.data["tenant_id"],
+            "role": user_row.data["role"],
+            "email": getattr(user.user, "email", None),
+        }
     except Exception:
         raise HTTPException(status_code=401, detail="Não autorizado")
```

Em todas as rotas Python, substituir `user.user.user_metadata.get("tenant_id")` por `user_ctx["tenant_id"]`.
*(Alternativa recomendada: desativar o backend Python caso o frontend Next.js seja a runtime definitiva em produção).*
