import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const ROOT_DIR = path.resolve(__dirname, '..', '..')
const FRONTEND_ENV_PATH = path.join(ROOT_DIR, 'frontend', '.env.local')
const require = createRequire(import.meta.url)
const { createClient } = require(path.join(ROOT_DIR, 'frontend', 'node_modules', '@supabase', 'supabase-js')) as {
  createClient: (...args: unknown[]) => unknown
}
type SupabaseClient = any

export const TMP_DIR = path.join(ROOT_DIR, 'tmp', 'sera-vnext-controlled-admin-pilot')
export const PLAYWRIGHT_OUTPUT_DIR = path.join(ROOT_DIR, 'output', 'playwright', 'sera-vnext-controlled-admin-pilot')

let envLoaded = false

export type PilotSession = {
  participantId: string
  authUserId: string
  publicUserId: string | null
  tenantId: string
  tenantPlan: string | null
  email: string
  accessToken: string
  actionLink: string
}

type ResolvedPilotUser = {
  participantId: string
  authUserId: string
  publicUserId: string | null
  tenantId: string
  tenantPlan: string | null
  email: string
}

export type ProductBetaDbState = {
  analysis: Record<string, unknown>
  revisions: Array<Record<string, unknown>>
  reviews: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function loadFrontendEnv(): void {
  if (envLoaded) return
  if (!fs.existsSync(FRONTEND_ENV_PATH)) {
    throw new Error(`Missing frontend env file: ${FRONTEND_ENV_PATH}`)
  }
  for (const line of fs.readFileSync(FRONTEND_ENV_PATH, 'utf8').split('\n')) {
    const match = line.match(/^([^#=][^=]*)=(.*)$/)
    if (!match) continue
    if (!process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim()
  }
  envLoaded = true
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required env: ${name}`)
  return value
}

export function sanitizeId(value: string | null | undefined): string {
  if (!value) return 'null'
  if (value.length <= 8) return `${value}****`
  return `${value.slice(0, 8)}****`
}

export function sanitizeProjectRef(supabaseUrl: string): string {
  const match = supabaseUrl.match(/^https:\/\/([^.]+)\./)
  if (!match) return 'unknown-project-ref'
  const ref = match[1]
  if (ref.length <= 8) return `${ref}****`
  return `${ref.slice(0, 8)}...${ref.slice(-4)}`
}

export function buildBaseUrl(): string {
  return process.env.SERA_VNEXT_TEST_BASE_URL?.trim() || 'http://127.0.0.1:3100'
}

export function createSupabaseClients(): { admin: SupabaseClient; anon: SupabaseClient } {
  loadFrontendEnv()
  const url = requiredEnv('NEXT_PUBLIC_SUPABASE_URL')
  const service = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const anon = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')

  return {
    admin: createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } }),
    anon: createClient(url, anon, { auth: { autoRefreshToken: false, persistSession: false } }),
  }
}

export async function waitForServer(baseUrl: string, maxAttempts = 40): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(baseUrl, { method: 'GET' })
      if (res.ok || res.status === 200 || res.status === 307 || res.status === 308) return
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`Server did not become reachable: ${baseUrl}`)
}

function fixtureMatchesPrefix(tenantId: string, tenantPrefix: string): boolean {
  const compact = tenantId.replace(/-/g, '').toLowerCase()
  const prefix = tenantPrefix.replace(/-/g, '').toLowerCase()
  return compact.startsWith(prefix) || tenantId.toLowerCase().startsWith(tenantPrefix.toLowerCase())
}

async function resolveFixtureUser(args: {
  participantId: string
  fixture: 'A' | 'B'
  tenantPrefix: string
  requirePlan?: string
}): Promise<ResolvedPilotUser> {
  const { admin } = createSupabaseClients()
  const { participantId, fixture, tenantPrefix, requirePlan } = args
  const userEnv = fixture === 'A' ? 'HFA_TEST_USER_A_ID' : 'HFA_TEST_USER_B_ID'
  const tenantEnv = fixture === 'A' ? 'HFA_TEST_TENANT_A_ID' : 'HFA_TEST_TENANT_B_ID'
  const fixtureUserId = process.env[userEnv]?.trim()
  const fixtureTenantId = process.env[tenantEnv]?.trim()
  if (!fixtureUserId || !fixtureTenantId) {
    throw new Error(`ENVIRONMENT_NOT_CONFIGURED: missing ${userEnv}/${tenantEnv}`)
  }

  const publicUser = await admin
    .from('users')
    .select('id, tenant_id, role, is_active, auth_user_id, email')
    .eq('id', fixtureUserId)
    .maybeSingle()
  if (publicUser.error) throw new Error(`Public user lookup failed: ${publicUser.error.message}`)
  if (!publicUser.data?.id) {
    throw new Error(`ENVIRONMENT_NOT_CONFIGURED: ${userEnv} not found in public.users`)
  }
  if (publicUser.data.is_active === false) {
    throw new Error(`ENVIRONMENT_NOT_CONFIGURED: fixture user ${fixture} is inactive`)
  }
  const tenantId = String(publicUser.data.tenant_id)
  if (tenantId !== fixtureTenantId) {
    throw new Error(
      `FIXTURE_SAFETY_VIOLATION: ${userEnv} tenant_id does not match ${tenantEnv}`
    )
  }
  if (tenantPrefix && !fixtureMatchesPrefix(tenantId, tenantPrefix)) {
    throw new Error(
      `FIXTURE_SAFETY_VIOLATION: fixture ${fixture} tenant does not match requested prefix`
    )
  }

  const authUserId =
    typeof publicUser.data.auth_user_id === 'string' && publicUser.data.auth_user_id
      ? publicUser.data.auth_user_id
      : publicUser.data.id
  const authUserRes = await admin.auth.admin.getUserById(authUserId)
  if (authUserRes.error || !authUserRes.data.user?.email) {
    throw new Error(
      `ENVIRONMENT_NOT_CONFIGURED: Auth user missing for fixture ${fixture} (${authUserRes.error?.message ?? 'no email'})`
    )
  }

  const tenantRow = await admin.from('tenants').select('plan, is_active').eq('id', tenantId).maybeSingle()
  if (tenantRow.error) throw new Error(`Tenant lookup failed: ${tenantRow.error.message}`)
  if (tenantRow.data?.is_active === false) {
    throw new Error(`ENVIRONMENT_NOT_CONFIGURED: fixture tenant ${fixture} is inactive`)
  }
  const tenantPlan = typeof tenantRow.data?.plan === 'string' ? tenantRow.data.plan : null
  if (requirePlan && tenantPlan !== requirePlan) {
    throw new Error(
      `ENVIRONMENT_NOT_CONFIGURED: Expected plan ${requirePlan} for fixture ${fixture}, got ${tenantPlan ?? 'null'}`
    )
  }

  return {
    participantId,
    authUserId,
    publicUserId: publicUser.data.id,
    tenantId,
    tenantPlan,
    email: authUserRes.data.user.email,
  }
}

async function resolvePilotUser(args: {
  baseUrl: string
  participantId: string
  tenantPrefix: string
  requirePlan?: string
}): Promise<ResolvedPilotUser> {
  const { admin } = createSupabaseClients()
  const { participantId, tenantPrefix, requirePlan } = args

  const integrated =
    Boolean(process.env.HFA_INTEGRATED_REGRESSION_LEVEL?.trim()) ||
    process.env.HFA_TEST_ENVIRONMENT?.trim().toLowerCase() === 'staging'

  const tenantA = process.env.HFA_TEST_TENANT_A_ID?.trim()
  const tenantB = process.env.HFA_TEST_TENANT_B_ID?.trim()
  const hasFixtures = Boolean(process.env.HFA_TEST_USER_A_ID?.trim() && tenantA)

  if (hasFixtures) {
    if (tenantA && fixtureMatchesPrefix(tenantA, tenantPrefix)) {
      return resolveFixtureUser({ participantId, fixture: 'A', tenantPrefix, requirePlan })
    }
    if (tenantB && process.env.HFA_TEST_USER_B_ID?.trim() && fixtureMatchesPrefix(tenantB, tenantPrefix)) {
      return resolveFixtureUser({ participantId, fixture: 'B', tenantPrefix, requirePlan })
    }
    if (integrated) {
      throw new Error(
        `FIXTURE_SAFETY_VIOLATION: requested tenantPrefix does not match staging fixture A or B`
      )
    }
  } else if (integrated) {
    throw new Error(
      'ENVIRONMENT_NOT_CONFIGURED: integrated staging requires HFA_TEST_USER_A_ID / HFA_TEST_TENANT_A_ID (and B for cross-tenant)'
    )
  }

  // Legacy non-integrated path only: DB-authoritative admin lookup by tenant prefix.
  const { data: dbUsers, error: dbUsersError } = await admin
    .from('users')
    .select('id, tenant_id, role, is_active, auth_user_id, email')
    .eq('is_active', true)
    .eq('role', 'admin')
    .like('tenant_id', `${tenantPrefix}%`)
    .limit(5)
  if (dbUsersError) throw new Error(`Admin user lookup failed: ${dbUsersError.message}`)

  const matched = (dbUsers ?? [])[0] ?? null
  if (!matched) {
    throw new Error(
      `ENVIRONMENT_NOT_CONFIGURED: Admin auth user not found for tenant prefix ${tenantPrefix}. ` +
        'Configure HFA_TEST_USER_A_ID / HFA_TEST_TENANT_A_ID for staging fixtures.'
    )
  }

  const tenantId = String(matched.tenant_id)
  const tenantRow = await admin.from('tenants').select('plan').eq('id', tenantId).maybeSingle()
  if (tenantRow.error) throw new Error(`Tenant lookup failed: ${tenantRow.error.message}`)
  const tenantPlan = typeof tenantRow.data?.plan === 'string' ? tenantRow.data.plan : null
  if (requirePlan && tenantPlan !== requirePlan) {
    throw new Error(
      `ENVIRONMENT_NOT_CONFIGURED: Expected plan ${requirePlan} for ${tenantPrefix}, got ${tenantPlan ?? 'null'}`
    )
  }
  const authUserId =
    typeof matched.auth_user_id === 'string' && matched.auth_user_id
      ? matched.auth_user_id
      : matched.id
  const authUserRes = await admin.auth.admin.getUserById(authUserId)
  if (authUserRes.error || !authUserRes.data.user?.email) {
    throw new Error(
      `ENVIRONMENT_NOT_CONFIGURED: Admin auth user not found for tenant prefix ${tenantPrefix}`
    )
  }
  return {
    participantId,
    authUserId,
    publicUserId: matched.id,
    tenantId,
    tenantPlan,
    email: authUserRes.data.user.email,
  }
}

export async function createMagicLinkBrowserSession(args: {
  baseUrl: string
  participantId: string
  tenantPrefix: string
  requirePlan?: string
}): Promise<PilotSession> {
  const { admin } = createSupabaseClients()
  const resolved = await resolvePilotUser(args)
  const link = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: resolved.email,
    options: { redirectTo: `${args.baseUrl}/auth/callback` },
  })
  if (link.error || !link.data.properties?.action_link) {
    throw link.error ?? new Error('Magiclink generation failed')
  }

  return {
    ...resolved,
    accessToken: '',
    actionLink: link.data.properties.action_link,
  }
}

export async function createMagicLinkSession(args: {
  baseUrl: string
  participantId: string
  tenantPrefix: string
  requirePlan?: string
}): Promise<PilotSession> {
  const { admin, anon } = createSupabaseClients()
  const { baseUrl } = args
  const resolved = await resolvePilotUser(args)
  let lastError: unknown = null

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const link = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: resolved.email,
      options: { redirectTo: `${baseUrl}/auth/callback` },
    })
    if (link.error || !link.data.properties?.hashed_token || !link.data.properties?.action_link) {
      throw link.error ?? new Error('Magiclink generation failed')
    }

    const verify = await anon.auth.verifyOtp({
      token_hash: link.data.properties.hashed_token,
      type: 'magiclink',
    })
    if (!verify.error && verify.data.session?.access_token) {
      return {
        ...resolved,
        accessToken: verify.data.session.access_token,
        actionLink: link.data.properties.action_link,
      }
    }

    lastError = verify.error ?? new Error('Magiclink verification failed')
    const code = typeof verify.error === 'object' && verify.error !== null && 'code' in verify.error
      ? String((verify.error as { code?: unknown }).code ?? '')
      : ''
    if (code !== 'otp_expired' || attempt === 3) break
    await sleep(350)
  }

  throw lastError ?? new Error('Magiclink verification failed')
}

export async function apiJson<T = unknown>(args: {
  baseUrl: string
  path: string
  token?: string
  method?: 'DELETE' | 'GET' | 'POST'
  body?: unknown
  extraHeaders?: Record<string, string>
}): Promise<{ status: number; json: T; durationMs: number; requestId: string }> {
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  const headers: Record<string, string> = {
    'x-request-id': requestId,
    ...(args.extraHeaders ?? {}),
  }
  if (args.token) headers.Authorization = `Bearer ${args.token}`
  if (args.body !== undefined) headers['Content-Type'] = 'application/json'

  const started = Date.now()
  const response = await fetch(`${args.baseUrl}${args.path}`, {
    method: args.method ?? 'GET',
    headers,
    body: args.body === undefined ? undefined : JSON.stringify(args.body),
  })
  const durationMs = Date.now() - started
  const json = await response.json().catch(() => ({})) as T
  return { status: response.status, json, durationMs, requestId }
}

export async function fetchProductBetaDbState(tenantId: string, analysisId: string): Promise<ProductBetaDbState> {
  const { admin } = createSupabaseClients()
  const analysis = await admin
    .from('sera_vnext_analyses')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('id', analysisId)
    .maybeSingle()
  if (analysis.error || !analysis.data) {
    throw new Error(`Analysis lookup failed: ${analysis.error?.message ?? 'not found'}`)
  }
  const [revisions, reviews, events] = await Promise.all([
    admin.from('sera_vnext_analysis_revisions').select('*').eq('tenant_id', tenantId).eq('analysis_id', analysisId).order('revision_number', { ascending: true }),
    admin.from('sera_vnext_analysis_reviews').select('*').eq('tenant_id', tenantId).eq('analysis_id', analysisId).order('created_at', { ascending: true }),
    admin.from('sera_vnext_analysis_events').select('*').eq('tenant_id', tenantId).eq('analysis_id', analysisId).order('created_at', { ascending: true }),
  ])
  if (revisions.error) throw new Error(`Revision lookup failed: ${revisions.error.message}`)
  if (reviews.error) throw new Error(`Review lookup failed: ${reviews.error.message}`)
  if (events.error) throw new Error(`Event lookup failed: ${events.error.message}`)

  return {
    analysis: analysis.data as Record<string, unknown>,
    revisions: (revisions.data ?? []) as Array<Record<string, unknown>>,
    reviews: (reviews.data ?? []) as Array<Record<string, unknown>>,
    events: (events.data ?? []) as Array<Record<string, unknown>>,
  }
}

export function writeJsonReport(fileName: string, value: unknown): string {
  ensureDir(TMP_DIR)
  const filePath = path.join(TMP_DIR, fileName)
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`)
  return filePath
}

export function pwcliPath(): string {
  if (process.env.PWCLI?.trim()) return process.env.PWCLI.trim()
  const repoCli = path.join(ROOT_DIR, 'scripts', 'playwright-cli.sh')
  if (fs.existsSync(repoCli)) return repoCli
  const codexCli = path.join(process.env.HOME || '', '.codex', 'skills', 'playwright', 'scripts', 'playwright_cli.sh')
  if (fs.existsSync(codexCli)) return codexCli
  throw new Error(
    'ENVIRONMENT_NOT_CONFIGURED: Playwright CLI missing. Set PWCLI or keep scripts/playwright-cli.sh in the repo.'
  )
}

export function pwExec(session: string, args: string[], mode: 'plain' | 'raw' | 'json' = 'plain'): string {
  ensureDir(PLAYWRIGHT_OUTPUT_DIR)
  const cliArgs = ['--session', session]
  if (mode === 'raw') cliArgs.push('--raw')
  if (mode === 'json') cliArgs.push('--json')
  cliArgs.push(...args)
  return execFileSync(pwcliPath(), cliArgs, {
    cwd: PLAYWRIGHT_OUTPUT_DIR,
    encoding: 'utf8',
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

export function pwEval<T>(session: string, expression: string): T {
  return JSON.parse(pwExec(session, ['eval', expression], 'raw')) as T
}

export async function pwWaitFor<T>(
  session: string,
  expression: string,
  predicate: (value: T) => boolean,
  options: { timeoutMs?: number; intervalMs?: number; description?: string } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 20_000
  const intervalMs = options.intervalMs ?? 250
  const started = Date.now()

  for (;;) {
    const value = pwEval<T>(session, expression)
    if (predicate(value)) return value
    if (Date.now() - started >= timeoutMs) {
      throw new Error(`PLAYWRIGHT_WAIT_TIMEOUT: ${options.description ?? expression}`)
    }
    await sleep(intervalMs)
  }
}

export async function pwWaitForUrlMatch(
  session: string,
  matcher: RegExp,
  timeoutMs = 20_000,
): Promise<string> {
  return pwWaitFor<string>(
    session,
    'location.href',
    (value) => matcher.test(String(value)),
    { timeoutMs, description: `url ${matcher}` },
  )
}

export async function pwWaitForText(
  session: string,
  text: string,
  timeoutMs = 20_000,
): Promise<string> {
  return pwWaitFor<string>(
    session,
    'document.body.innerText',
    (value) => String(value).includes(text),
    { timeoutMs, description: `text ${text}` },
  )
}

export function pwSetFormValue(session: string, selector: string, value: string): boolean {
  return pwEval<boolean>(
    session,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement)) return false;
      const prototype =
        element instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : element instanceof HTMLSelectElement
            ? HTMLSelectElement.prototype
            : HTMLInputElement.prototype;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
      descriptor?.set?.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    })()`,
  )
}

export function pwClickSelector(session: string, selector: string): boolean {
  return pwEval<boolean>(
    session,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) return false;
      element.click();
      return true;
    })()`,
  )
}

export function pwClickByText(
  session: string,
  selector: string,
  text: string,
): boolean {
  return pwEval<boolean>(
    session,
    `(() => {
      const normalized = ${JSON.stringify(text)}.replace(/\\s+/g, ' ').trim();
      const element = Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((candidate) => {
        if (!(candidate instanceof HTMLElement)) return false;
        return (candidate.textContent || '').replace(/\\s+/g, ' ').trim().includes(normalized);
      });
      if (!(element instanceof HTMLElement)) return false;
      element.click();
      return true;
    })()`,
  )
}

export function pwSetCheckbox(session: string, selector: string, checked: boolean): boolean {
  return pwEval<boolean>(
    session,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLInputElement) || element.type !== 'checkbox') return false;
      if (element.checked !== ${checked ? 'true' : 'false'}) element.click();
      return element.checked === ${checked ? 'true' : 'false'};
    })()`,
  )
}

export function pwInteractiveLabels(session: string): string[] {
  return pwEval<string[]>(
    session,
    `Array.from(document.querySelectorAll('button, a'))
      .map((element) => (element.textContent || '').replace(/\\s+/g, ' ').trim())
      .filter(Boolean)`,
  )
}

export function pwConsoleWarnings(session: string): string {
  const raw = pwExec(session, ['console', 'warning'], 'json')
  const parsed = JSON.parse(raw) as { result?: string }
  return String(parsed.result ?? '')
}

export function pwRequests(session: string): string {
  return pwExec(session, ['requests'])
}

export function eventCountByType(events: Array<Record<string, unknown>>): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const event of events) {
    const key = String(event.event_type ?? 'unknown')
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

export function parsePlaywrightRequestLines(raw: string): Array<{
  index: number
  method: string
  url: string
  status: number
  statusText: string
}> {
  const requests: Array<{
    index: number
    method: string
    url: string
    status: number
    statusText: string
  }> = []

  for (const line of raw.split('\n')) {
    const match = line.match(/^(\d+)\.\s+\[(\w+)\]\s+(\S+)\s+=>\s+\[(\d+)\]\s+(.+)$/)
    if (!match) continue
    requests.push({
      index: Number(match[1]),
      method: match[2],
      url: match[3],
      status: Number(match[4]),
      statusText: match[5],
    })
  }

  return requests
}
