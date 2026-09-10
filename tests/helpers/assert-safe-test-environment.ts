/**
 * Compatibility re-export.
 *
 * Historical trials imported `../../helpers/assert-safe-test-environment` from
 * `tests/sera-vnext/*`, which resolves to `tests/helpers/...`.
 * Canonical implementation lives under `tests/sera-vnext/helpers/`.
 */
export {
  assertSafeTestEnvironment,
  type SafeTestFixture,
} from '../sera-vnext/helpers/assert-safe-test-environment.ts'
