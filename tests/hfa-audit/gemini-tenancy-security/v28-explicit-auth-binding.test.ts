import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveAuthorizedUserContext } from '../../../frontend/src/lib/server/authorized-user-context'
import { resolvePublicUserId } from '../../../frontend/src/lib/server/event-deletion'

const A = '10000000-aaaa-4000-a000-000000000001'
const B = '20000000-bbbb-4000-b000-000000000002'
const PUBLIC = '30000000-cccc-4000-a000-000000000003'
const TENANT = '40000000-dddd-4000-a000-000000000004'
const OTHER = '50000000-eeee-4000-a000-000000000005'

type Row = Record<string, unknown>
function row(id: string, auth: string | null, email = 'pilot@synthetic.example', active = true): Row {
  return {
    id, auth_user_id: auth, email, role: 'admin', is_active: active,
    tenant_id: TENANT,
  }
}
function fakeAdmin(users: Row[], tenants: Row[] = [{ id: TENANT, is_active: true }]) {
  const log: { table: string; clauses: [string, unknown][] }[] = []
  const client = {
    from(table: string) {
      const clauses: [string, unknown][] = []
      const builder = {
        select(_fields: string) { return this },
        eq(field: string, value: unknown) { clauses.push([field, value]); return this },
        limit(_count: number) { return this },
        async maybeSingle() {
          log.push({ table, clauses: [...clauses] })
          const source = table === 'users' ? users : tenants
          const matches = source.filter(r => clauses.every(([key, value]) => r[key] === value))
          return { data: matches[0] ?? null, error: matches.length > 1 ? { message: 'ambiguous' } : null }
        },
        then(done: (answer: { data: Row[]; error: null }) => unknown) {
          log.push({ table, clauses: [...clauses] })
          const source = table === 'users' ? users : tenants
          const matches = source.filter(r => clauses.every(([key, value]) => r[key] === value))
          return Promise.resolve(done({ data: matches, error: null }))
        },
      }
      return builder
    },
  }
  return { client: client as never, log }
}

test('direct identity with matching auth_user_id is allowed from DB', async () => {
  const db = fakeAdmin([row(A, A)])
  const answer = await resolveAuthorizedUserContext(db.client, { authUserId: A })
  assert.equal(answer.ok, true)
  if (answer.ok) {
    assert.equal(answer.context.identityBinding, 'DIRECT_AUTH_ID')
    assert.equal(answer.context.publicUserId, A)
    assert.equal(answer.context.tenantId, TENANT)
  }
})

test('direct UUID collision with different auth_user_id is denied, not email-fallback', async () => {
  const db = fakeAdmin([row(A, B)])
  const answer = await resolveAuthorizedUserContext(db.client, {
    authUserId: A, email: 'pilot@synthetic.example', emailConfirmedAt: '2026-11-05',
  })
  assert.equal(answer.ok, false)
  if (!answer.ok) {
    assert.equal(answer.status, 403)
    assert.match(answer.detail, /Vínculo/)
  }
  assert.equal(db.log.filter(x => x.table === 'tenants').length, 0)
})

test('two different public rows claiming one Auth UUID are rejected before roles or tenant', async () => {
  const db = fakeAdmin([row(A, null), row(PUBLIC, A)])
  const answer = await resolveAuthorizedUserContext(db.client, {
    authUserId: A, email: 'pilot@synthetic.example', emailConfirmedAt: '2026-11-05',
  })
  assert.equal(answer.ok, false)
  if (!answer.ok) {
    assert.equal(answer.status, 403)
    assert.match(answer.detail, /ambíguo/)
  }
  assert.equal(db.log.filter(x => x.table === 'tenants').length, 0)
})

test('explicit auth_user_id binds a legacy public UUID even if email changed', async () => {
  const db = fakeAdmin([row(PUBLIC, A, 'old@synthetic.example')])
  const answer = await resolveAuthorizedUserContext(db.client, {
    authUserId: A, email: 'new@synthetic.example', emailConfirmedAt: null,
  })
  assert.equal(answer.ok, true)
  if (answer.ok) {
    assert.equal(answer.context.identityBinding, 'EXPLICIT_AUTH_LINK')
    assert.equal(answer.context.publicUserId, PUBLIC)
    assert.equal(answer.context.tenantId, TENANT)
  }
})

test('explicit auth_user_id never grants an inactive account', async () => {
  const db = fakeAdmin([row(PUBLIC, A, 'pilot@synthetic.example', false)])
  const answer = await resolveAuthorizedUserContext(db.client, { authUserId: A })
  assert.equal(answer.ok, false)
  if (!answer.ok) assert.equal(answer.status, 403)
})

