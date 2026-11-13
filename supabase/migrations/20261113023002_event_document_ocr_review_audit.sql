-- OCR human transcription attestations: separate from SERA, event narrative and classifications.
-- Confidential OCR text is service-only. No browser SQL SELECT/INSERT/UPDATE/DELETE.
-- A row represents authenticated self-attestation, NOT verification of OCR
-- correctness, independent reviewer certification or scientific validation.
CREATE UNIQUE INDEX IF NOT EXISTS event_documents_tenant_event_document_key
  ON public.event_documents (tenant_id,event_id,id);

CREATE TABLE IF NOT EXISTS public.event_document_ocr_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  event_id uuid NOT NULL,
  document_id uuid NOT NULL,
  reviewed_by uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  reviewer_auth_sha256 text NOT NULL CHECK (reviewer_auth_sha256 ~ '^[a-f0-9]{64}$'),
  source_ordinal smallint NOT NULL CHECK (source_ordinal BETWEEN 1 AND 5),
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_mime_type text NOT NULL CHECK
    (source_mime_type IN ('application/pdf','image/png','image/jpeg','image/webp')),
  page_number integer NULL CHECK (page_number BETWEEN 1 AND 80),
  ocr_text text NOT NULL CHECK (char_length(ocr_text) BETWEEN 1 AND 60000),
  corrected_text text NOT NULL CHECK (char_length(corrected_text) BETWEEN 1 AND 60000),
  ocr_sha256 text NOT NULL CHECK (ocr_sha256 ~ '^[a-f0-9]{64}$'),
  corrected_sha256 text NOT NULL CHECK (corrected_sha256 ~ '^[a-f0-9]{64}$'),
  payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  declaration text NOT NULL DEFAULT 'AUTHENTICATED_SELF_DECLARATION' CHECK
    (declaration = 'AUTHENTICATED_SELF_DECLARATION'),
  scientifically_validated boolean NOT NULL DEFAULT false CHECK (scientifically_validated = false),
  analysis_changed boolean NOT NULL DEFAULT false CHECK (analysis_changed = false),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_document_ocr_review_pdf_page_check CHECK (
    (source_mime_type='application/pdf' AND page_number IS NOT NULL) OR
    (source_mime_type<>'application/pdf' AND page_number IS NULL)
  ),
  CONSTRAINT event_document_ocr_review_source_fk
    FOREIGN KEY (tenant_id,event_id,document_id)
    REFERENCES public.event_documents(tenant_id,event_id,id)
    ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS event_document_ocr_reviews_retry_key
  ON public.event_document_ocr_reviews
  (tenant_id,document_id,reviewer_auth_sha256,payload_sha256);
CREATE INDEX IF NOT EXISTS event_document_ocr_reviews_tenant_source_recent
  ON public.event_document_ocr_reviews(tenant_id,event_id,document_id,created_at DESC);

-- Prevent accidental overwrite; deletion is allowed exclusively by privileged
-- retention/purge cascade when its original source is removed.
CREATE OR REPLACE FUNCTION public.prevent_event_document_ocr_review_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'OCR review records are immutable';
END;
$$;
DROP TRIGGER IF EXISTS event_document_ocr_review_no_update
  ON public.event_document_ocr_reviews;
CREATE TRIGGER event_document_ocr_review_no_update
  BEFORE UPDATE ON public.event_document_ocr_reviews
  FOR EACH ROW EXECUTE FUNCTION public.prevent_event_document_ocr_review_update();

ALTER TABLE public.event_document_ocr_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.event_document_ocr_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_event_document_ocr_review_update()
  FROM PUBLIC, anon, authenticated;
-- In particular, direct authenticated REST must NEVER expose the review text.
-- The only access path is the server's bearer-validated tenant-scoped endpoints.

COMMENT ON TABLE public.event_document_ocr_reviews IS
'Confidential OCR transcription self-attestations: tenant/event/document scoped; immutable, service-only, purged with source. Not scientific SERA approval.';
