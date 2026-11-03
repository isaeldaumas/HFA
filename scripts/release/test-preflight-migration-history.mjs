#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'../..');
const executable=path.join(here,'preflight-migration-history.mjs');
const baseline=JSON.parse(fs.readFileSync(path.join(root,'docs/release/migration-ledger-snapshot-20261103.json'),'utf8'));
// Unit tests keep the source snapshot conceptually fresh; the real preflight does not.
baseline.observed_at = new Date().toISOString();
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'hfa-migration-guard-test-'));

function check(mode, patch=()=>{}, expectedStatus=0, expectedMessage='') {
  const manifest=structuredClone(baseline);
  patch(manifest);
  const input=path.join(temp,'snapshot-'+Math.random().toString(36).slice(2)+'.json');
  fs.writeFileSync(input,JSON.stringify(manifest));
  const child=spawnSync(process.execPath,[executable,'--root',root,'--snapshot',input,'--mode',mode],{encoding:'utf8',timeout:12000});
  assert.equal(child.status,expectedStatus,`expected exit ${expectedStatus}, got ${child.status}: ${child.stderr}\n${child.stdout}`);
  const output=JSON.parse(child.stdout);
  if(expectedMessage) assert.ok(output.problems.some(s=>s.includes(expectedMessage)),JSON.stringify(output.problems));
  return output;
}
try {
  assert.equal(check('source-check').status,'SOURCE_SNAPSHOT_MATCH');
  assert.equal(check('db-push',()=>{},2,'DATABASE PUSH BLOCKED').db_push_allowed,false);
  check('source-check',s=>{s.observed_at='2020-01-01T00:00:00Z'},1,'snapshot stale');
  check('source-check',s=>{s.alias_pairs.pop()},1,'Unclassified local migration');
  check('source-check',s=>{let f=Object.keys(s.local_file_sha256)[0];s.local_file_sha256[f]='0'.repeat(64)},1,'Source SQL changed');
  check('source-check',s=>{s.remote_migrations.pop()},1,'Unexpected remote migration count');
  check('source-check',s=>{s.additional_remote_versions.pop()},1,'Supplementary remote migration history');
  check('source-check',s=>{s.project_id='other-project'},1,'wrong Supabase project');
  check('source-check',s=>{s.historical_replaced[0].reapply_forbidden=false},1,'reapplication lock');
  console.log('MIGRATION_PREFLIGHT_TESTS_PASS 9/9');
} finally {
  fs.rmSync(temp,{recursive:true,force:true});
}
