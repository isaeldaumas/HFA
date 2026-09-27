import {
  SERA_VNEXT_BASELINE_ID,
  SERA_VNEXT_ENGINE_VERSION,
  SERA_VNEXT_FIXTURE_SET_ID,
  SERA_VNEXT_METHODOLOGY_VERSION,
} from '@/lib/sera-vnext/ENGINE_VERSION'
import {
  SERA_VNEXT_PRODUCT_BETA_INPUT_SCHEMA_VERSION,
  SERA_VNEXT_PRODUCT_BETA_OUTPUT_SCHEMA_VERSION,
} from './constants'

// Provenance model separates DB contract version from actual runtime version:
//   engineVersion        = DB row contract version (locked at 0.1.0 by DB constraint)
//   engineRuntimeVersion = actual executable version used (0.3.0 from ENGINE_VERSION.ts)
//   sourceFlow           = origin of the analysis record
//   canonicalTreeVersion = SERA canonical tree version used for traversal
//
// The split is necessary because the DB schema constraint was finalized before the
// engine runtime reached 0.2.0. A migration adds engine_runtime_version/source_flow/
// canonical_tree_version columns so new rows carry full provenance without altering
// existing records.

const SERA_VNEXT_PRODUCT_BETA_DB_ENGINE_VERSION = '0.1.0' as const

export const SERA_VNEXT_SOURCE_FLOW_PRODUCT_BETA = 'VNEXT_PRODUCT_BETA' as const
export const SERA_VNEXT_CANONICAL_TREE_VERSION = 'SERA_PT_V1' as const

export type SeraVNextSourceFlow =
  | 'LEGACY_SERA'
  | 'VNEXT_ALPHA'
  | 'VNEXT_BETA'
  | 'VNEXT_PRODUCT_BETA'
  | 'VNEXT_CANONICAL'

export type SeraVNextProductVersionSet = {
  engineVersion: string
  engineRuntimeVersion: string
  methodologyVersion: typeof SERA_VNEXT_METHODOLOGY_VERSION
  baselineId: typeof SERA_VNEXT_BASELINE_ID
  fixtureSetId: typeof SERA_VNEXT_FIXTURE_SET_ID
  inputSchemaVersion: string
  outputSchemaVersion: string
  codeCommit: string
  codeCommitSource: 'VERCEL_GIT_COMMIT_SHA' | 'SERA_CODE_COMMIT' | 'GIT_COMMIT_SHA' | 'UNAVAILABLE'
  deploymentId: string | null
  sourceFlow: SeraVNextSourceFlow
  canonicalTreeVersion: string
}

function normalizeGitCommitSha(value: string | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? ''
  return /^[0-9a-f]{40}$/.test(normalized) ? normalized : null
}

function resolveCodeCommit(): Pick<SeraVNextProductVersionSet, 'codeCommit' | 'codeCommitSource'> {
  const candidates = [
    ['VERCEL_GIT_COMMIT_SHA', process.env.VERCEL_GIT_COMMIT_SHA],
    ['SERA_CODE_COMMIT', process.env.SERA_CODE_COMMIT],
    ['GIT_COMMIT_SHA', process.env.GIT_COMMIT_SHA],
  ] as const
  for (const [source, value] of candidates) {
    const sha = normalizeGitCommitSha(value)
    if (sha) return { codeCommit: sha, codeCommitSource: source }
  }
  return { codeCommit: 'UNAVAILABLE', codeCommitSource: 'UNAVAILABLE' }
}

export function getSeraVNextProductVersionSet(): SeraVNextProductVersionSet {
  const commit = resolveCodeCommit()
  return {
    engineVersion: SERA_VNEXT_PRODUCT_BETA_DB_ENGINE_VERSION,
    engineRuntimeVersion: SERA_VNEXT_ENGINE_VERSION,
    methodologyVersion: SERA_VNEXT_METHODOLOGY_VERSION,
    baselineId: SERA_VNEXT_BASELINE_ID,
    fixtureSetId: SERA_VNEXT_FIXTURE_SET_ID,
    inputSchemaVersion: SERA_VNEXT_PRODUCT_BETA_INPUT_SCHEMA_VERSION,
    outputSchemaVersion: SERA_VNEXT_PRODUCT_BETA_OUTPUT_SCHEMA_VERSION,
    codeCommit: commit.codeCommit,
    codeCommitSource: commit.codeCommitSource,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID?.trim() || null,
    sourceFlow: SERA_VNEXT_SOURCE_FLOW_PRODUCT_BETA,
    canonicalTreeVersion: SERA_VNEXT_CANONICAL_TREE_VERSION,
  }
}
