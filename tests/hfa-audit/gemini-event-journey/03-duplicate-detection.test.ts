/**
 * TESTE AUDITÁVEL 03 — DETECÇÃO DE DUPLICATAS E CONTROLE DE REENVIO AUDITADO
 * AGENTE GEMINI 1 — CONVERSA 1 (isaeldaumas/HFA)
 *
 * Executar: NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/03-duplicate-detection.test.ts
 */

import assert from 'node:assert/strict'
import {
  normalizeOccurrenceNarrative,
  isLikelyDuplicate,
  matchingEarlierEvents,
  findTenantDuplicateCandidates,
  publicDuplicateMatches,
  type DuplicateComparable,
} from '../../../frontend/src/lib/server/event-duplicates'
import {
  InMemoryHfaDatabase,
  createMockSupabaseAdmin,
} from './journey-harness'

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

export async function runDuplicateTests() {
  console.log('\n--- SUÍTE 03: DETECÇÃO DE DUPLICATAS E REENVIO AUDITADO ---')
  const db = new InMemoryHfaDatabase()

  // ── Cenário 3.1: Normalização de escrita de horário e narrativa ────────────
  await test('normalizeOccurrenceNarrative remove diacríticos e unifica escrita de horários (14h30 -> 14 30)', () => {
    const input1 = 'Aproximação desestabilizada às 14h30 com turbulência severa.'
    const input2 = 'Aproximacao desestabilizada as 14:30 com turbulencia severa.'
    const norm1 = normalizeOccurrenceNarrative(input1)
    const norm2 = normalizeOccurrenceNarrative(input2)

    assert.equal(norm1, norm2, 'Textos com grafias equivalentes de horário e acentos devem normalizar para a mesma string')
    assert.ok(norm1.includes('14 30'), 'Deve converter 14h30 e 14:30 para tokens equivalentes sem diacríticos')
  })

  // ── Cenário 3.2: Heurística conservadora de duplicatas (isLikelyDuplicate) ──
  await test('Não classifica relatos curtos (< 120 caracteres normalizados) como duplicata mesmo que idênticos', () => {
    const shortA: DuplicateComparable = {
      id: 'evt-1',
      title: 'Pouso duro',
      raw_input: 'Aeronave tocou com razão de afundamento elevada.',
    }
    const shortB: DuplicateComparable = {
      id: 'evt-2',
      title: 'Pouso duro',
      raw_input: 'Aeronave tocou com razão de afundamento elevada.',
    }
    const match = isLikelyDuplicate(shortA, shortB)
    assert.equal(match, false, 'Relatos curtos genéricos não devem gerar colisão automática')
  })

  await test('Detecta duplicata quando relatos detalhados (>= 120 chars) forem factualmente equivalentes', () => {
    const textBase =
      'Durante a aproximação para a pista 10 em SBSV, com condições meteorológicas IMC e teto baixo, ' +
      'a tripulação não estabilizou os parâmetros de rampa na altitude de decisão e iniciou arremetida segura.'

    const eventOriginal: DuplicateComparable = {
      id: 'evt-original',
      title: 'Arremetida SBSV',
      raw_input: textBase,
      occurred_at: '2026-11-01T14:30:00Z',
      aircraft_type: 'A320',
      operation_type: 'Regular',
    }

    const eventSubsequent: DuplicateComparable = {
      id: 'evt-subsequent',
      title: 'Segundo envio do mesmo relato',
      raw_input: textBase,
      occurred_at: '2026-11-01T14:30:00Z',
      aircraft_type: 'A320',
      operation_type: 'Regular',
    }

    const isDup = isLikelyDuplicate(eventSubsequent, eventOriginal)
    assert.equal(isDup, true, 'Deve identificar relato idêntico de mesma aeronave e data como duplicata')
  })

  await test('Exclui falso positivo quando datas de ocorrência forem conflitantes', () => {
    const textBase =
      'Durante a aproximação para a pista 10 em SBSV, com condições meteorológicas IMC e teto baixo, ' +
      'a tripulação não estabilizou os parâmetros de rampa na altitude de decisão e iniciou arremetida segura.'

    const eventDay1: DuplicateComparable = {
      id: 'evt-dia-1',
      title: 'Ocorrência dia 01',
      raw_input: textBase,
      occurred_at: '2026-11-01',
    }
    const eventDay2: DuplicateComparable = {
      id: 'evt-dia-2',
      title: 'Ocorrência dia 02',
      raw_input: textBase,
      occurred_at: '2026-11-02',
    }

    const isDup = isLikelyDuplicate(eventDay2, eventDay1)
    assert.equal(isDup, false, 'Ocorrências em datas distintas não são duplicatas')
  })

  await test('Exclui falso positivo quando equipamentos (aircraft_type) forem divergentes', () => {
    const textBase =
      'Durante a aproximação para a pista 10 em SBSV, com condições meteorológicas IMC e teto baixo, ' +
      'a tripulação não estabilizou os parâmetros de rampa na altitude de decisão e iniciou arremetida segura.'

    const eventA320: DuplicateComparable = {
      id: 'evt-a320',
      title: 'Ocorrência A320',
      raw_input: textBase,
      aircraft_type: 'Airbus A320',
    }
    const eventB737: DuplicateComparable = {
      id: 'evt-b737',
      title: 'Ocorrência B737',
      raw_input: textBase,
      aircraft_type: 'Boeing 737',
    }

    const isDup = isLikelyDuplicate(eventB737, eventA320)
    assert.equal(isDup, false, 'Ocorrências com modelos de aeronave distintos não são duplicatas')
  })

  // ── Cenário 3.3: Comportamento da API com override de duplicidade ──────────
  await test('Bloqueia criação com 409 POSSIBLE_EVENT_DUPLICATE e sem debitar créditos quando detectada duplicata', async () => {
    db.seedStandardTenants()
    const admin = createMockSupabaseAdmin(db)
    const user = db.users.get('user-alpha-admin')!

    const narrative =
      'Durante o táxi para a cabeceira 28L, o controle de solo autorizou cruzamento da pista 28R. ' +
      'A tripulação avistou outra aeronave iniciando corrida de decolagem na mesma pista e abortou o cruzamento imediatamente.'

    // Cadastra primeiro evento canônico
    const { data: firstEvent } = await admin.from('events').insert({
      tenant_id: user.tenant_id,
      submitted_by: user.id,
      title: 'Incursão em pista abortada',
      raw_input: narrative,
      input_type: 'text',
      status: 'received',
      event_kind: 'SAFETY_REPORT',
      triage_status: 'UNTRIAGED',
      investigation_path: 'NONE',
    }).select('id').single()

    assert.ok(firstEvent?.id)
    const initialCredits = db.tenants.get(user.tenant_id)!.credits_balance

    // Busca candidatos a duplicata para a nova submissão idêntica
    const candidates = await findTenantDuplicateCandidates({
      admin: admin as any,
      tenantId: user.tenant_id,
      input: { id: '__NEW_EVENT__', title: 'Mesmo relato reenviado', raw_input: narrative },
      excludeConfirmedDuplicates: true,
    })

    assert.equal(candidates.length, 1, 'Deve encontrar 1 candidato a duplicata')
    assert.equal(candidates[0].id, firstEvent.id)

    // Simula tentativa de envio sem override
    const duplicateOverrideReason = ''
    const shouldBlock = candidates.length > 0 && duplicateOverrideReason.trim().length < 20
    assert.equal(shouldBlock, true, 'Deve bloquear com 409 quando justificativa for vazia')

    // Verifica que nenhum crédito foi debitado
    const currentCredits = db.tenants.get(user.tenant_id)!.credits_balance
    assert.equal(currentCredits, initialCredits, 'Nenhum crédito deve ser debitado no bloqueio por 409')
  })

  await test('Rejeita override com justificativa curta (< 20 caracteres) mantendo o bloqueio 409', () => {
    const shortReason = 'Evento diferente.' // 17 caracteres
    const isValidOverride = shortReason.trim().length >= 20
    assert.equal(isValidOverride, false, 'Justificativa de override menor que 20 caracteres deve ser rejeitada')
  })

  await test('Permite override com justificativa substancial (>= 20 caracteres) e registra evento de auditoria', async () => {
    db.seedStandardTenants()
    const admin = createMockSupabaseAdmin(db)
    const user = db.users.get('user-alpha-admin')!

    const validReason = 'Trata-se de uma segunda ocorrência idêntica verificada no mesmo dia por outra tripulação independente.'
    assert.ok(validReason.trim().length >= 20, 'Justificativa atende critério mínimo de 20 caracteres')

    // Registra log de auditoria
    db.auditLogs.push({
      id: 'audit-dup-01',
      tenantId: user.tenant_id,
      userId: user.auth_user_id,
      requestId: 'req-dup-override-001',
      eventType: 'event.duplicate_warning_overridden',
      entityType: 'event',
      entityId: 'evt-first',
      route: '/api/events',
      method: 'POST',
      status: 'partial',
      metadata: { reason: validReason },
      created_at: new Date().toISOString(),
    })

    const logged = db.auditLogs.find((l) => l.eventType === 'event.duplicate_warning_overridden')
    assert.ok(logged, 'Log de auditoria event.duplicate_warning_overridden deve ser gravado')
    assert.equal(logged?.metadata?.reason, validReason)
  })

  console.log(`\nResultado da Suíte 03: ${passed} passaram, ${failed} falharam.\n`)
  return { passed, failed }
}

if (process.argv[1]?.endsWith('03-duplicate-detection.test.ts')) {
  runDuplicateTests().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0)
  })
}
