#!/usr/bin/env bash
# RabbitMQ compartilhado das worktrees: sobe o broker (uma vez) e gerencia as
# filas por worktree via API de management.
#
# Uso: rabbitmq.sh up                      # garante o broker rodando e saudavel
#      rabbitmq.sh queue <slug> [sufixo]   # declara a fila <slug>.<sufixo> (padrao: health)
#      rabbitmq.sh publish <slug> <json>   # zera <slug>.health e publica o json nela
#      rabbitmq.sh peek <slug>             # imprime a mensagem de <slug>.health (sem consumir)
#      rabbitmq.sh delete <prefixo>        # remove as filas <prefixo>.{health,agent-turn,transcript-event,meal-note}
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

CRED_FILE="${BRAID_RABBITMQ_ENV:-$HOME/.config/braid/rabbitmq.env}"
COMPOSE_FILE="$(main_worktree_root)/infra/docker-compose.rabbitmq.yml"

ensure_credentials() {
  [ -f "$CRED_FILE" ] && return
  mkdir -p "$(dirname "$CRED_FILE")"
  umask 077
  cat > "$CRED_FILE" <<EOT
RABBITMQ_DEFAULT_USER=braid
RABBITMQ_DEFAULT_PASS=$(openssl rand -hex 16)
RABBITMQ_HOST_PORT=5672
RABBITMQ_MANAGEMENT_PORT=15672
EOT
  echo "Credenciais do RabbitMQ geradas em $CRED_FILE (fora do Git)."
}

cred() { read_env_var "$CRED_FILE" "$1"; }

# curl na API de management sem expor a senha na linha de comando.
api() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-fsS --max-time 10 -X "$method" -H 'content-type: application/json' -K -)
  if [ -n "$body" ]; then args+=(-d "$body"); fi
  # As credenciais entram pela configuracao em stdin, nunca na linha de comando.
  printf 'user = "%s:%s"\n' "$(cred RABBITMQ_DEFAULT_USER)" "$(cred RABBITMQ_DEFAULT_PASS)" \
    | curl "${args[@]}" "http://127.0.0.1:$(cred RABBITMQ_MANAGEMENT_PORT)/api/${path}"
}

cmd_up() {
  ensure_credentials
  docker compose --env-file "$CRED_FILE" -f "$COMPOSE_FILE" up -d
  echo "Esperando o RabbitMQ ficar saudavel..."
  local status=""
  for _ in $(seq 1 60); do
    status="$(docker inspect -f '{{.State.Health.Status}}' braid-rabbitmq 2>/dev/null || true)"
    [ "$status" = "healthy" ] && break
    sleep 2
  done
  [ "$status" = "healthy" ] || { echo "RabbitMQ nao ficou saudavel a tempo." >&2; exit 1; }
  for _ in $(seq 1 90); do api GET overview >/dev/null 2>&1 && return; sleep 1; done
  echo "API de management do RabbitMQ nao respondeu." >&2
  exit 1
}

cmd_queue() {
  local queue="$1.${2:-health}"
  api PUT "queues/%2F/${queue}" '{"durable":true,"auto_delete":false}' >/dev/null
  echo "Fila '${queue}' declarada no RabbitMQ."
}

cmd_publish() {
  local queue="$1.health" payload="$2" body routed
  api DELETE "queues/%2F/${queue}/contents" >/dev/null
  body="$(node -e 'process.stdout.write(JSON.stringify({properties:{delivery_mode:2,content_type:"application/json"},routing_key:process.argv[1],payload:process.argv[2],payload_encoding:"string"}))' "$queue" "$payload")"
  routed="$(api POST "exchanges/%2F/amq.default/publish" "$body")"
  case "$routed" in *'"routed":true'*) echo "Mensagem de saude publicada em '${queue}'." ;;
    *) echo "RabbitMQ nao roteou a mensagem para '${queue}': $routed" >&2; exit 1 ;;
  esac
}

cmd_peek() {
  api POST "queues/%2F/$1.health/get" '{"count":1,"ackmode":"ack_requeue_true","encoding":"auto"}'
}

cmd_delete() {
  local slug="$1" name
  while read -r name; do
    [ -n "$name" ] || continue
    api DELETE "queues/%2F/${name}" >/dev/null && echo "Fila '${name}' removida."
  done < <(api GET queues | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const q of JSON.parse(s))if(["health","agent-turn","transcript-event","meal-note"].some(k=>q.name===process.argv[1]+"."+k))console.log(q.name)})' "$slug")
}

case "${1:-}" in
  up) cmd_up ;;
  queue) cmd_queue "${2:?slug}" "${3:-health}" ;;
  publish) cmd_publish "${2:?slug}" "${3:?json}" ;;
  peek) cmd_peek "${2:?slug}" ;;
  delete) cmd_delete "${2:?slug}" ;;
  *) echo "Uso: $0 up|queue|publish|peek|delete" >&2; exit 1 ;;
esac
