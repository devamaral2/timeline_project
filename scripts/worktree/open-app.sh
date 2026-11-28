#!/usr/bin/env bash
# Deixa web+api+auth DESTA worktree no ar e gera um link de login de uso unico
# (admin@admin.com, senha ADMIN_PASSWORD do 1Password) para abrir a app ja logada.
#
# Saida (ultimas linhas):
#   APP_URL=http://localhost:<WEB_PORT>
#   LOGIN_URL=http://localhost:<porta>/<nonce>   (vale uma visita, por 5 minutos)
#
# Uso: pnpm app:open   (de dentro da worktree; principal ou secundaria)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

cd "$(worktree_root)"
ENV_FILE=".env.local"

if [ "$(worktree_root)" != "$(main_worktree_root)" ] && [ -z "$(read_env_var "$ENV_FILE" WORKTREE_SLUG)" ]; then
  echo "Esta worktree ainda nao foi provisionada. Rode antes: pnpm worktree:provision" >&2
  exit 1
fi

bash "$SCRIPT_DIR/start-dev.sh"

WEB_PORT="$(read_env_var "$ENV_FILE" WEB_PORT)"
WEB_PORT="${WEB_PORT:-3000}"

mkdir -p .agents/runtime
LINK_FILE=".agents/runtime/login-link"
LINK_LOG=".agents/runtime/login-link.log"
rm -f "$LINK_FILE"
setsid nohup node scripts/onepassword/exec.mjs node "$SCRIPT_DIR/login-link.mjs" "$WEB_PORT" "$LINK_FILE" \
  > "$LINK_LOG" 2>&1 < /dev/null &

# O carregador do 1Password leva alguns segundos para entregar o ambiente.
for _ in $(seq 1 60); do
  [ -s "$LINK_FILE" ] && break
  sleep 1
done
if [ ! -s "$LINK_FILE" ]; then
  echo "O link de login nao saiu. Veja $LINK_LOG:" >&2
  tail -n 20 "$LINK_LOG" >&2 || true
  exit 1
fi

echo "APP_URL=http://localhost:${WEB_PORT}"
echo "LOGIN_URL=$(cat "$LINK_FILE")"
rm -f "$LINK_FILE"
