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
  sourceFlow: SeraVNextSourceFlow
  canonicalTreeVersion: string
}

export function getSeraVNextProductVersionSet(): SeraVNextProductVersionSet {
  return {
    engineVersion: SERA_VNEXT_PRODUCT_BETA_DB_ENGINE_VERSION,
    engineRuntimeVersion: SERA_VNEXT_ENGINE_VERSION,
    methodologyVersion: SERA_VNEXT_METHODOLOGY_VERSION,
    baselineId: SERA_VNEXT_BASELINE_ID,
    fixtureSetId: SERA_VNEXT_FIXTURE_SET_ID,
    inputSchemaVersion: SERA_VNEXT_PRODUCT_BETA_INPUT_SCHEMA_VERSION,
    outputSchemaVersion: SERA_VNEXT_PRODUCT_BETA_OUTPUT_SCHEMA_VERSION,
    codeCommit:
      process.env.VERCEL_GIT_COMMIT_SHA?.trim() ||
      process.env.GIT_COMMIT_SHA?.trim() ||
      'LOCAL_OR_UNSET_COMMIT',
    sourceFlow: SERA_VNEXT_SOURCE_FLOW_PRODUCT_BETA,
    canonicalTreeVersion: SERA_VNEXT_CANONICAL_TREE_VERSION,
  }
}
