import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../../supabase/migrations/20261111222007_registration_email_atomic_rate_limit.sql', import.meta.url), 'utf8')
const route = readFileSync(new URL('../src/lib/server/register-handler.ts', import.meta.url), 'utf8')

test('only private hashed counters, RLS and service-role table grants', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS private\.hfa_registration_rate_buckets/)
  assert.match(sql, /token_hash text PRIMARY KEY CHECK/)
  assert.doesNotMatch(sql, /(?:\bemail\b|\bip_address\b)\s+(?:text|varchar|inet)/i)
  assert.match(sql, /ALTER TABLE private\.hfa_registration_rate_buckets ENABLE ROW LEVEL SECURITY/)
  assert.match(sql, /REVOKE ALL ON TABLE private\.hfa_registration_rate_buckets FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE private\.hfa_registration_rate_buckets TO service_role/)
  assert.match(sql, /updated_at < v_now - INTERVAL '3 days'/)
})

test('atomic invoker RPC rejects unsafe input and is uncallable by public roles', () => {
  assert.match(sql, /SECURITY INVOKER/)
  assert.match(sql, /SET search_path = ''/)
  assert.match(sql, /ON CONFLICT \(token_hash\) DO UPDATE/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.hfa_registration_rate_limit_consume\(text, integer, integer\)\s+FROM PUBLIC, anon, authenticated/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.hfa_registration_rate_limit_consume\(text, integer, integer\)\s+TO service_role/)
  assert.match(sql, /IF p_token_hash IS NULL/)
})

test('rate budget completes before any tenant or invited Auth identity is created', () => {
  const budget = route.indexOf('await consumeRegistrationBudget(')
  const dbInsert = route.indexOf("from('tenants')", budget)
  const invite = route.indexOf('inviteUserByEmail(')
  assert.ok(budget > 0)
  assert.ok(dbInsert > budget)
  assert.ok(invite > dbInsert)
  assert.match(route, /budget === 'limited'/)
  assert.match(route, /budget !== 'allowed'/)
})
