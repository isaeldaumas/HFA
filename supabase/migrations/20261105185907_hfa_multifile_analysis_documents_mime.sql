-- HFA V27: habilitar tipos documentais explicitamente aceitos pela UI multifile.
-- APENAS MIGRACAO LOCAL: não executar em produção sem homologação independente.
--
-- Diagnóstico read-only em 2026-11-05:
-- bucket analysis-documents privado, file_size_limit=10485760,
-- allowed_mime_types: PDF e DOCX exclusivamente.
--
-- Preserva bucket privado e tamanho individual de 10 MB, sem alterar RLS,
-- nomes de objetos existentes ou políticas de leitura/exclusão.
--
-- Execute primeiro em staging isolado com dois tenants sintéticos e valide
-- o MIME para TXT/PNG/JPEG/WebP. O novo fluxo servidor valida assinatura,
-- extensão, tamanho e tenant antes de tentar armazenar.

DO $hfa_multifile_mimes$
DECLARE
  stored_mimes text[];
  is_public boolean;
  size_limit bigint;
  original_mimes text[] := ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[];
  expanded_mimes text[] := ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[];
BEGIN
  SELECT b.allowed_mime_types, b.public, b.file_size_limit
    INTO stored_mimes, is_public, size_limit
    FROM storage.buckets AS b
   WHERE b.id = 'analysis-documents'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HFA_MULTIFILE_BUCKET_NOT_FOUND';
  END IF;
  IF is_public IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'HFA_MULTIFILE_BUCKET_NOT_PRIVATE';
  END IF;
  IF size_limit IS DISTINCT FROM 10485760 THEN
    RAISE EXCEPTION 'HFA_MULTIFILE_BUCKET_SIZE_DRIFT';
  END IF;
  IF stored_mimes IS DISTINCT FROM original_mimes
     AND stored_mimes IS DISTINCT FROM expanded_mimes THEN
    RAISE EXCEPTION 'HFA_MULTIFILE_BUCKET_MIMES_DRIFT';
  END IF;

  UPDATE storage.buckets
     SET allowed_mime_types = expanded_mimes
   WHERE id = 'analysis-documents';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'HFA_MULTIFILE_BUCKET_UPDATE_NOT_APPLIED';
  END IF;
END;
$hfa_multifile_mimes$;
