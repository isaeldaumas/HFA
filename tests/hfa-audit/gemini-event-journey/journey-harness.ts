/**
 * HARNESS DE TESTE EM MEMÓRIA — JORNADA DE EVENTOS E ANÁLISE HFA
 * AGENTE GEMINI 1 — CONVERSA 1 (isaeldaumas/HFA)
 *
 * Fornece isolamento completo sem serviços externos (sem Supabase remoto,
 * sem APIs de IA externas, sem SMTP). Permite testar contratos, isolamento de tenant,
 * detecção de duplicatas, resiliência a falhas parciais e travas de governança.
 */

import { normalizeOccurrenceNarrative } from '../../../frontend/src/lib/server/event-duplicates'

export type InMemoryTenant = {
  id: string
  name: string
  plan: 'trial' | 'pro' | 'enterprise'
  credits_balance: number
  trial_expires_at?: string | null
  is_active: boolean
}

export type InMemoryUser = {
  id: string
  auth_user_id: string
  tenant_id: string
  email: string
  role: 'admin' | 'analyst' | 'viewer'
  is_active: boolean
}

export type InMemoryEvent = {
  id: string
  tenant_id: string
  submitted_by: string
  title: string
  raw_input: string
  input_type: 'text' | 'pdf' | 'docx'
  operation_type?: string | null
  aircraft_type?: string | null
  occurred_at?: string | null
  status: 'received' | 'processing' | 'completed' | 'failed'
  event_kind: 'SAFETY_REPORT' | 'HFA_ANALYSIS'
  triage_status: 'UNTRIAGED' | 'HFA_SELECTED' | 'GENERAL_SELECTED'
  investigation_path: 'NONE' | 'HFA' | 'GENERAL' | 'BOTH'
  confidentiality_level: 'STANDARD' | 'CONFIDENTIAL'
  credits_used?: number
  created_at: string
  deleted_at?: string | null
  deletion_status?: string | null
  triaged_at?: string | null
  triaged_by?: string | null
}

export type InMemoryEventDocument = {
  id: string
  tenant_id: string
  event_id: string
  uploaded_by: string
  file_name: string
  storage_path: string
  mime_type?: string | null
  size_bytes: number
  created_at: string
}

export type InMemoryAuditLog = {
  id: string
  tenantId: string
  userId: string
  requestId: string
  eventType: string
  entityType: string
  entityId: string
  route: string
  method: string
  status?: string
  metadata?: Record<string, unknown>
  created_at: string
}

