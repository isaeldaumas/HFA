/** Bump only when a deployed engine/presentation correction materially changes
 * the interpretation of a previously stored event. Prevents repeatedly
 * reprocessing blocked reports without new facts or a new engine correction.
 */
export const SERA_ENGINE_REFRESH_EPOCH = 'CAL20A_CAL22_20261014_1'

export function canReprocessCurrentEngine(args: {
  requested: unknown
  hasNewEvidence: boolean
  lastEngineRefreshEpoch?: string | null
}): boolean {
  return args.requested === true && !args.hasNewEvidence && args.lastEngineRefreshEpoch !== SERA_ENGINE_REFRESH_EPOCH
}
