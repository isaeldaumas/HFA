#!/usr/bin/env npx tsx
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const freezePath = join(root, 'docs/hfa-backlog/naturalistic-kit/campaigns/V04_SEALED_001/CAMPAIGN_FREEZE.json')
const sealPath = join(root, 'docs/hfa-backlog/naturalistic-kit/campaigns/V04_SEALED_001/PUBLIC_SEAL.json')
const freeze = JSON.parse(readFileSync(freezePath, 'utf8'))
const seal = JSON.parse(readFileSync(sealPath, 'utf8'))

function gitTree(path: string): string {
  return execFileSync('git', ['rev-parse', `HEAD:${path}`], { cwd: root, encoding: 'utf8' }).trim()
}
function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(join(root, path))).digest('hex')
}
function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) throw new Error(`${label}: expected=${expected} actual=${actual}`)
}

assertEqual(freeze.schemaVersion, 'SERA_V04_CAMPAIGN_FREEZE_V1', 'schemaVersion')
assertEqual(freeze.campaignId, 'V04_SEALED_001', 'campaignId')
assertEqual(gitTree('frontend/src/lib/sera-vnext'), freeze.seraVNextTreeOid, 'seraVNextTreeOid')
assertEqual(gitTree('frontend/src/lib/sera-vnext-runtime'), freeze.seraVNextRuntimeTreeOid, 'seraVNextRuntimeTreeOid')
assertEqual(sha256(freeze.taxonomyPath), freeze.taxonomySha256, 'taxonomySha256')
assertEqual(seal.campaignId, freeze.campaignId, 'publicSealCampaignId')
assertEqual(seal.engineExecuted, false, 'publicSealEngineExecuted')
assertEqual(freeze.engineExecutedOnHoldout, false, 'engineExecutedOnHoldout')
assertEqual(freeze.humanReferenceFrozen, false, 'humanReferenceFrozen')
assertEqual(freeze.holdoutSourceContentReviewedByRuntimeDeveloper, false, 'holdoutSourceContentReviewedByRuntimeDeveloper')
assertEqual(freeze.productionAuthorization, 'NOT_AUTHORIZED', 'productionAuthorization')

console.log(JSON.stringify({
  campaignFreeze: 'PASS',
  campaignId: freeze.campaignId,
  seraVNextTreeOid: freeze.seraVNextTreeOid,
  seraVNextRuntimeTreeOid: freeze.seraVNextRuntimeTreeOid,
  taxonomySha256: freeze.taxonomySha256,
  engineExecutedOnHoldout: freeze.engineExecutedOnHoldout,
  humanReferenceFrozen: freeze.humanReferenceFrozen,
  productionAuthorization: freeze.productionAuthorization,
}, null, 2))
console.log('SERA_V04_CAMPAIGN_FREEZE_OK')
