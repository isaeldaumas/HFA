import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const sql = readFileSync(
  new URL('../../supabase/migrations/20261111233733_atomic_document_extraction_reservation.sql', import.meta.url),
  'utf8',
)
const route = readFileSync(new URL('../src/app/api/extract-document/route.ts', import.meta.url), 'utf8')

test('single DB transaction serializes per-user quota and reserves before extraction', () => {
  assert.match(sql, /SECURITY INVOKER/)
  assert.match(sql, /SET search_path = ''/)
  assert.match(sql, /pg_catalog\.pg_advisory_xact_lock/)
  assert.match(sql, /pg_catalog\.hashtextextended/)
  assert.match(sql, /FROM public\.sera_document_uploads/)
  assert.match(sql, /created_at >= v_now - INTERVAL '1 hour'/)
  assert.match(sql, /IF v_attempts >= 10/)
  assert.match(sql, /INSERT INTO public\.sera_document_uploads/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.hfa_reserve_document_extraction\(uuid\)\s+FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.hfa_reserve_document_extraction\(uuid\)\s+TO service_role/)
})

test('route reserves quota and fails closed before expensive parser starts', () => {
  const reserve = route.indexOf('await reserveDocumentExtractionQuota(')
  const extract = route.indexOf('await extractTextFromBuffer(')
  assert.ok(reserve > 0 && extract > reserve)
  assert.match(route, /quota === 'unavailable'/)
  assert.match(route, /quota === 'limited'/)
  assert.doesNotMatch(route, /from\('sera_document_uploads'\)/)
  assert.match(route, /readBoundedExtractionForm\(req\)/)
  assert.doesNotMatch(route, /console\.error\(e\)/)
})
