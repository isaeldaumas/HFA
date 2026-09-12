import assert from 'node:assert/strict'
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { isAllowedA4R190LegacyMethodologyPath, isAllowedSeraVNextCanonicalTreePath } from './protected-path-contract'

const rootDir = path.resolve(__dirname, '..', '..')
const protectedPrefixes = [
  'tests/sera-vnext/baselines/',
  'tests/sera-vnext/fixtures/',
  'tests/sera-vnext/fixture-sets/',
  'tests/sera-vnext/baseline-candidates/',
  'frontend/src/lib/sera-vnext/canonical-tree/',
  'frontend/src/lib/sera-vnext/engine-v0/',
  'frontend/src/lib/sera/',
]

function collectFiles(relativeDir: string): string[] {
  const dir = path.join(rootDir, relativeDir)
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const rel = path.relative(rootDir, full)
    if (statSync(full).isDirectory()) files.push(...collectFiles(rel))
    else files.push(rel)
  }
  return files.sort()
}

const files = [
  ...collectFiles('tests/sera-vnext/baselines'),
  ...collectFiles('tests/sera-vnext/fixtures'),
  ...collectFiles('tests/sera-vnext/fixture-sets'),
  ...collectFiles('tests/sera-vnext/baseline-candidates'),
]
const digest = createHash('sha256')
for (const file of files) digest.update(file).update(readFileSync(path.join(rootDir, file)))
assert.equal(digest.digest('hex').length, 64)

const changed = execSync('git diff --name-only && git diff --cached --name-only', { cwd: rootDir, encoding: 'utf8' }).split('\n').filter(Boolean)
for (const file of changed) {
  for (const prefix of protectedPrefixes) {
    if (file.startsWith(prefix) && (isAllowedSeraVNextCanonicalTreePath(rootDir, file) || isAllowedA4R190LegacyMethodologyPath(rootDir, file))) continue
    assert.equal(file.startsWith(prefix), false, `methodology/baseline protected path changed: ${file}`)
  }
}

console.log('INTEGRITY_OK')
