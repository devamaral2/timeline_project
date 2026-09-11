#!/usr/bin/env bash
# Derruba o Postgres de uma worktree (container + volume) e remove a
# worktree do git. Destrutivo: apaga o banco daquela worktree.
#
# Uso: bash scripts/worktree/teardown.sh <caminho-da-worktree>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

if [ "$#" -ne 1 ]; then
  echo "Uso: $0 <caminho-da-worktree>" >&2
  exit 1
fi

WORKTREE_PATH="$1"
if [ ! -d "$WORKTREE_PATH" ]; then
  echo "Worktree '$WORKTREE_PATH' nao encontrada." >&2
  exit 1
fi

ENV_FILE="$WORKTREE_PATH/.env.local"
PROJECT_NAME="$(read_env_var "$ENV_FILE" COMPOSE_PROJECT_NAME)"
if [ -n "$PROJECT_NAME" ]; then
  echo "Derrubando Postgres do projeto '$PROJECT_NAME' (container + volume)..."
  docker compose --env-file "$ENV_FILE" --project-name "$PROJECT_NAME" -f "$WORKTREE_PATH/infra/docker-compose.local.yml" down -v || true
else
  echo "Nao achei COMPOSE_PROJECT_NAME em $ENV_FILE — pulando docker compose down." >&2
fi

echo "Removendo a worktree do git..."
git worktree remove "$WORKTREE_PATH"
