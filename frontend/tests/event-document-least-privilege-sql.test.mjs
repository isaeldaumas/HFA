import assert from 'node:assert/strict'
import {test} from 'node:test'
import {readFileSync} from 'node:fs'
const sql=readFileSync(
  new URL('../../supabase/migrations/20261112203000_event_document_least_privilege.sql',import.meta.url),'utf8')
test('public/tenant roles lose TRUNCATE and all mutation grants',()=>{
  assert.match(sql,/REVOKE ALL PRIVILEGES ON TABLE public\.event_documents FROM anon, authenticated/)
  assert.match(sql,/GRANT SELECT ON TABLE public\.event_documents TO authenticated/)
  assert.doesNotMatch(sql,/GRANT .* TO anon/i)
})
test('RLS is enabled and derives tenant from canonical auth_user_id resolver, not legacy public users id',()=>{
  assert.match(sql,/ALTER TABLE public\.event_documents ENABLE ROW LEVEL SECURITY/)
  assert.match(sql,/FOR SELECT TO authenticated/)
  assert.match(sql,/USING \(tenant_id = \(SELECT public\.get_tenant_id\(\)\)\)/)
  assert.doesNotMatch(sql,/u\.id = auth\.uid\(\)/)
})
test('no data rewrite or destructive DDL',()=>{
  assert.doesNotMatch(sql,/DROP TABLE|TRUNCATE TABLE|DELETE FROM|UPDATE public\.event_documents|ALTER TABLE.*DROP COLUMN/i)
  assert.doesNotMatch(sql,/REVOKE .*FROM service_role/i)
})
