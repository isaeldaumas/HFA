-- Fail-closed content-addressed idempotency for concurrent appends.
-- Existing null hashes remain allowed and are NEVER presented as validated.
-- Unique constraint does not affect source ordering or SERA results.
CREATE UNIQUE INDEX IF NOT EXISTS event_documents_tenant_event_hash_unique
ON public.event_documents (tenant_id, event_id, content_sha256)
WHERE content_sha256 IS NOT NULL;
