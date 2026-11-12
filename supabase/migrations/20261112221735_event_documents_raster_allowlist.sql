-- Supplemental raster originals. No OCR or external provider is activated.
-- Apply only if the private document bucket retains the exact prior contract.
DO $$
DECLARE
  types text[];
  is_public boolean;
  max_bytes bigint;
  expected text[] := ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]::text[];
BEGIN
  SELECT allowed_mime_types, public, file_size_limit
    INTO types, is_public, max_bytes
    FROM storage.buckets
    WHERE id = 'analysis-documents'
    FOR UPDATE;
  IF NOT FOUND OR is_public IS DISTINCT FROM false OR
     max_bytes IS DISTINCT FROM 10485760 OR
     types IS NULL OR cardinality(types) <> cardinality(expected) OR
     NOT (types @> expected) THEN
    RAISE EXCEPTION 'HFA_RASTER_BUCKET_UNEXPECTED_CONFIGURATION';
  END IF;
  UPDATE storage.buckets
    SET allowed_mime_types = types || ARRAY['image/png','image/jpeg','image/webp']::text[]
    WHERE id = 'analysis-documents';
END
$$;
