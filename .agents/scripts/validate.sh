#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

required_files=(
  .agents/README.md
  .agents/manifest.yaml
  .agents/adapters/README.md
  .agents/mcp/examples/server.example.yaml
  .agents/plugins/manifest.yaml
  .agents/hooks/events.yaml
  .agents/scripts/ai-memory-hook.sh
  .agents/browser/runner.mjs
  .agents/browser/Dockerfile
  .agents/environments/local/compose.yaml
)

for file in "${required_files[@]}"; do
  [[ -f "$file" ]] || { echo "missing required file: $file" >&2; exit 1; }
done

bash -n .agents/scripts/*.sh
node --check .agents/browser/runner.mjs

python3 - <<'PY'
import pathlib
import yaml

root = pathlib.Path('.')
assert not (root / '.ia').exists(), 'legacy .ia directory must not exist'
manifest = yaml.safe_load((root / '.agents/manifest.yaml').read_text())
assert manifest['schemaVersion'] == 2
assert manifest['sourceOfTruth'] == '.agents'
assert set(manifest['components']) == {
    'skills', 'hooks', 'mcp', 'plugins', 'browser', 'environments',
    'adapters', 'worktrees', 'scripts', 'docs'
}

skills_root = root / '.agents/skills'
assert not skills_root.is_symlink(), 'skills root must be a real canonical directory'
skills = sorted(skills_root.glob('*/SKILL.md'))
assert skills, 'no canonical skills found'

plugins = yaml.safe_load((root / '.agents/plugins/manifest.yaml').read_text())
assert set(plugins['plugins']) == {'linear', 'gmail', 'github', 'ai-memory'}

events = yaml.safe_load((root / '.agents/hooks/events.yaml').read_text())
assert set(events['events']) == {
    'session-start', 'user-prompt-submit', 'pre-tool-use', 'post-tool-use',
    'pre-compact', 'stop', 'session-end'
}

for skill_file in skills:
    assert not skill_file.is_symlink(), skill_file
    skill_dir = skill_file.parent
    assert skill_dir.name == skill_dir.name.lower()
    assert skill_dir.name.replace('-', '').isalnum(), skill_dir

    skill_parts = skill_file.read_text().split('---', 2)
    assert len(skill_parts) == 3 and skill_parts[0].strip() == '', skill_file
    frontmatter = yaml.safe_load(skill_parts[1])
    assert frontmatter['name'] == skill_dir.name, skill_file
    assert frontmatter.get('description'), skill_file

    metadata_file = skill_dir / 'agents/openai.yaml'
    assert metadata_file.is_file(), f'missing Codex metadata: {metadata_file}'
    metadata = yaml.safe_load(metadata_file.read_text())
    interface = metadata['interface']
    assert interface.get('display_name'), metadata_file
    assert 25 <= len(interface.get('short_description', '')) <= 64, metadata_file
    assert f"${skill_dir.name}" in interface.get('default_prompt', ''), metadata_file
PY

if command -v docker >/dev/null 2>&1; then
  docker compose --env-file .agents/environments/local/.env.example \
    -f .agents/environments/local/compose.yaml --profile ia-staging config --quiet
fi

git diff --check
echo "IA infrastructure validation passed"
