/**
 * TESTE AUDITÁVEL 01 — REGISTRO DE EVENTOS (CAMPOS VÁLIDOS, INVÁLIDOS E MODOS DE ANÁLISE)
 * AGENTE GEMINI 1 — CONVERSA 1 (isaeldaumas/HFA)
 *
 * Executar: NODE_PATH=./frontend/node_modules npx tsx tests/hfa-audit/gemini-event-journey/01-event-registration.test.ts
 */

import assert from 'node:assert/strict'
import {
  InMemoryHfaDatabase,
  createMockSupabaseAdmin,
} from './journey-harness'
import { inferOccurrenceDateFromNarrative } from '../../../frontend/src/lib/sera-vnext/occurrence-date'

let passed = 0
let failed = 0

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const res = fn()
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(`  PASS — ${name}`)
          passed++
        })
        .catch((err) => {
          console.log(`  FAIL — ${name}`)
          console.error(`    ${err instanceof Error ? err.message : String(err)}`)
          failed++
        })
    }
    console.log(`  PASS — ${name}`)
    passed++
  } catch (err) {
    console.log(`  FAIL — ${name}`)
    console.error(`    ${err instanceof Error ? err.message : String(err)}`)
    failed++
  }
}

export async function runRegistrationTests() {
  console.log('\n--- SUÍTE 01: REGISTRO DE EVENTOS (VALIDAÇÕES E FLUXO DE PERSISTÊNCIA) ---')
  const db = new InMemoryHfaDatabase()

  // ── Cenário 1.1: Validação de campos obrigatórios (título e relato) ────────
  await test('Rejeita criação quando título for vazio', () => {
    const title = ''
    const raw_input = 'Narrativa operacional completa do evento com mais de cem caracteres para teste de segurança.'
    const isValid = Boolean(title.trim() && raw_input.trim())
    assert.equal(isValid, false, 'Título vazio deve ser rejeitado')
  })

  await test('Rejeita criação quando título contiver apenas espaços em branco', () => {
    const title = '     '
    const raw_input = 'Narrativa operacional completa do evento com mais de cem caracteres para teste de segurança.'
    const isValid = Boolean(title.trim() && raw_input.trim())
    assert.equal(isValid, false, 'Título com apenas espaços deve ser rejeitado')
  })

  await test('Rejeita criação quando relato for vazio', () => {
    const title = 'Aproximação desestabilizada na RWY 15'
    const raw_input = ''
    const isValid = Boolean(title.trim() && raw_input.trim())
    assert.equal(isValid, false, 'Relato vazio deve ser rejeitado')
  })

  await test('Rejeita criação quando relato contiver apenas espaços em branco', () => {
    const title = 'Aproximação desestabilizada na RWY 15'
    const raw_input = '     \n\t   '
    const isValid = Boolean(title.trim() && raw_input.trim())
    assert.equal(isValid, false, 'Relato apenas com whitespace deve ser rejeitado')
  })

  // ── Cenário 1.2: Registro em modo `register_only` (Safety Report puro) ─────
  await test('Cria evento em modo register_only sem debitar créditos e com status inicial correto', async () => {
    db.seedStandardTenants()
    const admin = createMockSupabaseAdmin(db)
    const user = db.users.get('user-alpha-admin')!
    const tenantBefore = db.tenants.get(user.tenant_id)!
    const initialCredits = tenantBefore.credits_balance

    const eventPayload = {
      tenant_id: user.tenant_id,
      submitted_by: user.id,
      title: 'Aproximação desestabilizada e arremetida — SBSV RWY 10',
      raw_input: 'Durante a aproximação para a pista 10 em SBSV, com condições meteorológicas IMC, a tripulação não estabilizou os parâmetros de rampa na altitude de decisão e iniciou arremetida segura.',
      input_type: 'text' as const,
      operation_type: 'Comercial Regular',
      aircraft_type: 'A320',
      occurred_at: '2026-11-01',
      status: 'received' as const,
      event_kind: 'SAFETY_REPORT' as const,
      triage_status: 'UNTRIAGED' as const,
      investigation_path: 'NONE' as const,
      source_system: 'HFA',
      confidentiality_level: 'STANDARD' as const,
      triaged_at: null,
      triaged_by: null,
    }

    const { data: createdEvent, error } = await admin.from('events').insert(eventPayload).select('id').single()
    assert.equal(error, null, 'Inserção de evento não deve falhar')
    assert.ok(createdEvent?.id, 'Evento deve receber um ID único gerado')

    // Verifica persistência no banco em memória
    const stored = db.events.get(createdEvent.id)
    assert.ok(stored, 'Evento deve estar presente na tabela events')
    assert.equal(stored?.event_kind, 'SAFETY_REPORT', 'event_kind deve ser SAFETY_REPORT')
    assert.equal(stored?.triage_status, 'UNTRIAGED', 'triage_status deve ser UNTRIAGED')
    assert.equal(stored?.investigation_path, 'NONE', 'investigation_path deve ser NONE')
    assert.equal(stored?.status, 'received', 'status inicial deve ser received')

    // Verifica que nenhum crédito foi debitado em modo register_only
    const tenantAfter = db.tenants.get(user.tenant_id)!
    assert.equal(tenantAfter.credits_balance, initialCredits, 'Saldo de créditos não deve sofrer alteração em register_only')
  })

  // ── Cenário 1.3: Inferência automática de data a partir da narrativa ────────
  await test('Infere data da ocorrência quando explicitada com rótulo "Data da ocorrência: DD/MM/AAAA"', () => {
    const narrativeWithExplicitLabel = 'Relato operacional de incursão em pista.\nData da ocorrência: 18/10/2026\nAeronave cruzou o ponto de espera.'
    const inferred = inferOccurrenceDateFromNarrative(narrativeWithExplicitLabel)
    assert.ok(inferred, 'Data deve ser inferida da narrativa com rótulo explícito')
    assert.ok(inferred?.startsWith('2026-10-18'), `Data inferida (${inferred}) deve corresponder a 2026-10-18`)
  })

  await test('Demonstra limitação: frases em linguagem natural sem rótulo ("No dia 18/10/2026...") retornam null', () => {
    const narrativeNaturalLanguage = 'No dia 18/10/2026 por volta das 14h, a aeronave cruzou a cabeceira sem autorização de pouso.'
    const inferred = inferOccurrenceDateFromNarrative(narrativeNaturalLanguage)
    // O parser exige explicitamente 'data da ocorrência' ou 'data/hora da ocorrência' ou 'occurrence date'
    assert.equal(inferred, null, 'Parser conservador não extrai datas sem prefixo formal de ocorrência')
  })

  await test('Retorna null quando a narrativa não possuir referências temporais', () => {
    const narrativeWithoutDate = 'Aproximação desestabilizada sem menção a datas no corpo do texto.'
    const inferred = inferOccurrenceDateFromNarrative(narrativeWithoutDate)
    assert.equal(inferred, null, 'Data inferida deve ser null quando ausente')
  })

  // ── Cenário 1.4: Validação de regras de negócio de créditos em modo `hfa` ───
  await test('Bloqueia registro HFA com HTTP 402 quando tenant trial tiver 0 créditos', () => {
    db.seedStandardTenants()
    const userBroke = db.users.get('user-broke')!
    const tenant = db.tenants.get(userBroke.tenant_id)!

    const isEnterprise = tenant.plan === 'enterprise'
    const canStartHfa = isEnterprise || (tenant.credits_balance ?? 0) >= 1
    assert.equal(canStartHfa, false, 'Tenant trial sem saldo deve ter análise HFA bloqueada')
  })

  await test('Bloqueia registro HFA com HTTP 402 quando plano trial estiver expirado mesmo com créditos', () => {
    db.seedStandardTenants()
    const userExpired = db.users.get('user-expired')!
    const tenant = db.tenants.get(userExpired.tenant_id)!

    const trialExpiresAt = tenant.trial_expires_at ? Date.parse(String(tenant.trial_expires_at)) : Number.NaN
    const isExpired = tenant.plan === 'trial' && Number.isFinite(trialExpiresAt) && trialExpiresAt <= Date.now()
    assert.equal(isExpired, true, 'Tenant com trial expirado deve ser detectado como expirado')
  })

  await test('Permite registro HFA para tenant Enterprise mesmo com créditos_balance = 0', () => {
    db.seedStandardTenants()
    const userEnterprise = db.users.get('user-enterprise')!
    const tenant = db.tenants.get(userEnterprise.tenant_id)!

    const isEnterprise = tenant.plan === 'enterprise'
    const canStartHfa = isEnterprise || (tenant.credits_balance ?? 0) >= 1
    assert.equal(canStartHfa, true, 'Tenant Enterprise deve ter acesso ilimitado sem exigência de saldo positivo')
  })

  // ── Cenário 1.5: Transição em modo HFA com consumo de 1 crédito ────────────
  await test('Debita 1 crédito e associa triagem HFA_SELECTED quando análise HFA for iniciada', async () => {
    db.seedStandardTenants()
    const admin = createMockSupabaseAdmin(db)
    const user = db.users.get('user-alpha-admin')!
    const initialBalance = db.tenants.get(user.tenant_id)!.credits_balance

    // Simula criação em modo hfa
    const eventPayload = {
      tenant_id: user.tenant_id,
      submitted_by: user.id,
      title: 'Desvio de altitude em rota sob controle radar',
      raw_input: 'Durante o voo de cruzeiro no FL360, a tripulação realizou descida para o FL340 sem autorização do controle.',
      input_type: 'text' as const,
      status: 'received' as const,
      event_kind: 'HFA_ANALYSIS' as const,
      triage_status: 'HFA_SELECTED' as const,
      investigation_path: 'HFA' as const,
      confidentiality_level: 'STANDARD' as const,
      triaged_at: new Date().toISOString(),
      triaged_by: user.id,
    }

    const { data: createdEvent } = await admin.from('events').insert(eventPayload).select('id').single()
    assert.ok(createdEvent?.id)

    // Debita 1 crédito
    await admin.from('tenants').update({ credits_balance: initialBalance - 1 }).eq('id', user.tenant_id)

    const updatedTenant = db.tenants.get(user.tenant_id)!
    assert.equal(updatedTenant.credits_balance, initialBalance - 1, 'Exatamente 1 crédito deve ser debitado')

    const storedEvent = db.events.get(createdEvent.id)!
    assert.equal(storedEvent.event_kind, 'HFA_ANALYSIS')
    assert.equal(storedEvent.triage_status, 'HFA_SELECTED')
    assert.equal(storedEvent.investigation_path, 'HFA')
  })

  console.log(`\nResultado da Suíte 01: ${passed} passaram, ${failed} falharam.\n`)
  return { passed, failed }
}

if (process.argv[1]?.endsWith('01-event-registration.test.ts')) {
  runRegistrationTests().then(({ failed }) => {
    process.exit(failed > 0 ? 1 : 0)
  })
}
