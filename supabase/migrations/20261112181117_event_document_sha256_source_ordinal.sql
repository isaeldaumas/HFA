-- Additive, backward-compatible groundwork for per-file provenance.
-- No OCR, multi-upload activation, or alteration to P/O/A engine inputs.
ALTER TABLE public.event_documents
  ADD COLUMN IF NOT EXISTS content_sha256 text,
  ADD COLUMN IF NOT EXISTS source_ordinal smallint NOT NULL DEFAULT 1;

DO $migrate$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_documents'::regclass
      AND conname = 'event_documents_sha256_hex_check'
  ) THEN
    ALTER TABLE public.event_documents ADD CONSTRAINT event_documents_sha256_hex_check
      CHECK (content_sha256 IS NULL OR content_sha256 ~ '^[0-9a-f]{64}$');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.event_documents'::regclass
      AND conname = 'event_documents_source_ordinal_check'
  ) THEN
    ALTER TABLE public.event_documents ADD CONSTRAINT event_documents_source_ordinal_check
      CHECK (source_ordinal BETWEEN 1 AND 5);
  END IF;
END
$migrate$;

-- One stable position per source in each event; protects ordering and makes
-- eventual 3-5 source ingestion explicit rather than accidentally overwriting.
CREATE UNIQUE INDEX IF NOT EXISTS event_documents_tenant_event_ordinal_unique
  ON public.event_documents (tenant_id, event_id, source_ordinal);

COMMENT ON COLUMN public.event_documents.content_sha256 IS
  'Lowercase hex SHA-256 of original stored bytes; NULL means legacy/unverified, not proof of absence.';
COMMENT ON COLUMN public.event_documents.source_ordinal IS
  'Original source position 1..5. Current creation uses 1; multi-source capture remains disabled.';
