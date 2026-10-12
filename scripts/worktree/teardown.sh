#!/usr/bin/env bash
# Remove uma worktree: encerra os servidores de dev, apaga as bases dela no
# Postgres compartilhado (ou o container proprio, no modelo antigo), apaga as
# filas <slug>.* do RabbitMQ, remove a worktree do git e atualiza Caddy e
# /etc/hosts. Destrutivo: apaga os dados daquela worktree.
#
# Precisa do ambiente do 1Password (use `pnpm worktree:teardown <caminho>`).
# Recusa worktree com mudancas nao commitadas, salvo TEARDOWN_FORCE=1.
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

# Antes de apagar qualquer dado: se a worktree tem mudancas nao commitadas, o
# `git worktree remove` recusaria no fim e as bases ja teriam sido destruidas.
if [ -n "$(git -C "$WORKTREE_PATH" status --porcelain 2>/dev/null)" ] && [ "${TEARDOWN_FORCE:-}" != "1" ]; then
  echo "A worktree '$WORKTREE_PATH' tem mudancas nao commitadas; nada foi apagado." >&2
  git -C "$WORKTREE_PATH" status --short | head -10 >&2
  echo "Commite/guarde o trabalho, ou rode com TEARDOWN_FORCE=1 para descartar." >&2
  exit 1
fi
REMOVE_FLAGS=()
[ "${TEARDOWN_FORCE:-}" = "1" ] && REMOVE_FLAGS=(--force)

ENV_FILE="$WORKTREE_PATH/.env.local"
PROJECT_NAME="$(read_env_var "$ENV_FILE" COMPOSE_PROJECT_NAME)"
SLUG="$(read_env_var "$ENV_FILE" WORKTREE_SLUG)"
if [ -n "$SLUG" ]; then
  echo "Encerrando servidores de dev de '$SLUG'..."
  bash "$WORKTREE_PATH/scripts/worktree/stop-dev.sh" || echo "Aviso: nao consegui encerrar todos os servidores." >&2

  PG_CONTAINER="$(shared_pg_container)"
  if [ -n "$PG_CONTAINER" ]; then
    for db in "$(read_env_var "$ENV_FILE" POSTGRES_DB)" "$(read_env_var "$ENV_FILE" AUTH_POSTGRES_DB)"; do
      [ -n "$db" ] || continue
      echo "Apagando a base '$db' de $PG_CONTAINER..."
      docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:?POSTGRES_USER ausente (use pnpm worktree:teardown)}" -d postgres \
        -c "DROP DATABASE IF EXISTS \"${db}\" WITH (FORCE)"
    done
  else
    echo "Aviso: Postgres compartilhado parado; as bases de '$SLUG' ficaram." >&2
  fi
  bash "$SCRIPT_DIR/rabbitmq.sh" delete "$SLUG" || echo "Aviso: nao consegui limpar as filas de '$SLUG'." >&2
elif [ -n "$PROJECT_NAME" ]; then
  echo "Derrubando Postgres do projeto '$PROJECT_NAME' (container + volume)..."
  docker compose --env-file "$ENV_FILE" --project-name "$PROJECT_NAME" -f "$WORKTREE_PATH/infra/docker-compose.local.yml" down -v || true
else
  echo "Nao achei COMPOSE_PROJECT_NAME em $ENV_FILE — pulando docker compose down." >&2
fi

echo "Removendo a worktree do git..."
git worktree remove "${REMOVE_FLAGS[@]}" "$WORKTREE_PATH"

echo "Atualizando o Caddyfile e o /etc/hosts..."
bash "$SCRIPT_DIR/caddy.sh" sync || echo "Aviso: nao consegui atualizar o Caddyfile." >&2
bash "$SCRIPT_DIR/hosts.sh" sync || echo "Aviso: nao consegui atualizar o /etc/hosts." >&2
