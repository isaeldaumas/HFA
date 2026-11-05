import assert from 'node:assert/strict'
import { handleSeraVNextCandidateRequest } from '../../../frontend/src/app/api/admin/sera-vnext/candidate/handler'
import { analyzeSeraVNextCandidateOnly } from '../../../frontend/src/lib/sera-vnext-runtime'
import type { ProductAlphaParityResult } from './types'

export async function runProductAlphaParity(): Promise<ProductAlphaParityResult> {
  const narrative =
    'During the night approach, the crew noticed unstable indications and descended below the intended glide path. The captain decided to continue the approach despite the warning. Seconds later the aircraft struck runway lights and sustained damage.'

  const direct = analyzeSeraVNextCandidateOnly({
    input: { eventText: narrative, clientRequestId: 'product-alpha-parity' },
    requestId: 'product-alpha-parity',
  })

  const response = await handleSeraVNextCandidateRequest(
    new Request('http://localhost/api/admin/sera-vnext/candidate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-request-id': 'product-alpha-parity' },
      body: JSON.stringify({ eventText: narrative, clientRequestId: 'product-alpha-parity' }),
    }),
    {
      requireAdminUser: async () => ({
        userId: 'product-alpha-parity',
        email: 'parity@example.test',
        tenantId: 'tenant-product-alpha',
        role: 'admin',
        accessToken: 'must-not-leak',
      }),
      isReadOnlyEnabled: () => true,
      isInternalPilotEnabled: () => true,
      isCandidateOnlyEnabled: () => true,
      logEvent: () => undefined,
      requestId: () => 'product-alpha-parity',
    },
  )

  assert.equal(response.status, 200)
  const routePayload = await response.json()

  const findings: string[] = []
  for (const key of [
    'canonicalTreeStatus',
    'selectedCode',
    'releasedCode',
    'finalConclusion',
    'classifiedOutput',
    'readyPromotion',
    'downstreamAllowed',
  ] as const) {
    if (JSON.stringify(direct[key]) !== JSON.stringify(routePayload[key])) {
      findings.push(`mismatch on ${key}`)
    }
  }

  for (const key of ['factualExtraction', 'escapePoint', 'directActor', 'axes', 'preconditions', 'canonicalTraversal'] as const) {
    if (JSON.stringify(direct[key]) !== JSON.stringify(routePayload[key])) {
      findings.push(`mismatch on ${key}`)
    }
  }

  return {
    passed: findings.length === 0,
    findings,
  }
}
