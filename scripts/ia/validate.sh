#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

required_files=(
  .ia/README.md
  .ia/manifest.yaml
  .ia/mcp/examples/server.example.yaml
  .ia/plugins/manifest.yaml
  .ia/hooks/events.yaml
  scripts/ia/adapter.sh
  scripts/ia/ai-memory-hook.sh
  scripts/ia/vps-bootstrap.sh
  infra/ai-staging/compose.yaml
  infra/ai-browser/runner.mjs
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || { echo "missing required file: $file" >&2; exit 1; }
done

bash -n scripts/ia/*.sh
node --check infra/ai-browser/runner.mjs
scripts/ia/adapter.sh check >/dev/null

python3 - <<'PY'
import pathlib
import yaml

manifest = yaml.safe_load(pathlib.Path('.ia/manifest.yaml').read_text())
assert manifest['schemaVersion'] == 1
assert set(manifest['components']) == {'skills', 'hooks', 'mcp', 'plugins', 'worktrees', 'scripts', 'docs'}

plugins = yaml.safe_load(pathlib.Path('.ia/plugins/manifest.yaml').read_text())
assert set(plugins['plugins']) == {'linear', 'gmail', 'github', 'ai-memory'}

events = yaml.safe_load(pathlib.Path('.ia/hooks/events.yaml').read_text())
assert set(events['events']) == {'session-start', 'user-prompt-submit', 'pre-tool-use', 'post-tool-use', 'pre-compact', 'stop', 'session-end'}
PY

if command -v docker >/dev/null 2>&1; then
  docker compose --env-file infra/ai-staging/.env.example \
    -f infra/ai-staging/compose.yaml --profile ia-staging config --quiet
fi

git diff --check
echo "IA infrastructure validation passed"
