#!/usr/bin/env node
/**
 * HFA shadow pre-build interlock.
 *
 * Until human-naturalistic validation and formal author approval are recorded,
 * no new artifact may be compiled with any Shadow activation flag configured.
 * This is a release safety gate, not scientific approval and not runtime access
 * control. Intentional activation requires a separately reviewed gate change.
 */
const flagNames = [
  'SERA_SHADOW_EXECUTION_ENABLED',
  'SERA_SHADOW_PERSISTENCE_ENABLED',
  'SERA_SHADOW_ADMIN_VIEW_ENABLED',
  'SERA_SHADOW_AUTO_COMPARISON_ENABLED',
  'SERA_SHADOW_VALIDATION_REPORTS_ENABLED',
  'NEXT_PUBLIC_SERA_SHADOW_ADMIN_VIEW_ENABLED',
]

const nonOff = flagNames.filter((name) => {
  const value = process.env[name]
  return value !== undefined && value.trim() !== '' && value.trim().toLowerCase() !== 'false'
})

if (nonOff.length > 0) {
  // Report variable NAMES only. Never print configuration values or secrets.
  console.error('[HFA_SHADOW_RELEASE_BLOCKED] Shadow pre-activation gates remain incomplete.')
  console.error('[HFA_SHADOW_RELEASE_BLOCKED] Non-OFF flags:', nonOff.join(', '))
  console.error('[HFA_SHADOW_RELEASE_BLOCKED] Requires separately reviewed author-approved release.')
  process.exitCode = 1
} else {
  console.log('[HFA_SHADOW_RELEASE_GUARD] PASS: all six Shadow flags OFF or unset.')
}
