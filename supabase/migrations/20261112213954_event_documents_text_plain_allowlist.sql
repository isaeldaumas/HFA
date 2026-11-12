-- Supplemental UTF-8 TXT originals; existing private PDF/DOCX bucket unchanged.
-- Security gate: never change a public or unexpected bucket configuration.
DO $$
DECLARE
  current_types text[];
  current_public boolean;
  current_limit bigint;
BEGIN
  SELECT allowed_mime_types, public, file_size_limit
    INTO current_types, current_public, current_limit
    FROM storage.buckets
    WHERE id = 'analysis-documents'
    FOR UPDATE;
  IF NOT FOUND OR current_public IS DISTINCT FROM false OR
    current_limit IS DISTINCT FROM 10485760 OR
    current_types IS NULL OR
    NOT (current_types @> ARRAY[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]::text[]) THEN
    RAISE EXCEPTION 'HFA_DOCUMENT_BUCKET_UNEXPECTED_CONFIGURATION';
  END IF;
  IF NOT ('text/plain' = ANY(current_types)) THEN
    UPDATE storage.buckets
      SET allowed_mime_types = array_append(current_types, 'text/plain')
      WHERE id = 'analysis-documents';
  END IF;
END
$$;
