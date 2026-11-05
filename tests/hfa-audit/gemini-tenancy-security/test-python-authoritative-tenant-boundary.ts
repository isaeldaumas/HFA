/** Static source contract: Python legacy routes never trust user metadata. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
const ROUTES = ['events', 'analyses', 'actions', 'credits']
const get = (p: string) => readFileSync(path.join(ROOT, p), 'utf8')
for (const route of ROUTES) {
  const src = get('backend/app/api/routes/' + route + '.py')
  assert.doesNotMatch(src, /user\.user\.user_metadata|user_metadata\.get/)
  assert.doesNotMatch(src, /Depends\(get_current_user\)/)
  assert.match(src, /get_authorized_user/)
}
const auth = get('backend/app/api/routes/auth.py')
assert.doesNotMatch(auth, /user\.user\.user_metadata|user_metadata\.get/)
assert.match(auth, /get_authorized_user/)
assert.match(auth, /resolve_authorized_user/)
const event = get('backend/app/api/routes/events.py')
assert.doesNotMatch(event, /\.eq\("email",\s*user_email\)/)
assert.match(event, /user\.public_user_id/)
const flows = get('backend/app/api/routes/analyses.py')
assert.match(flows, /\.eq\("tenant_id", current_user\.tenant_id\)/)
const deps = get('backend/app/api/deps.py')
assert.match(deps, /resolve_authorized_user\(get_supabase_admin\(\), user\.user\)/)
const helper = get('backend/app/api/authoritative_user.py')
assert.match(helper, /"auth_user_id"/)
assert.match(helper, /LEGACY_CONFIRMED_EMAIL/)
assert.doesNotMatch(helper, /\.user_metadata|getattr\(.*user_metadata/)
console.log('PYTHON_DB_AUTHORITATIVE_TENANT_STATIC_PASS', {
  protectedRouteGroups: ROUTES.length,
  bootstrapNoMetadata: true,
  source: 'PUBLIC_USERS_DATABASE',
  stagingE2E: 'NOT_RUN',
})
