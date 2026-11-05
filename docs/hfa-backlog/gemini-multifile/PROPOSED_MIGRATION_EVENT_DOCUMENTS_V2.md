# PROPOSTA DE MIGRAÇÃO: EVENT_DOCUMENTS V2 & MULTI-FONTE NATIVO

**Autor:** AGENTE GEMINI 2  
**Data:** 05/11/2026  
**Contexto:** Issue #122 — Upload múltiplo e proveniência por arquivo no HFA  
**Status:** PROPOSTA EXPLICÍTA (NÃO EXECUTADA — aguardando autorização do coordenador/ChatGPT)

---

## 1. Diagnóstico do Schema Atual

Atualmente no Supabase (`supabase/migrations/20261002235131_safety_event_workflow_v1.sql`):
```sql
create table if not exists public.event_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  uploaded_by uuid references public.users(id) on delete set null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);
```

Além disso, o enum de `events.input_type` (`supabase/migrations/20260507105001_initial_schema.sql` e `20260508100000_sera_document_sources.sql`) é restrito a:
```sql
public.event_input_type as enum ('text', 'pdf', 'audio_transcript', 'docx');
```

### Limitações e Bloqueios Identificados
1. **Ausência de hash de integridade:** `event_documents` não possui coluna para `sha256_hash`, exigindo que a proveniência criptográfica seja persistida em `sera_vnext_analyses.metadata.sourceFiles`.
2. **Ausência de estado de extração por arquivo:** Não há coluna `extraction_status` ou `is_ocr_pending` para registrar formalmente se uma imagem está com OCR pendente ou se um PDF teve extração textual bem-sucedida.
3. **Ausência de texto extraído individual:** O texto extraído de cada documento não pode ser gravado individualmente na linha do documento em `event_documents`, sendo consolidado apenas no `events.raw_input`.
4. **Enum `event_input_type` restrito:** Falta o valor `'multifile'` no ENUM, exigindo que a rota `/api/events` classifique provisoriamente como `'pdf'`, `'docx'` ou `'text'` de acordo com os arquivos presentes.
5. **RLS Unilateral:** Existe apenas política `SELECT` em `event_documents`. Qualquer mutação futura via client SDK necessitaria de políticas de `INSERT` com verificação de tenant.

---

## 2. Camada de Compatibilidade em Produção (Implementada na Rodada)

Para respeitar a regra de governança ("Não crie migrações nem modifique schema Supabase"):
- **Compatibilidade Retroativa Total:** `/api/events` persiste todos os arquivos em `storage-path` único (`events/${userId}/${eventId}/${index}_${sha10}_${safeName}`) e insere cada arquivo nas colunas existentes de `event_documents`.
- **Manifesto Rico em Metadados:** Os metadados avançados (SHA-256 completo, status `'extracted'` | `'unsupported_ocr'`, contagem de palavras, erros individuais) são persistidos no JSONB `sera_vnext_analyses.metadata.sourceFiles`.
- **Top-Level Backward Compatibility:** `sourceFileName`, `sourceFileUrl` e `sourceType` mantêm compatibilidade para leituras legadas do evento.

---

## 3. SQL da Migração Proposta (V2)

Arquivo sugerido para aplicação futura: `supabase/migrations/20261105120000_multifile_event_documents_v2.sql`

```sql
-- 1. Expansao do ENUM de input_type para aceitar multiplas fontes
ALTER TYPE public.event_input_type ADD VALUE IF NOT EXISTS 'multifile';

-- 2. Evolucao da tabela public.event_documents com campos de proveniencia
ALTER TABLE public.event_documents
  ADD COLUMN IF NOT EXISTS sha256_hash text,
  ADD COLUMN IF NOT EXISTS extraction_status text NOT NULL DEFAULT 'extracted',
  ADD COLUMN IF NOT EXISTS extracted_text text,
  ADD COLUMN IF NOT EXISTS word_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_order integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 3. Indice de integridade por hash no tenant para deteccao de duplicatas
CREATE INDEX IF NOT EXISTS idx_event_documents_tenant_sha256
  ON public.event_documents (tenant_id, sha256_hash);

-- 4. Constraint de status de extracao
ALTER TABLE public.event_documents
  ADD CONSTRAINT chk_event_documents_extraction_status
  CHECK (extraction_status IN ('extracted', 'unsupported_ocr', 'corrupt', 'password_protected', 'invalid_type', 'too_large', 'mime_spoofing', 'parse_failed'));

-- 5. Politica RLS de insercao por tenant autenticado
CREATE POLICY event_documents_tenant_insert ON public.event_documents
  FOR INSERT TO authenticated WITH CHECK (
    exists (
      select 1 from public.users u
      where u.id = (select auth.uid())
        and u.tenant_id = event_documents.tenant_id
        and u.is_active = true
    )
  );

COMMENT ON COLUMN public.event_documents.sha256_hash IS 'Impressão digital SHA-256 para auditoria de proveniência e cadeia de custódia';
COMMENT ON COLUMN public.event_documents.extraction_status IS 'Estado da extração: extracted, unsupported_ocr, etc.';
```

---

## 4. Plano de Fase 2: OCR Real de Imagens

Quando autorizada a inclusão de OCR:
1. Adicionar provedor de OCR server-side auditado (ex.: Tesseract WebAssembly isolado ou serviço dedicado com controle de privacidade e fail-closed).
2. Atualizar `gemini-multifile-extractor.ts` para processar imagens detectadas via magic bytes (`jpeg`, `png`, `webp`) através do pipeline de OCR verificado.
3. Transicionar status de `unsupported_ocr` para `extracted` somente com validação métrica de precisão (WER/CER).
