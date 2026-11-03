#!/usr/bin/env node
/**
 * Read-only HFA migration-ledger preflight.
 * Does NOT connect to a database, run migrations, or mark releases as authorized.
 * A snapshot must be refreshed independently from the Supabase migration ledger.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ownDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(ownDir, '../..');

function inputOption(key, fallback) {
  const index = process.argv.indexOf(key);
  return index < 0 ? fallback : process.argv[index + 1];
}

const root = path.resolve(inputOption('--root', defaultRoot));
const snapshotPath = path.resolve(inputOption('--snapshot', path.join(root, 'docs/release/migration-ledger-snapshot-20261103.json')));
const mode = inputOption('--mode', 'source-check');
const maxAgeHours = 24;
const problems = [];
const warn = [];
const output = (x) => console.log(JSON.stringify(x, null, 2));

function fail(message) { problems.push(message); }
function check(value, description) { if (!value) fail(description); }
function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

if (!['source-check', 'db-push'].includes(mode)) {
  console.error('USAGE: node preflight-migration-history.mjs [--root DIR] [--snapshot PATH] [--mode source-check|db-push]');
  process.exit(64);
}

let snapshot;
try { snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')); }
catch (e) { console.error('SNAPSHOT_UNREADABLE:', e.message); process.exit(3); }

check(snapshot.schema === 'hfa.migration-ledger.snapshot.v1', 'Unexpected snapshot schema');
check(snapshot.repository === 'isaeldaumas/HFA', 'Snapshot for wrong repository');
check(snapshot.project_id === 'vbdpweliprcsktyxodss', 'Snapshot for wrong Supabase project');
check(snapshot.release_policy === 'BLOCK_DB_PUSH_WITHOUT_MANUAL_HISTORY_RECONCILIATION', 'Release-policy safety lock absent');
check(Array.isArray(snapshot.remote_migrations), 'Remote migration ledger missing');
check(Array.isArray(snapshot.alias_pairs), 'Alias mapping missing');
check(Array.isArray(snapshot.historical_replaced), 'Historical replacement mapping missing');

const observed = Date.parse(snapshot.observed_at);
const ageHours = (Date.now() - observed) / 36e5;
check(Number.isFinite(ageHours) && ageHours >= -1 && ageHours <= maxAgeHours,
  'Supabase snapshot stale or timestamp invalid; reacquire migration ledger read-only');

const directory = path.join(root, 'supabase/migrations');
let localFiles;
try { localFiles = fs.readdirSync(directory).filter((p) => /^\d{14}_.+\.sql$/.test(p)).sort(); }
catch (e) { console.error('LOCAL_MIGRATIONS_UNREADABLE:', e.message); process.exit(3); }

const local = localFiles.map((p) => ({
  version: p.slice(0, 14),
  filename: p,
  digest: hash(fs.readFileSync(path.join(directory, p))),
}));
const localSet = new Set(local.map((m) => m.version));
const remote = Array.isArray(snapshot.remote_migrations) ? snapshot.remote_migrations : [];
const remoteVersions = remote.map((m) => String(m.version));
const remoteSet = new Set(remoteVersions);
check(remoteSet.size === remote.length, 'Duplicate versions in Supabase snapshot');
check(localSet.size === local.length, 'Duplicate local migration version');
check(remote.length === 51, 'Unexpected remote migration count (snapshot requires review)');
check(local.length === 47, 'Unexpected local migration count (snapshot requires review)');

const knownHashes = snapshot.local_file_sha256 || {};
check(Object.keys(knownHashes).length === local.length, 'Missing or extra source-file SHA256 in snapshot');
for (const file of local) {
  check(knownHashes[file.filename] === file.digest, 'Source SQL changed since audit: ' + file.filename);
}

const aliases = Array.isArray(snapshot.alias_pairs) ? snapshot.alias_pairs : [];
const historical = Array.isArray(snapshot.historical_replaced) ? snapshot.historical_replaced : [];
const assignedLocal = new Set();
const assignedRemote = new Set();
for (const x of aliases) {
  check(localSet.has(x.local_version), 'Alias local version missing: ' + x.local_version);
  check(remoteSet.has(x.remote_version), 'Alias remote version missing: ' + x.remote_version);
  check(!assignedLocal.has(x.local_version), 'Alias local version duplicated: ' + x.local_version);
  check(!assignedRemote.has(x.remote_version), 'Alias remote version duplicated: ' + x.remote_version);
  check(x.sql_comparison === 'lexically_equivalent_2026-11-03', 'Alias not validated lexically: ' + x.local_version);
  assignedLocal.add(x.local_version);
  assignedRemote.add(x.remote_version);
}
for (const x of historical) {
  check(localSet.has(x.local_version), 'Historical SQL absent: ' + x.local_version);
  check(x.reapply_forbidden === true, 'Historical migration is missing reapplication lock: ' + x.local_version);
  check(!assignedLocal.has(x.local_version), 'Historical migration also aliased: ' + x.local_version);
  assignedLocal.add(x.local_version);
}
const exact = local.filter((m) => remoteSet.has(m.version));
const unmatchedLocal = local.filter((m) => !remoteSet.has(m.version));
for (const x of unmatchedLocal) {
  check(assignedLocal.has(x.version), 'Unclassified local migration: ' + x.filename);
}
const remoteOnly = remote.filter((m) => !localSet.has(String(m.version)));
const expectedRemoteOnly = new Set(aliases.map((x) => x.remote_version));
const expectedAdditional = new Set(snapshot.additional_remote_versions || []);
for (const x of remoteOnly) {
  check(expectedRemoteOnly.has(x.version) || expectedAdditional.has(x.version),
    'Unclassified remote-only version: ' + x.version);
}
check(expectedAdditional.size === 5, 'Supplementary remote migration history not fully classified');
for (const x of expectedAdditional) {
  check(remoteSet.has(x), 'Supplementary remote version disappeared: ' + x);
  check(!localSet.has(x), 'Supplementary remote version now duplicates local version: ' + x);
}

const summary = {
  check: 'HFA_MIGRATION_LEDGER_PREFLIGHT',
  mode,
  status: problems.length ? 'FAIL' : mode === 'db-push' ? 'BLOCKED' : 'SOURCE_SNAPSHOT_MATCH',
  snapshot: path.basename(snapshotPath),
  snapshot_age_hours: Number(ageHours.toFixed(2)),
  local_migrations: local.length,
  remote_migrations: remote.length,
  exact_versions: exact.length,
  lexically_verified_aliases: aliases.length,
  historical_non_equivalent: historical.length,
  supplementary_remote_versions: expectedAdditional.size,
  db_push_allowed: false,
  disclaimer: 'Offline comparison against a dated ledger snapshot; no live database access, no deploy authorization.',
  problems,
  notices: warn
};

if (mode === 'db-push') {
  summary.problems.push('DATABASE PUSH BLOCKED: local and remote migration versions differ; manual reconciliation and authorization required.');
}
output(summary);
process.exit(summary.problems.length ? (mode === 'db-push' ? 2 : 1) : 0);
