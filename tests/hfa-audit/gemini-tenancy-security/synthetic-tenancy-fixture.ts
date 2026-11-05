/**
 * Synthetic Multi-Tenant Security Fixture
 *
 * Implements an in-memory synthetic environment with two distinct organizations (A/B),
 * synthetic user identities (anonymous, member, analyst, admin, enterprise admin),
 * and an in-memory query simulator matching Supabase PostgREST client semantics.
 *
 * Used exclusively for offline, non-destructive security and tenancy isolation audits.
 */

export const TENANT_A = {
  id: '00000000-aaaa-4000-a000-000000000001',
  name: 'Aero Alpha Linhas Aereas Ltda',
  slug: 'aero-alpha',
  plan: 'enterprise',
  credits_balance: -1,
  is_active: true,
  created_at: '2026-01-01T00:00:00.000Z',
}

export const TENANT_B = {
  id: '00000000-bbbb-4000-b000-000000000002',
  name: 'Bravo Aviation Taxi Aereo SA',
  slug: 'bravo-aviation',
  plan: 'trial',
  credits_balance: 10,
  trial_case_limit: 10,
  trial_started_at: '2026-10-01T00:00:00.000Z',
  trial_expires_at: '2026-12-01T00:00:00.000Z',
  is_active: true,
  created_at: '2026-10-01T00:00:00.000Z',
}

export const TENANT_INACTIVE = {
  id: '00000000-cccc-4000-c000-000000000003',
  name: 'Charlie Inactive Air Cargo',
  slug: 'charlie-cargo',
  plan: 'trial',
  credits_balance: 0,
  is_active: false,
  created_at: '2026-02-01T00:00:00.000Z',
}

export const USERS = {
  A_ADMIN: {
    authUserId: '10000000-aaaa-4000-a000-000000000001',
    publicUserId: '10000000-aaaa-4000-a000-000000000001',
    email: 'admin@alpha-air.synthetic',
    role: 'admin',
    tenantId: TENANT_A.id,
    isActive: true,
    emailConfirmedAt: '2026-01-01T12:00:00.000Z',
  },
  A_ANALYST: {
    authUserId: '10000000-aaaa-4000-a000-000000000002',
    publicUserId: '10000000-aaaa-4000-a000-000000000002',
    email: 'analyst@alpha-air.synthetic',
    role: 'analyst',
    tenantId: TENANT_A.id,
    isActive: true,
    emailConfirmedAt: '2026-01-01T12:00:00.000Z',
  },
  A_VIEWER: {
    authUserId: '10000000-aaaa-4000-a000-000000000003',
    publicUserId: '10000000-aaaa-4000-a000-000000000003',
    email: 'viewer@alpha-air.synthetic',
    role: 'viewer',
    tenantId: TENANT_A.id,
    isActive: true,
    emailConfirmedAt: '2026-01-01T12:00:00.000Z',
  },
  B_ADMIN: {
    authUserId: '20000000-bbbb-4000-b000-000000000001',
    publicUserId: '20000000-bbbb-4000-b000-000000000001',
    email: 'admin@bravo-aviation.synthetic',
    role: 'admin',
    tenantId: TENANT_B.id,
    isActive: true,
    emailConfirmedAt: '2026-10-01T12:00:00.000Z',
  },
  B_ANALYST: {
    authUserId: '20000000-bbbb-4000-b000-000000000002',
    publicUserId: '20000000-bbbb-4000-b000-000000000002',
    email: 'analyst@bravo-aviation.synthetic',
    role: 'analyst',
    tenantId: TENANT_B.id,
    isActive: true,
    emailConfirmedAt: '2026-10-01T12:00:00.000Z',
  },
  B_VIEWER: {
    authUserId: '20000000-bbbb-4000-b000-000000000003',
    publicUserId: '20000000-bbbb-4000-b000-000000000003',
    email: 'viewer@bravo-aviation.synthetic',
    role: 'viewer',
    tenantId: TENANT_B.id,
    isActive: true,
    emailConfirmedAt: '2026-10-01T12:00:00.000Z',
  },
  INACTIVE_USER: {
    authUserId: '30000000-cccc-4000-c000-000000000001',
    publicUserId: '30000000-cccc-4000-c000-000000000001',
    email: 'inactive@alpha-air.synthetic',
    role: 'analyst',
    tenantId: TENANT_A.id,
    isActive: false,
    emailConfirmedAt: '2026-01-01T12:00:00.000Z',
  },
  USER_ON_INACTIVE_TENANT: {
    authUserId: '30000000-cccc-4000-c000-000000000002',
    publicUserId: '30000000-cccc-4000-c000-000000000002',
    email: 'pilot@charlie-cargo.synthetic',
    role: 'admin',
    tenantId: TENANT_INACTIVE.id,
    isActive: true,
    emailConfirmedAt: '2026-02-01T12:00:00.000Z',
  },
}

