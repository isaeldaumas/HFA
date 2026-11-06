import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/app/auth/callback/page.tsx', import.meta.url), 'utf8')

test('OAuth callback does not log URL fragments, codes or sensitive provider messages', () => {
  assert.doesNotMatch(source, /href:\s*window\.location\.href/)
  assert.doesNotMatch(source, /console\.(?:log|error|warn)\([^\n]*(?:window\.location\.href|\bcode\s*[,}]|err\.message)/)
  assert.doesNotMatch(source, /message:\s*(?:exErr|sessionErr|bootstrapErr)\.message/)
  assert.doesNotMatch(source, /reason:\s*bootstrapErr/)
  assert.match(source, /errorType: bootstrapErr instanceof Error/)
})
