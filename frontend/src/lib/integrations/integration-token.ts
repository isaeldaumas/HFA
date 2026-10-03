import { createHash, randomBytes } from 'node:crypto'

const TOKEN_PREFIX = 'hfa_int_'

export function hashIntegrationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function generateIntegrationToken(): { token: string; tokenHash: string; tokenPrefix: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  return {
    token,
    tokenHash: hashIntegrationToken(token),
    tokenPrefix: token.slice(0, 18),
  }
}

export function extractIntegrationBearerToken(req: Request): string | null {
  const auth = req.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7).trim()
  if (!token.startsWith(TOKEN_PREFIX) || token.length < 30) return null
  return token
}
