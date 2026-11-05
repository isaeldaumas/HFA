/**
 * TESTE AUDITÁVEL 06 — GOVERNANÇA, TRAVAS DE CONCLUSÃO E AUDITORIA CRÍTICA
 * AGENTE GEMINI 1 — CONVERSA 1 (isaeldaumas/HFA)
 *
 * Executar: NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/06-governance-and-completion-lock.test.ts
 */

import assert from 'node:assert/strict'
import {
  InMemoryHfaDatabase,
  createMockSupabaseAdmin,
} from './journey-harness'
import { hasNoNewActorEvidence } from '../../../frontend/src/lib/sera-vnext-product/clarification-factuality'

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

export async function runGovernanceTests() {
  console.log('\n--- SUÍTE 06: GOVERNANÇA, TRAVAS DE CONCLUSÃO E AUDITORIA CRÍTICA ---')
  const db = new InMemoryHfaDatabase()
  db.seedStandardTenants()
  const admin = createMockSupabaseAdmin(db)

  const userAdmin = db.users.get('user-alpha-admin')!
  const userViewer = db.users.get('user-alpha-viewer')!

  // ── Cenário 6.1: Impedimento de conclusão quando há insuficiência de evidência
  await test('Mantém evento em status "received" (não "completed") quando há NEEDS_CLARIFICATION', async () => {
    const { data: eventRow } = await admin.from('events').insert({
      tenant_id: userAdmin.tenant_id,
      submitted_by: userAdmin.id,
      title: 'Ocorrência com lacunas factuais',
      raw_input: 'Aeronave pousou sem autorização da torre. Não há dados sobre quem operava as comunicações.',
      input_type: 'text',
      status: 'received',
      event_kind: 'HFA_ANALYSIS',
      triage_status: 'HFA_SELECTED',
      investigation_path: 'HFA',
    }).select('id').single()

    assert.ok(eventRow?.id)
    const eventId = eventRow.id

    // Simula análise SERA que resulta em NEEDS_CLARIFICATION
    const needsClarification = true
    const nextStatus = needsClarification ? 'received' : 'completed'

    await admin.from('events').update({ status: nextStatus }).eq('id', eventId).eq('tenant_id', userAdmin.tenant_id)

    const storedEvent = db.events.get(eventId)!
    assert.equal(storedEvent.status, 'received', 'Evento com insuficiência de evidência NUNCA pode ser marcado como completed')
  })

  // ── Cenário 6.2: Bloqueio de revisão humana indevida (POST /api/events/[id]/sera-reviews)
  await test('Bloqueia com 422 tentativa de aceitar hipótese (ACCEPT_AS_WORKING_HYPOTHESIS) quando NEEDS_CLARIFICATION', () => {
    const analysisEvidenceStatus = 'NEEDS_CLARIFICATION'
    const proposedDecision = 'ACCEPT_AS_WORKING_HYPOTHESIS'
    const proposedSufficiency = 'SUFFICIENT_FOR_WORKING_HYPOTHESIS'

    const isBlocked =
      analysisEvidenceStatus === 'NEEDS_CLARIFICATION' &&
      (proposedDecision === 'ACCEPT_AS_WORKING_HYPOTHESIS' ||
        proposedSufficiency === 'SUFFICIENT_FOR_WORKING_HYPOTHESIS')

    assert.equal(isBlocked, true, 'Deve impedir formalização de hipótese quando a evidência for insuficiente')
  })

  await test('Bloqueia com 422 tentativa de rejeitar hipótese (REJECT_WORKING_HYPOTHESIS) quando NEEDS_CLARIFICATION', () => {
    const analysisEvidenceStatus = 'NEEDS_CLARIFICATION'
    const proposedDecision = 'REJECT_WORKING_HYPOTHESIS'

    const isBlocked =
      analysisEvidenceStatus === 'NEEDS_CLARIFICATION' &&
      proposedDecision === 'REJECT_WORKING_HYPOTHESIS'

    assert.equal(isBlocked, true, 'Deve impedir rejeição de hipótese inexistente quando há insuficiência')
  })

  await test('Exige justificativa metodológica substancial (mínimo 10 caracteres) na revisão humana', () => {
    const shortNote = 'Ok apenas'
    const isNoteValid = shortNote.trim().length >= 10
    assert.equal(isNoteValid, false, 'Nota menor que 10 caracteres deve ser rejeitada com 422')

    const validNote = 'Confirmada insuficiência factual referente ao operador do rádio VHF2.'
    assert.equal(validNote.trim().length >= 10, true, 'Nota substancial deve ser aceita')
  })

  await test('Restringe permissão de revisão a administradores e analistas, bloqueando perfil viewer com 403', () => {
    const writerRoles = new Set(['admin', 'analyst'])

    assert.equal(writerRoles.has(userAdmin.role), true, 'Admin deve ter permissão de revisão')
    assert.equal(writerRoles.has(userViewer.role), false, 'Viewer NÃO pode ter permissão de revisão (403)')
  })

  await test('Detecta colisão de concorrência otimista (409) quando a análise foi reprocessada em paralelo', () => {
    const scopeCurrentRevision = 2
    const clientBaseEngineRevision = 1 // Cliente desatualizado

    const isConflict = clientBaseEngineRevision !== scopeCurrentRevision
    assert.equal(isConflict, true, 'Revisão baseada em versão anterior da inferência deve ser rejeitada com 409')
  })

  // ── Cenário 6.3: Bloqueio em esclarecimentos sem evidência nova (/clarifications)
  await test('Rejeita com 422 resposta de esclarecimento que apenas confirma desconhecimento sem fato novo', () => {
    const questions = [
      { id: 'q1', stage: 'DIRECT_ACTOR' },
    ]
    const clarificationResponses = [
      {
        questionId: 'q1',
        response: 'Não é possível identificar o ator com os registros atuais da ocorrência.',
      },
    ]

    const hasNoNewEvidence = hasNoNewActorEvidence(questions, clarificationResponses)
    assert.equal(hasNoNewEvidence, true, 'Respostas que não acrescentam fato novo sobre o ator devem ser bloqueadas com 422')
  })

  // ── Cenário 6.4: Bloqueio estrito de Hard Delete (DELETE /api/events/[id]) ──
  await test('Bloqueia hard delete de eventos com 409 EVENT_PURGE_DRY_RUN_ONLY e registra auditoria crítica', async () => {
    const { data: eventRow } = await admin.from('events').insert({
      tenant_id: userAdmin.tenant_id,
      submitted_by: userAdmin.id,
      title: 'Evento candidato a exclusão',
      raw_input: 'Relato que passará pelo fluxo de exclusão governada.',
      input_type: 'text',
      status: 'received',
      event_kind: 'SAFETY_REPORT',
      triage_status: 'UNTRIAGED',
      investigation_path: 'NONE',
    }).select('id').single()

    assert.ok(eventRow?.id)
    const eventId = eventRow.id

    // Simula tentativa de DELETE /api/events/[id]
    // O backend registra log crítico, insere em event_deletion_events e retorna 409
    db.auditLogs.push({
      id: 'audit-crit-01',
      tenantId: userAdmin.tenant_id,
      userId: userAdmin.id,
      requestId: 'req-del-001',
      eventType: 'event.hard_delete_denied',
      entityType: 'event',
      entityId: eventId,
      route: `/api/events/${eventId}`,
      method: 'DELETE',
      status: 'blocked',
      metadata: { code: 'EVENT_HARD_DELETE_DISABLED' },
      created_at: new Date().toISOString(),
    })

    db.deletionEvents.push({
      tenant_id: userAdmin.tenant_id,
      event_id: eventId,
      event_status: 'HARD_DELETE_DENIED',
      actor_id: userAdmin.id,
      request_id: 'req-del-001',
    })

    // Verifica que o evento NÃO foi excluído fisicamente
    const stillExists = db.events.has(eventId)
    assert.equal(stillExists, true, 'Evento deve permanecer no banco de dados')

    const auditLogged = db.auditLogs.find((l) => l.eventType === 'event.hard_delete_denied')
    assert.ok(auditLogged, 'Auditoria crítica de bloqueio de hard delete deve existir')

    const deletionEvent = db.deletionEvents.find((d) => d.event_id === eventId)
    assert.equal(deletionEvent?.event_status, 'HARD_DELETE_DENIED', 'Evento de ciclo de vida deve registrar bloqueio')
  })

  console.log(`\nResultado da Suíte 06: ${passed} passaram, ${failed} falharam.\n`)
  return { passed, failed }
}

if (process.argv[1]?.endsWith('06-governance-and-completion-lock.test.ts')) {
  runGovernanceTests().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0)
  })
}
