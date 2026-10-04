#!/usr/bin/env bash
# Sobe web+api+auth (pnpm dev) desta worktree em segundo plano e espera
# responderem. Idempotente: se as portas ja estao no ar, nao sobe de novo.
#
# Uso: bash scripts/worktree/start-dev.sh   (de dentro da worktree)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

cd "$(worktree_root)"
ENV_FILE=".env.local"
WEB_PORT="$(read_env_var "$ENV_FILE" WEB_PORT)"
API_PORT="$(read_env_var "$ENV_FILE" API_PORT)"
AUTH_PORT="$(read_env_var "$ENV_FILE" AUTH_PORT)"
: "${WEB_PORT:?WEB_PORT ausente em .env.local}" "${API_PORT:?}" "${AUTH_PORT:?}"

listening() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

if listening "$WEB_PORT" && listening "$API_PORT" && listening "$AUTH_PORT"; then
  echo "Web, API e Auth ja estao no ar."
  exit 0
fi

mkdir -p .agents/runtime
LOG=".agents/runtime/dev.log"
echo "Subindo 'pnpm dev' (log: $LOG)..."
setsid nohup pnpm dev > "$LOG" 2>&1 < /dev/null &
echo $! > .agents/runtime/dev.pid

for _ in $(seq 1 120); do
  if listening "$WEB_PORT" && listening "$API_PORT" && listening "$AUTH_PORT" \
     && [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${WEB_PORT}/" || true)" != "000" ]; then
    echo "Web (${WEB_PORT}), API (${API_PORT}) e Auth (${AUTH_PORT}) no ar."
    exit 0
  fi
  sleep 2
done
echo "Os servidores nao subiram a tempo. Veja $LOG." >&2
tail -n 30 "$LOG" >&2 || true
exit 1