export type InMemorySeraAnalysis = {
  id: string
  tenant_id: string
  source_reference: string // event_id
  status: 'draft' | 'completed' | 'rejected'
  review_status: 'UNREVIEWED' | 'IN_REVIEW' | 'REVIEWED' | 'REJECTED'
  current_revision: number
  engine_output: {
    evidenceSufficiency: {
      status: 'SUFFICIENT' | 'NEEDS_CLARIFICATION'
      questions?: Array<{ id: string; question: string; targetActor?: string }>
    }
    escapePoint?: { statement: string }
    directActor?: { actor: string }
    axes?: {
      perception?: { proposedCode: string }
      objective?: { proposedCode: string }
      action?: { proposedCode: string }
    }
  }
  metadata?: Record<string, unknown>
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export type InMemoryReview = {
  id: string
  tenant_id: string
  analysis_id: string
  reviewer_id: string
  review_version: number
  decision: string
  evidence_sufficiency: string
  requires_more_evidence: boolean
  review_notes: string
  metadata?: Record<string, unknown>
  created_at: string
}

export class InMemoryHfaDatabase {
  tenants = new Map<string, InMemoryTenant>()
  users = new Map<string, InMemoryUser>()
  events = new Map<string, InMemoryEvent>()
  eventDocuments = new Map<string, InMemoryEventDocument>()
  auditLogs: InMemoryAuditLog[] = []
  analyses = new Map<string, InMemorySeraAnalysis>()
  reviews: InMemoryReview[] = []
  documentUploads: Array<{ user_id: string; created_at: string }> = []
  storageFiles = new Map<string, { buffer: Buffer; contentType: string }>()
  duplicateLinks: Array<{ canonical_event_id: string; duplicate_event_id: string; tenant_id: string }> = []
  deletionEvents: Array<{ tenant_id: string; event_id: string; event_status: string; actor_id: string; request_id: string; metadata?: Record<string, unknown> }> = []
  riskExclusions: Array<{ id: string; tenant_id: string; source_type: string; source_id: string; reason: string; excluded_at: string; restored_at?: string | null }> = []

  reset() {
    this.tenants.clear()
    this.users.clear()
    this.events.clear()
    this.eventDocuments.clear()
    this.auditLogs = []
    this.analyses.clear()
    this.reviews = []
    this.documentUploads = []
    this.storageFiles.clear()
    this.duplicateLinks = []
    this.deletionEvents = []
    this.riskExclusions = []
  }

  seedStandardTenants() {
    this.reset()

    // Tenant Alpha (Standard Trial com 5 créditos)
    this.tenants.set('tenant-alpha', {
      id: 'tenant-alpha',
      name: 'Alpha Aviation Corp',
      plan: 'trial',
      credits_balance: 5,
      trial_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    })

    // User Alpha (Admin)
    this.users.set('user-alpha-admin', {
      id: 'pub-user-alpha-admin',
      auth_user_id: 'auth-user-alpha-admin',
      tenant_id: 'tenant-alpha',
      email: 'admin@alpha-aviation.invalid',
      role: 'admin',
      is_active: true,
    })

    // User Alpha (Viewer)
    this.users.set('user-alpha-viewer', {
      id: 'pub-user-alpha-viewer',
      auth_user_id: 'auth-user-alpha-viewer',
      tenant_id: 'tenant-alpha',
      email: 'viewer@alpha-aviation.invalid',
      role: 'viewer',
      is_active: true,
    })

    // Tenant Beta (Empresa concorrente para testes de isolamento)
    this.tenants.set('tenant-beta', {
      id: 'tenant-beta',
      name: 'Beta Helicopter Logistics',
      plan: 'pro',
      credits_balance: 10,
      is_active: true,
    })

    this.users.set('user-beta-admin', {
      id: 'pub-user-beta-admin',
      auth_user_id: 'auth-user-beta-admin',
      tenant_id: 'tenant-beta',
      email: 'admin@beta-helicopters.invalid',
      role: 'admin',
      is_active: true,
    })

    // Tenant Broke (Sem saldo)
    this.tenants.set('tenant-broke', {
      id: 'tenant-broke',
      name: 'Broke Air Services',
      plan: 'trial',
      credits_balance: 0,
      is_active: true,
    })

    this.users.set('user-broke', {
      id: 'pub-user-broke',
      auth_user_id: 'auth-user-broke',
      tenant_id: 'tenant-broke',
      email: 'pilot@broke-air.invalid',
      role: 'analyst',
      is_active: true,
    })

    // Tenant Expired Trial
    this.tenants.set('tenant-expired', {
      id: 'tenant-expired',
      name: 'Expired Flight School',
      plan: 'trial',
      credits_balance: 10,
      trial_expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      is_active: true,
    })

    this.users.set('user-expired', {
      id: 'pub-user-expired',
      auth_user_id: 'auth-user-expired',
      tenant_id: 'tenant-expired',
      email: 'cfi@expired-flight.invalid',
      role: 'admin',
      is_active: true,
    })

    // Tenant Enterprise (Ilimitado)
    this.tenants.set('tenant-enterprise', {
      id: 'tenant-enterprise',
      name: 'Enterprise Airlines Group',
      plan: 'enterprise',
      credits_balance: 0,
      is_active: true,
    })

    this.users.set('user-enterprise', {
      id: 'pub-user-enterprise',
      auth_user_id: 'auth-user-enterprise',
      tenant_id: 'tenant-enterprise',
      email: 'director@enterprise-airlines.invalid',
      role: 'admin',
      is_active: true,
    })
  }

  findDuplicateCandidates(tenantId: string, inputRawText: string, occurredAt?: string | null, aircraftType?: string | null) {
    const norm = normalizeOccurrenceNarrative(inputRawText)
    if (norm.length < 120) return []

    const candidates: InMemoryEvent[] = []
    for (const ev of this.events.values()) {
      if (ev.tenant_id !== tenantId || ev.deleted_at || ev.deletion_status === 'PURGED') continue
      // Data divergente exclui duplicata
      if (occurredAt && ev.occurred_at && occurredAt.slice(0, 10) !== ev.occurred_at.slice(0, 10)) continue
      // Aeronave divergente exclui duplicata
      if (aircraftType && ev.aircraft_type && normalizeOccurrenceNarrative(aircraftType) !== normalizeOccurrenceNarrative(ev.aircraft_type)) continue

      const evNorm = normalizeOccurrenceNarrative(ev.raw_input)
      if (evNorm.length >= 120 && evNorm === norm) {
        candidates.push(ev)
      }
    }
    return candidates
  }
}

/**
 * Cria mock do Supabase Admin compatível com as chamadas feitas pelas rotas
 */
export function createMockSupabaseAdmin(db: InMemoryHfaDatabase) {
  return {
    from: (table: string) => {
      let currentFilter: ((item: any) => boolean) = () => true
      let currentSort: ((a: any, b: any) => number) | null = null
      let currentLimit: number | null = null
      let isSingle = false
      let isMaybeSingle = false

      const builder: any = {
        select: (_cols?: string, opts?: { count?: string; head?: boolean }) => {
          if (opts?.count === 'exact' && opts?.head) {
            // head count query
            return {
              eq: (field: string, val: any) => {
                const prev = currentFilter
                currentFilter = (item: any) => prev(item) && item[field] === val
                return {
                  gte: (dateField: string, dateVal: string) => {
                    if (table === 'sera_document_uploads') {
                      const count = db.documentUploads.filter((u) => u.user_id === val && u.created_at >= dateVal).length
                      return Promise.resolve({ count, error: null })
                    }
                    return Promise.resolve({ count: 0, error: null })
                  },
                }
              },
            }
          }
          return builder
        },
        eq: (field: string, val: any) => {
          const prev = currentFilter
          currentFilter = (item: any) => prev(item) && item[field] === val
          return builder
        },
        neq: (field: string, val: any) => {
          const prev = currentFilter
          currentFilter = (item: any) => prev(item) && item[field] !== val
          return builder
        },
        not: (field: string, _operator: string, val: any) => {
          const prev = currentFilter
          currentFilter = (item: any) => prev(item) && (val === null ? item[field] !== null : item[field] !== val)
          return builder
        },
        is: (field: string, val: any) => {
          const prev = currentFilter
          currentFilter = (item: any) => prev(item) && (val === null ? (item[field] === null || item[field] === undefined) : item[field] === val)
          return builder
        },
        in: (field: string, vals: any[]) => {
          const set = new Set(vals)
          const prev = currentFilter
          currentFilter = (item: any) => prev(item) && set.has(item[field])
          return builder
        },
        contains: (field: string, val: Record<string, any>) => {
          const prev = currentFilter
          currentFilter = (item: any) => {
            if (!prev(item)) return false
            const obj = item[field]
            if (!obj || typeof obj !== 'object') return false
            for (const [k, v] of Object.entries(val)) {
              if (obj[k] !== v) return false
            }
            return true
          }
          return builder
        },
        order: (field: string, opts?: { ascending?: boolean }) => {
          const asc = opts?.ascending ?? true
          currentSort = (a: any, b: any) => {
            const va = String(a[field] ?? '')
            const vb = String(b[field] ?? '')
            return asc ? va.localeCompare(vb) : vb.localeCompare(va)
          }
          return builder
        },
        limit: (n: number) => {
          currentLimit = n
          return builder
        },
        single: async () => {
          isSingle = true
          const res = await new Promise<any>((resolve) => builder.then(resolve))
          if (!res.data || res.data.length === 0) {
            return { data: null, error: { message: 'Row not found', code: 'PGRST116' } }
          }
          return { data: res.data[0], error: null }
        },
        maybeSingle: async () => {
          isMaybeSingle = true
          const res = await new Promise<any>((resolve) => builder.then(resolve))
          if (!res.data || res.data.length === 0) {
            return { data: null, error: null }
          }
          return { data: res.data[0], error: null }
        },
        insert: (payload: any) => {
          const records = Array.isArray(payload) ? payload : [payload]
          const inserted: any[] = []

          for (const item of records) {
            const id = item.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
            const record = { ...item, id, created_at: item.created_at || new Date().toISOString() }

            if (table === 'events') {
              db.events.set(id, record)
            } else if (table === 'event_documents') {
              db.eventDocuments.set(id, record)
            } else if (table === 'sera_vnext_analyses') {
              db.analyses.set(id, record)
            } else if (table === 'sera_vnext_analysis_reviews') {
              db.reviews.push(record)
            } else if (table === 'sera_document_uploads') {
              db.documentUploads.push({ user_id: item.user_id, created_at: new Date().toISOString() })
            } else if (table === 'event_deletion_events') {
              db.deletionEvents.push(record)
            }
            inserted.push(record)
          }

          return {
            select: (_sel?: string) => ({
              single: async () => ({ data: inserted[0], error: null }),
              maybeSingle: async () => ({ data: inserted[0] ?? null, error: null }),
            }),
            then: (resolve: any) => resolve({ data: inserted, error: null }),
          }
        },
        update: (payload: any) => {
          return {
            eq: (field: string, val: any) => {
              const prev = currentFilter
              currentFilter = (item: any) => prev(item) && item[field] === val

              const chain: any = {
                eq: (f2: string, v2: any) => {
                  const p2 = currentFilter
                  currentFilter = (item: any) => p2(item) && item[f2] === v2
                  return chain
                },
                is: (f2: string, v2: any) => {
                  const p2 = currentFilter
                  currentFilter = (item: any) => p2(item) && (v2 === null ? item[f2] == null : item[f2] === v2)
                  return chain
                },
                then: async (resolve: any) => {
                  let count = 0
                  if (table === 'events') {
                    for (const [id, ev] of db.events.entries()) {
                      if (currentFilter(ev)) {
                        db.events.set(id, { ...ev, ...payload })
                        count++
                      }
                    }
                  } else if (table === 'sera_vnext_analyses') {
                    for (const [id, an] of db.analyses.entries()) {
                      if (currentFilter(an)) {
                        db.analyses.set(id, { ...an, ...payload, updated_at: new Date().toISOString() })
                        count++
                      }
                    }
                  } else if (table === 'tenants') {
                    for (const [id, t] of db.tenants.entries()) {
                      if (currentFilter(t)) {
                        db.tenants.set(id, { ...t, ...payload })
                        count++
                      }
                    }
                  }
                  resolve({ count, error: null })
                },
              }
              return chain
            },
          }
        },
        then: async (resolve: any) => {
          let list: any[] = []
          if (table === 'events') list = Array.from(db.events.values())
          else if (table === 'tenants') list = Array.from(db.tenants.values())
          else if (table === 'users') list = Array.from(db.users.values())
          else if (table === 'event_documents') list = Array.from(db.eventDocuments.values())
          else if (table === 'sera_vnext_analyses') list = Array.from(db.analyses.values())
          else if (table === 'sera_vnext_analysis_reviews') list = [...db.reviews]
          else if (table === 'risk_profile_exclusions') list = [...db.riskExclusions]
          else if (table === 'event_duplicate_links') list = [...db.duplicateLinks]

          let filtered = list.filter(currentFilter)
          if (currentSort) filtered.sort(currentSort)
          if (currentLimit !== null) filtered = filtered.slice(0, currentLimit)

          const fn = typeof resolve === 'function' ? resolve : (x: any) => x
          return fn({ data: filtered, error: null })
        },
      }

      return builder
    },
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, buffer: Buffer, opts?: { contentType?: string; upsert?: boolean }) => {
          const key = `${bucket}:${path}`
          if (db.storageFiles.has(key) && !opts?.upsert) {
            return { error: new Error('The resource already exists') }
          }
          db.storageFiles.set(key, { buffer, contentType: opts?.contentType || 'application/octet-stream' })
          return { data: { path }, error: null }
        },
      }),
    },
    auth: {
      getUser: async (token: string) => {
        // Mapeia token para usuário em db
        for (const u of db.users.values()) {
          if (token === `token-${u.auth_user_id}` || token === u.auth_user_id) {
            return {
              data: {
                user: {
                  id: u.auth_user_id,
                  email: u.email,
                  email_confirmed_at: new Date().toISOString(),
                },
              },
              error: null,
            }
          }
        }
        return { data: { user: null }, error: { message: 'Invalid token' } }
      },
    },
  }
}

/**
 * Utilitários para gerar buffers sintéticos para testes de documentos
 */
export function createSyntheticPdfBuffer(text: string): Buffer {
  // Cabeçalho PDF mínimo sintético
  const header = '%PDF-1.4\n'
  const body =
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n` +
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n` +
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n` +
    `4 0 obj\n<< /Length ${text.length + 20} >>\nstream\nBT /F1 12 Tf (${text}) Tj ET\nendstream\nendobj\n`
  const footer = `xref\n0 5\n0000000000 65535 f \ntrailer\n<< /Root 1 0 R >>\nstartxref\n999\n%%EOF`
  return Buffer.from(header + body + footer, 'utf-8')
}

export function createSyntheticDocxBuffer(text: string): Buffer {
  const pkZip = Buffer.from([
    0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  ])
  return Buffer.concat([pkZip, Buffer.from(`synthetic docx content: ${text}`)])
}

export function createEncryptedPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4\n<< /Encrypt 1 0 R >>\n%%EOF')
}

export function createCorruptedPdfBuffer(): Buffer {
  return Buffer.from('%PDF-1.4 [corrupted binary data without EOF or xref')
}

