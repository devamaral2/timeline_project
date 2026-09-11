#!/usr/bin/env bash
# Cria uma worktree nova e ja deixa pronta para rodar/testar a app: pnpm i,
# portas livres, Postgres proprio, migrations aplicadas.
#
# Uso: bash scripts/worktree/setup.sh <caminho> [args do git worktree add...]
# Ex.:  bash scripts/worktree/setup.sh .worktrees/minha-feature -b minha-feature
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

if [ "$#" -lt 1 ]; then
  echo "Uso: $0 <caminho> [args do git worktree add...]" >&2
  echo "Ex.:  $0 .worktrees/minha-feature -b minha-feature" >&2
  exit 1
fi

REPO_ROOT="$(worktree_root)"
cd "$REPO_ROOT"

WORKTREE_PATH="$1"
shift
git worktree add "$WORKTREE_PATH" "$@"

cd "$WORKTREE_PATH"
echo "Instalando dependencias (pnpm i)..."
pnpm install

# Usa o script da propria worktree nova (nao o do checkout original), para
# funcionar mesmo se o branch dela tiver alterado estes scripts.
bash scripts/worktree/provision-env.sh