test('explicit auth_user_id never grants access to a disabled tenant', async () => {
  const db = fakeAdmin([row(PUBLIC, A)], [{ id: TENANT, is_active: false }])
  const answer = await resolveAuthorizedUserContext(db.client, { authUserId: A })
  assert.equal(answer.ok, false)
  if (!answer.ok) assert.equal(answer.status, 403)
})

test('confirmed unbound legacy email is temporarily supported', async () => {
  const db = fakeAdmin([row(PUBLIC, null)])
  const answer = await resolveAuthorizedUserContext(db.client, {
    authUserId: A, email: 'pilot@synthetic.example', emailConfirmedAt: '2026-11-05',
  })
  assert.equal(answer.ok, true)
  if (answer.ok) assert.equal(answer.context.identityBinding, 'LEGACY_CONFIRMED_EMAIL')
})

test('legacy email bound to a different Auth identity is denied despite confirmation', async () => {
  const db = fakeAdmin([row(PUBLIC, B)])
  const answer = await resolveAuthorizedUserContext(db.client, {
    authUserId: A, email: 'pilot@synthetic.example', emailConfirmedAt: '2026-11-05',
  })
  assert.equal(answer.ok, false)
  if (!answer.ok) assert.equal(answer.status, 403)
})

test('unconfirmed legacy email is denied, including unbound rows', async () => {
  const db = fakeAdmin([row(PUBLIC, null)])
  const answer = await resolveAuthorizedUserContext(db.client, {
    authUserId: A, email: 'pilot@synthetic.example', emailConfirmedAt: null,
  })
  assert.equal(answer.ok, false)
  if (!answer.ok) assert.equal(answer.status, 403)
})

test('deletion actor lookup refuses direct row tied to another auth user', async () => {
  const db = fakeAdmin([row(A, B)])
  await assert.rejects(
    resolvePublicUserId({ admin: db.client, tenantId: TENANT, authUserId: A }),
    /EVENT_DELETE_FORBIDDEN/,
  )
})

test('deletion actor lookup rejects two different public rows for one Auth UUID', async () => {
  const db = fakeAdmin([row(A, null), row(PUBLIC, A)])
  await assert.rejects(
    resolvePublicUserId({ admin: db.client, tenantId: TENANT, authUserId: A }),
    /EVENT_DELETE_FORBIDDEN/,
  )
})

test('deletion actor lookup resolves explicitly linked public ID instead of email', async () => {
  const db = fakeAdmin([row(PUBLIC, A, 'old@synthetic.example')])
  const result = await resolvePublicUserId({
    admin: db.client, tenantId: TENANT, authUserId: A,
    email: 'new@synthetic.example',
  })
  assert.equal(result, PUBLIC)
})

test('deletion actor lookup refuses legacy email row tied to other Auth ID', async () => {
  const db = fakeAdmin([row(PUBLIC, B)])
  await assert.rejects(
    resolvePublicUserId({
      admin: db.client, tenantId: TENANT, authUserId: A,
      email: 'pilot@synthetic.example',
    }),
    /EVENT_DELETE_FORBIDDEN/,
  )
})

test('deletion actor lookup supports unbound legacy row within requesting tenant', async () => {
  const db = fakeAdmin([row(PUBLIC, null)])
  const result = await resolvePublicUserId({
    admin: db.client, tenantId: TENANT, authUserId: A,
    email: 'pilot@synthetic.example',
  })
  assert.equal(result, PUBLIC)
})

test('deletion actor lookup denies rows with inactive or absent active flag', async () => {
  for (const active of [false, null, undefined]) {
    const target = row(A, A, 'pilot@synthetic.example')
    target.is_active = active
    const db = fakeAdmin([target])
    await assert.rejects(
      resolvePublicUserId({ admin: db.client, tenantId: TENANT, authUserId: A }),
      /EVENT_DELETE_FORBIDDEN/,
    )
  }
})

test('deletion actor lookup cannot use an account in a different tenant', async () => {
  const db = fakeAdmin([{ ...row(PUBLIC, A), tenant_id: OTHER }])
  await assert.rejects(
    resolvePublicUserId({
      admin: db.client, tenantId: TENANT, authUserId: A,
      email: 'pilot@synthetic.example',
    }),
    /EVENT_DELETE_FORBIDDEN/,
  )
})
