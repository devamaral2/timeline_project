#!/usr/bin/env bash
# Postgres de teste do apps/auth (compose.test.yaml), isolado por worktree:
# projeto de Compose proprio (timeline-auth-test-<slug>) e uma porta livre
# calculada na hora, em vez da porta fixa 55432. Nao depende de variavel de
# shell sobrevivendo entre invocacoes -- o nome do projeto e deterministico
# (funcao pura de worktree_slug) e a porta e sempre relida do container via
# `docker compose port`, nunca guardada.
#
# Uso, de dentro da worktree:
#   scripts/worktree/auth-test-postgres.sh up    # idempotente; imprime a URL
#   scripts/worktree/auth-test-postgres.sh down  # derruba projeto e volume
#
# Para rodar a suite sem copiar a URL manualmente:
#   AUTH_TEST_DATABASE_URL="$(scripts/worktree/auth-test-postgres.sh up)" \
#     AUTH_REQUIRE_POSTGRES_TESTS=true npm run --silent test:ai
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

cd "$(worktree_root)"
COMPOSE_FILE="apps/auth/compose.test.yaml"
PROJECT="timeline-auth-test-$(worktree_slug)"

running() {
  [ -n "$(docker compose --project-name "$PROJECT" -f "$COMPOSE_FILE" ps --status running -q auth-postgres 2>/dev/null || true)" ]
}

print_url() {
  local mapping port
  mapping="$(docker compose --project-name "$PROJECT" -f "$COMPOSE_FILE" port auth-postgres 5432)"
  port="${mapping##*:}"
  echo "postgresql://auth_test:auth_test@127.0.0.1:${port}/timeline_auth_test"
}

case "${1:-}" in
  up)
    if ! running; then
      # find_free_port checa disponibilidade e fecha o socket de teste antes
      # do Compose de fato ligar a porta -- janela pequena para outra
      # worktree roubar a mesma porta nesse intervalo. Tenta de novo com uma
      # porta nova em vez de falhar na primeira colisao.
      attempt=1
      while true; do
        port="$(find_free_port 55432)"
        if AUTH_TEST_POSTGRES_HOST_PORT="$port" docker compose --project-name "$PROJECT" -f "$COMPOSE_FILE" up -d --wait; then
          break
        fi
        attempt=$((attempt + 1))
        if [ "$attempt" -gt 3 ]; then
          echo "Nao consegui subir o Postgres de teste apos 3 tentativas (colisao de porta persistente?)." >&2
          exit 1
        fi
        echo "Porta $port colidiu ao subir o container, tentando outra (tentativa $attempt/3)..." >&2
      done
    fi
    print_url
    ;;
  down)
    docker compose --project-name "$PROJECT" -f "$COMPOSE_FILE" down -v
    ;;
  *)
    echo "Uso: $0 up|down" >&2
    exit 1
    ;;
esac
