#!/usr/bin/env node
/**
 * Read-only Supabase Auth control-plane drift audit.
 * Never sends a signup, never creates identities and never prints API keys.
 */
import { pathToFileURL } from 'node:url'

const HOST_RE = /^[a-z0-9-]+\.supabase\.co$/

export function evaluateAuthSettings(settings) {
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return { ok: false, findings: ['MALFORMED_AUTH_SETTINGS'] }
  }
  const findings = []
  if (settings.disable_signup !== true) findings.push('DIRECT_AUTH_SIGNUP_ALLOWED')
  if (settings.external?.email !== true) findings.push('EMAIL_SIGNIN_PROVIDER_NOT_ENABLED')
  if (settings.mailer_autoconfirm !== false) findings.push('EMAIL_CONFIRMATION_NOT_REQUIRED')
  return { ok: findings.length === 0, findings }
}

export async function inspectAuthSettings({
  supabaseUrl,
  anonKey,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof anonKey !== 'string' || !anonKey.trim()) {
    throw new Error('MISSING_PUBLIC_AUTH_KEY')
  }
  let base
  try { base = new URL(supabaseUrl) }
  catch { throw new Error('INVALID_SUPABASE_HOST') }

  // Protect the publishable key from accidental SSRF/redirect exfiltration.
  if (base.protocol !== 'https:' || !HOST_RE.test(base.hostname) ||
      base.port || base.username || base.password ||
      (base.pathname !== '/' && base.pathname !== '') ||
      base.search || base.hash) {
    throw new Error('INVALID_SUPABASE_HOST')
  }
  const settingsUrl = new URL('/auth/v1/settings', base)
  let res
  try {
    res = await fetchImpl(settingsUrl, {
      method: 'GET',
      headers: { apikey: anonKey },
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(12000),
    })
  } catch {
    throw new Error('AUTH_SETTINGS_UNREACHABLE')
  }
  if (!res?.ok) {
    // Do not expose provider bodies, request details, public keys or tokens.
    throw new Error('AUTH_SETTINGS_HTTP_FAILURE')
  }
  let settings
  try { settings = await res.json() }
  catch { throw new Error('AUTH_SETTINGS_INVALID_JSON') }
  return evaluateAuthSettings(settings)
}

async function main() {
  try {
    const result = await inspectAuthSettings({
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    })
    if (!result.ok) {
      console.error('[HFA_AUTH_POLICY_GAP] ' + result.findings.join(','))
      process.exitCode = 2
    } else {
      console.log('[HFA_AUTH_POLICY_OK] direct Auth signup disabled; email provider enabled; email confirmation required.')
    }
  } catch (error) {
    console.error('[HFA_AUTH_POLICY_UNVERIFIED] ' + (error instanceof Error ? error.message : 'UNKNOWN'))
    process.exitCode = 3
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
