#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v vercel >/dev/null 2>&1; then
  echo "ERROR: Vercel CLI not found." >&2
  exit 1
fi

SHA="${SERA_DEPLOY_SHA:-$(git rev-parse HEAD)}"
if [[ ! "$SHA" =~ ^[0-9a-fA-F]{40}$ ]]; then
  echo "ERROR: invalid deployment SHA: $SHA" >&2
  exit 1
fi
SHA="$(printf '%s' "$SHA" | tr '[:upper:]' '[:lower:]')"

if [[ "${ALLOW_DIRTY_DEPLOY:-0}" != "1" ]] && [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "ERROR: tracked working tree changes present; refusing production deploy." >&2
  exit 1
fi

if [[ ! -f .vercel/project.json ]]; then
  echo "ERROR: .vercel/project.json missing. Link the HFA project before deploying." >&2
  exit 1
fi

echo "Deploying HFA production provenance SHA: $SHA"
exec vercel deploy --prod --yes \
  --build-env "SERA_CODE_COMMIT=$SHA" \
  --env "SERA_CODE_COMMIT=$SHA" \
  --meta "seraCodeCommit=$SHA" \
  "$ROOT"
