#!/usr/bin/env bash
set -euo pipefail

SHA=${1:-}
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "uso: braid-deploy <commit-sha>" >&2; exit 2; }
source /opt/braid/env.sh
ROOT=/opt/braid/src
cd "$ROOT"
test "$(git remote get-url origin)" = "git@github.com:devamaral2/timeline_project.git"
test -z "$(git status --porcelain)" || { echo "Há alterações locais na VPS" >&2; exit 1; }

export GIT_SSH_COMMAND="ssh -i /opt/braid/private/github-deploy -o IdentitiesOnly=yes -o BatchMode=yes"
git fetch --no-tags origin main
git cat-file -e "$SHA^{commit}"
git checkout --detach "$SHA"
test "$(git rev-parse HEAD)" = "$SHA"
exec bash "$ROOT/ops/production/deploy-release.sh" "$SHA"
