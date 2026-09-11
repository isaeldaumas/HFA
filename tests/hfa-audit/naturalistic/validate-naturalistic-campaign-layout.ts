/**
 * Validates campaign directory layout for blinding separation.
 * Does not invent cases or emit methodological PASS.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

function parseArgs(argv: string[]): { campaign: string } {
  const idx = argv.indexOf('--campaign')
  if (idx < 0 || !argv[idx + 1]) {
    throw new Error('Usage: --campaign <path-to-campaign-dir>')
  }
  return { campaign: argv[idx + 1] }
}

const REQUIRED_DIRS = ['reference', 'blind', 'vnext', 'adjudication', 'pairs'] as const

function main() {
  const { campaign } = parseArgs(process.argv.slice(2))
  if (!existsSync(campaign) || !statSync(campaign).isDirectory()) {
    throw new Error(`CAMPAIGN_DIR_MISSING: ${campaign}`)
  }

  const problems: string[] = []
  for (const dir of REQUIRED_DIRS) {
    const path = join(campaign, dir)
    if (!existsSync(path) || !statSync(path).isDirectory()) {
      problems.push(`MISSING_DIR ${dir}`)
    }
  }

  // Blinding: no vNext JSON inside blind/; no reference JSON inside blind/
  const blindDir = join(campaign, 'blind')
  if (existsSync(blindDir)) {
    for (const file of readdirSync(blindDir)) {
      if (!file.endsWith('.json')) continue
      const lower = file.toLowerCase()
      if (lower.includes('vnext') || lower.includes('reference')) {
        problems.push(`BLIND_PACKET_CONTAMINATION ${file}`)
      }
    }
  }

  const referenceDir = join(campaign, 'reference')
  if (existsSync(referenceDir)) {
    for (const file of readdirSync(referenceDir)) {
      if (!file.endsWith('.json')) continue
      if (file.toLowerCase().includes('vnext')) {
        problems.push(`REFERENCE_MUST_NOT_CONTAIN_VNEXT ${file}`)
      }
    }
  }

  const result = {
    campaign,
    structuralValidation: problems.length === 0 ? 'STRUCTURE_OK' : 'STRUCTURE_FAIL',
    problems,
    methodologicalGate: 'ENGINE_NATURALISTIC_VALIDATION_NOT_READY',
    note: 'Layout check only. Does not authorize human validation or product release.',
  }
  console.log(JSON.stringify(result, null, 2))
  console.log('ENGINE_NATURALISTIC_VALIDATION_NOT_READY')
  if (problems.length > 0) process.exit(1)
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  console.log('ENGINE_NATURALISTIC_VALIDATION_NOT_READY')
  process.exit(1)
}
