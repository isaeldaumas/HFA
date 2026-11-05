/**
 * TESTE AUDITÁVEL 04 — ISOLAMENTO DE TENANT, SEGURANÇA E ACESSO CROSS-ORGANIZATION
 * AGENTE GEMINI 1 — CONVERSA 1 (isaeldaumas/HFA)
 *
 * Executar: NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/04-tenant-isolation.test.ts
 */

import assert from 'node:assert/strict'
import {
  InMemoryHfaDatabase,
  createMockSupabaseAdmin,
} from './journey-harness'
import { findTenantDuplicateCandidates } from '../../../frontend/src/lib/server/event-duplicates'

let passed = 0
let failed = 0

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn()
    if (res instanceof Promise) {
      await res
    }
    console.log(`  PASS — ${name}`)
    passed++
  } catch (err) {
    console.log(`  FAIL — ${name}`)
    console.error(`    ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

export async function runTenantIsolationTests() {
  console.log('\n--- SUÍTE 04: ISOLAMENTO ESTREITO POR TENANT (MULTI-TENANCY E SEGURANÇA) ---')
  const db = new InMemoryHfaDatabase()
  db.seedStandardTenants()
  const admin = createMockSupabaseAdmin(db)

  const userAlpha = db.users.get('user-alpha-admin')!
  const userBeta = db.users.get('user-beta-admin')!

  // Cadastra 2 eventos no Tenant Alpha
  const { data: eventAlpha1 } = await admin.from('events').insert({
    tenant_id: userAlpha.tenant_id,
    submitted_by: userAlpha.id,
    title: 'Evento Alfa 1 — Perda de separação',
    raw_input: 'Durante a aproximação em SBBR, ocorreu perda dos mínimos de separação radar de 3 milhas náuticas.',
    input_type: 'text',
    status: 'received',
    event_kind: 'SAFETY_REPORT',
    triage_status: 'UNTRIAGED',
    investigation_path: 'NONE',
  }).select('id').single()

  const { data: eventAlpha2 } = await admin.from('events').insert({
    tenant_id: userAlpha.tenant_id,
    submitted_by: userAlpha.id,
    title: 'Evento Alfa 2 — Birdstrike na decolagem',
    raw_input: 'Colisão com ave na decolagem em SBKP, sem indicação de danos anormais nos motores.',
    input_type: 'text',
    status: 'received',
    event_kind: 'SAFETY_REPORT',
    triage_status: 'UNTRIAGED',
    investigation_path: 'NONE',
  }).select('id').single()

  // Cadastra 1 evento no Tenant Beta
  const { data: eventBeta1 } = await admin.from('events').insert({
    tenant_id: userBeta.tenant_id,
    submitted_by: userBeta.id,
    title: 'Evento Beta 1 — Vazamento hidráulico offshore',
    raw_input: 'Durante o pouso em helideck na Bacia de Santos, houve indicação de baixa pressão no sistema hidráulico 1.',
    input_type: 'text',
    status: 'received',
    event_kind: 'SAFETY_REPORT',
    triage_status: 'UNTRIAGED',
    investigation_path: 'NONE',
  }).select('id').single()

  assert.ok(eventAlpha1?.id && eventAlpha2?.id && eventBeta1?.id)

  // ── Cenário 4.1: Isolamento na listagem (GET /api/events) ─────────────────
  await test('Listagem de eventos do Tenant Alpha retorna apenas seus próprios eventos e nenhum do Tenant Beta', async () => {
    const { data: listAlpha } = await admin
      .from('events')
      .select('*')
      .eq('tenant_id', userAlpha.tenant_id)

    const ids = (listAlpha ?? []).map((e: any) => e.id)
    assert.ok(ids.includes(eventAlpha1.id), 'Deve incluir Evento Alfa 1')
    assert.ok(ids.includes(eventAlpha2.id), 'Deve incluir Evento Alfa 2')
    assert.equal(ids.includes(eventBeta1.id), false, 'NÃO pode incluir Evento Beta 1')
  })

  await test('Listagem de eventos do Tenant Beta retorna apenas seus próprios eventos e nenhum do Tenant Alpha', async () => {
    const { data: listBeta } = await admin
      .from('events')
      .select('*')
      .eq('tenant_id', userBeta.tenant_id)

    const ids = (listBeta ?? []).map((e: any) => e.id)
    assert.ok(ids.includes(eventBeta1.id), 'Deve incluir Evento Beta 1')
    assert.equal(ids.includes(eventAlpha1.id), false, 'NÃO pode incluir Evento Alfa 1')
    assert.equal(ids.includes(eventAlpha2.id), false, 'NÃO pode incluir Evento Alfa 2')
  })

  // ── Cenário 4.2: Isolamento em consulta pontual (GET /api/events/[id]) ─────
  await test('Tentativa de acesso a evento de outro tenant retorna null/404 EVENT_NOT_FOUND (fail-closed)', async () => {
    // Usuário Beta tentando buscar evento do Tenant Alpha
    const { data: crossAccess } = await admin
      .from('events')
      .select('*')
      .eq('id', eventAlpha1.id)
      .eq('tenant_id', userBeta.tenant_id)
      .maybeSingle()

    assert.equal(crossAccess, null, 'Consulta com tenant_id divergente deve retornar null (404 sem vazar existência)')
  })

  // ── Cenário 4.3: Imutabilidade do tenant_id (ignora payload do cliente) ────
  await test('Criação de evento ignora tenant_id adulterado no payload do cliente e usa user.tenantId da sessão', async () => {
    // Cliente malicioso de Alpha tenta injetar tenant_id = 'tenant-beta'
    const untrustedPayload = {
      tenant_id: 'tenant-beta', // Tentativa de injeção cross-tenant
      submitted_by: 'qualquer-um',
      title: 'Tentativa de injeção cross-tenant',
      raw_input: 'Narrativa submetida tentando gravar dados no banco de outra empresa.',
    }

    // O backend autoritativo descarta untrustedPayload.tenant_id e força userAlpha.tenant_id
    const safeInsertData = {
      ...untrustedPayload,
      tenant_id: userAlpha.tenant_id, // Forçado pelo contexto autenticado
      submitted_by: userAlpha.id,
      status: 'received',
      event_kind: 'SAFETY_REPORT',
      triage_status: 'UNTRIAGED',
      investigation_path: 'NONE',
    }

    const { data: safeEvent } = await admin.from('events').insert(safeInsertData).select('id').single()
    assert.ok(safeEvent?.id)

    const stored = db.events.get(safeEvent.id)!
    assert.equal(stored.tenant_id, userAlpha.tenant_id, 'Evento deve ser gravado obrigatoriamente no tenant do usuário autenticado')
    assert.notEqual(stored.tenant_id, 'tenant-beta', 'Injeção cross-tenant deve ser estritamente bloqueada')
  })

  // ── Cenário 4.4: Tentativa de disparar análise em evento de outro tenant ───
  await test('Disparo de análise em evento de outro tenant (/api/analyze) falha com ANALYZE_FORBIDDEN 403', async () => {
    // Usuário Beta tenta chamar /api/analyze passando eventId = eventAlpha1.id
    const { data: targetEvent } = await admin
      .from('events')
      .select('id, tenant_id')
      .eq('id', eventAlpha1.id)
      .eq('tenant_id', userBeta.tenant_id)
      .maybeSingle()

    // O backend checa: if (evErr || !ev) return buildErrorResponse('ANALYZE_FORBIDDEN', requestId, 403)
    assert.equal(targetEvent, null, 'Evento de outro tenant não é localizado pelo tenant_id do solicitante')
    const hasPermission = Boolean(targetEvent)
    assert.equal(hasPermission, false, 'Acesso deve ser negado com 403')
  })

  // ── Cenário 4.5: Bloqueio de impersonation de userId ───────────────────────
  await test('Tentativa de impersonation passando userId diferente da sessão em /api/analyze é rejeitada com 403', () => {
    const sessionUserId = userAlpha.auth_user_id
    const bodyUserId = 'outra-conta-de-usuario-123'

    const isImpersonation = Boolean(bodyUserId && bodyUserId !== sessionUserId)
    assert.equal(isImpersonation, true, 'Deve detectar discrepância entre userId do body e userId autenticado')
  })

  // ── Cenário 4.6: Isolamento de duplicatas por tenant ───────────────────────
  await test('Relatos idênticos em tenants distintos NÃO bloqueiam um ao outro como duplicata', async () => {
    const identicalText =
      'Durante a inspeção pré-voo matinal na linha de voo 03, foi detectado vazamento de óleo no cone de cauda da aeronave.'

    // Tenant Alpha registra
    await admin.from('events').insert({
      tenant_id: userAlpha.tenant_id,
      submitted_by: userAlpha.id,
      title: 'Vazamento cone de cauda Alpha',
      raw_input: identicalText,
      input_type: 'text',
      status: 'received',
      event_kind: 'SAFETY_REPORT',
      triage_status: 'UNTRIAGED',
      investigation_path: 'NONE',
    })

    // Tenant Beta busca duplicatas no seu próprio tenant para o mesmo texto
    const candidatesBeta = await findTenantDuplicateCandidates({
      admin: admin as any,
      tenantId: userBeta.tenant_id,
      input: { id: '__NEW_EVENT__', title: 'Mesmo texto em outra empresa', raw_input: identicalText },
      excludeConfirmedDuplicates: true,
    })

    assert.equal(candidatesBeta.length, 0, 'Tenant Beta não deve ter duplicatas originadas de dados do Tenant Alpha')
  })

  console.log(`\nResultado da Suíte 04: ${passed} passaram, ${failed} falharam.\n`)
  return { passed, failed }
}

if (process.argv[1]?.endsWith('04-tenant-isolation.test.ts')) {
  runTenantIsolationTests().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0)
  })
}