export const SYNTHETIC_EVENTS = {
  EVENT_A1: {
    id: 'e0000000-aaaa-4000-a000-000000000001',
    tenant_id: TENANT_A.id,
    title: '[SYNTHETIC] Alpha Engine Surge Flight AA-101',
    raw_input: 'Narrativa do evento operacional restrita à organização Alpha.',
    input_type: 'text',
    operation_type: 'TRANSPORTE_REGULAR',
    aircraft_type: 'B737-800',
    status: 'completed',
    credits_used: 1,
    triage_status: 'HFA_SELECTED',
    investigation_path: 'HFA',
    submitted_by: USERS.A_ADMIN.publicUserId,
    deleted_at: null,
    created_at: '2026-05-01T10:00:00.000Z',
    updated_at: '2026-05-01T10:05:00.000Z',
  },
  EVENT_B1: {
    id: 'e0000000-bbbb-4000-b000-000000000002',
    tenant_id: TENANT_B.id,
    title: '[SYNTHETIC] Bravo Runway Incursion Event BV-202',
    raw_input: 'Narrativa confidencial da organização Bravo contendo dados sensíveis.',
    input_type: 'text',
    operation_type: 'TAXI_AEREO',
    aircraft_type: 'EMB-505',
    status: 'completed',
    credits_used: 1,
    triage_status: 'GENERAL_INVESTIGATION',
    investigation_path: 'GENERAL',
    submitted_by: USERS.B_ADMIN.publicUserId,
    deleted_at: null,
    created_at: '2026-10-10T14:00:00.000Z',
    updated_at: '2026-10-10T14:10:00.000Z',
  },
}

export const SYNTHETIC_ANALYSES = {
  ANALYSIS_A1: {
    id: 'a0000000-aaaa-4000-a000-000000000001',
    tenant_id: TENANT_A.id,
    event_id: SYNTHETIC_EVENTS.EVENT_A1.id,
    perception_code: 'P01',
    objective_code: 'O02',
    action_code: 'A03',
    analysis_completeness: 'complete',
    event_summary: 'Alpha event summary',
    created_at: '2026-05-01T10:05:00.000Z',
    updated_at: '2026-05-01T10:05:00.000Z',
  },
  ANALYSIS_B1: {
    id: 'a0000000-bbbb-4000-b000-000000000002',
    tenant_id: TENANT_B.id,
    event_id: SYNTHETIC_EVENTS.EVENT_B1.id,
    perception_code: 'P04',
    objective_code: 'O05',
    action_code: 'A06',
    analysis_completeness: 'complete',
    event_summary: 'Bravo event summary',
    created_at: '2026-10-10T14:10:00.000Z',
    updated_at: '2026-10-10T14:10:00.000Z',
  },
}

export const SYNTHETIC_ACTIONS = {
  ACTION_A1: {
    id: 'c0000000-aaaa-4000-a000-000000000001',
    tenant_id: TENANT_A.id,
    source_event_id: SYNTHETIC_EVENTS.EVENT_A1.id,
    title: 'Alpha Re-briefing on Engine Surge SOP',
    status: 'in_progress',
    priority: 'high',
    responsible: 'Chefe de Operações Alpha',
    due_date: '2026-12-31',
    category: 'TREINAMENTO',
    owner_user_id: USERS.A_ANALYST.publicUserId,
    created_at: '2026-05-02T09:00:00.000Z',
  },
  ACTION_B1: {
    id: 'c0000000-bbbb-4000-b000-000000000002',
    tenant_id: TENANT_B.id,
    source_event_id: SYNTHETIC_EVENTS.EVENT_B1.id,
    title: 'Bravo Ground Taxi Coordination Workshop',
    status: 'pending',
    priority: 'critical',
    responsible: 'Gerente SGSO Bravo',
    due_date: '2026-11-30',
    category: 'PROCEDIMENTO',
    owner_user_id: USERS.B_ANALYST.publicUserId,
    created_at: '2026-10-11T11:00:00.000Z',
  },
}

export const SYNTHETIC_INTEGRATIONS = {
  AIRTRUST_ALPHA: {
    id: 'i0000000-aaaa-4000-a000-000000000001',
    tenant_id: TENANT_A.id,
    provider: 'AIRTRUST',
    external_tenant_ref: 'AIRTRUST-TENANT-ALPHA',
    name: 'AirTrust Alpha Production Bridge',
    token: 'hfa_int_alpha_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    token_prefix: 'hfa_int_alpha_',
    scopes: ['events:write', 'events:read'],
    is_active: true,
    revoked_at: null,
  },
  AIRTRUST_BRAVO: {
    id: 'i0000000-bbbb-4000-b000-000000000002',
    tenant_id: TENANT_B.id,
    provider: 'AIRTRUST',
    external_tenant_ref: 'AIRTRUST-TENANT-BRAVO',
    name: 'AirTrust Bravo Bridge',
    token: 'hfa_int_bravo_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    token_prefix: 'hfa_int_bravo_',
    scopes: ['events:write', 'events:read'],
    is_active: true,
    revoked_at: null,
  },
}

export const SYNTHETIC_CREDIT_TRANSACTIONS = [
  {
    id: 't0000000-aaaa-4000-a000-000000000001',
    tenant_id: TENANT_A.id,
    user_id: USERS.A_ADMIN.publicUserId,
    type: 'grant',
    amount: 100,
    stripe_payment_id: 'ch_synthetic_alpha_999',
    description: 'Crédito Enterprise Alpha',
    created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 't0000000-bbbb-4000-b000-000000000002',
    tenant_id: TENANT_B.id,
    user_id: USERS.B_ADMIN.publicUserId,
    type: 'grant',
    amount: 10,
    stripe_payment_id: 'ch_synthetic_bravo_888',
    description: 'Crédito Inicial Trial Bravo',
    created_at: '2026-10-01T00:00:00.000Z',
  },
]
