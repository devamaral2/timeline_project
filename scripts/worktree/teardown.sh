#!/usr/bin/env bash
# Remove uma worktree: encerra os servidores de dev, remove a worktree do git e
# atualiza Caddy e /etc/hosts. Destrutivo: apaga os dados daquela worktree. Os
# bancos SQLite sao arquivos em .data/ dentro dela (ADR 0024 e 0025) e saem junto
# com a pasta, inclusive a fila de jobs de IA, que e uma tabela do banco da API.
#
# So uma worktree do modelo antigo (COMPOSE_PROJECT_NAME no .env.local) usa
# Docker aqui, para derrubar o Postgres proprio dela; esse caso precisa do
# ambiente do 1Password (use `pnpm worktree:teardown <caminho>`).
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
# `git worktree remove` recusaria no fim, depois de ja ter derrubado os servidores
# (e, no modelo antigo, destruido o banco).
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
elif [ -n "$PROJECT_NAME" ]; then
  echo "Derrubando Postgres do projeto '$PROJECT_NAME' (container + volume)..."
  docker compose --env-file "$ENV_FILE" --project-name "$PROJECT_NAME" -f "$WORKTREE_PATH/infra/docker-compose.local.yml" down -v || true
else
  echo "Sem ambiente provisionado em $ENV_FILE; nada a encerrar."
fi

echo "Removendo a worktree do git..."
git worktree remove "${REMOVE_FLAGS[@]}" "$WORKTREE_PATH"

echo "Atualizando o Caddyfile e o /etc/hosts..."
bash "$SCRIPT_DIR/caddy.sh" sync || echo "Aviso: nao consegui atualizar o Caddyfile." >&2
bash "$SCRIPT_DIR/hosts.sh" sync || echo "Aviso: nao consegui atualizar o /etc/hosts." >&2
