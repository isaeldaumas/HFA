#!/usr/bin/env npx tsx
/**
 * Structural validator for naturalistic kit artifacts.
 * NEVER emits methodological PASS/FAIL.
 * Always ends with ENGINE_NATURALISTIC_VALIDATION_NOT_READY.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(process.cwd(), 'docs/hfa-backlog/naturalistic-kit')
const REQUIRED = [
  'README.md',
  'schemas/case-manifest.schema.json',
  'schemas/human-reference.schema.json',
  'schemas/blind-evaluator-form.schema.json',
  'schemas/vnext-output-capture.schema.json',
  'schemas/adjudication-log.schema.json',
  'templates/blind-evaluator-form.md',
  'templates/case-manifest.md',
]

let structuralOk = true
for (const rel of REQUIRED) {
  const path = join(ROOT, rel)
  if (!existsSync(path)) {
    console.error(`MISSING ${rel}`)
    structuralOk = false
  } else {
    console.log(`FOUND ${rel}`)
  }
}

for (const file of readdirSync(join(ROOT, 'schemas'))) {
  if (!file.endsWith('.json')) continue
  const raw = readFileSync(join(ROOT, 'schemas', file), 'utf8')
  JSON.parse(raw)
  console.log(`JSON_OK schemas/${file}`)
}

console.log(
  JSON.stringify(
    {
      structuralValidation: structuralOk ? 'STRUCTURE_OK' : 'STRUCTURE_FAIL',
      scientificValidation: 'NOT_RUN',
      humanValidation: 'NOT_STARTED',
      productAuthorization: 'NOT_AUTHORIZED',
      methodologicalGate: 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY',
    },
    null,
    2,
  ),
)

if (!structuralOk) process.exit(1)
console.log('ENGINE_NATURALISTIC_VALIDATION_NOT_READY')
