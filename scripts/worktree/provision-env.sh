#!/usr/bin/env bash
# Provisiona (ou reaproveita) o ambiente isolado de UMA worktree: .env.local
# com portas e banco proprios, container Postgres proprio, migrations
# aplicadas. Idempotente: pode ser rodado de novo com seguranca.
#
# Uso: bash scripts/worktree/provision-env.sh
# (precisa ser chamado de dentro da worktree que sera provisionada)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

cd "$(worktree_root)"
COMPOSE_FILE="infra/docker-compose.local.yml"
ENV_FILE=".env.local"
ENV_EXAMPLE=".env.example"

MAIN_ROOT="$(main_worktree_root)"
if [ "$(worktree_root)" = "$MAIN_ROOT" ] && [ "${FORCE_MAIN:-}" != "1" ]; then
  echo "Esta e a worktree principal (${MAIN_ROOT})." >&2
  echo "Os scripts de worktree so provisionam worktrees secundarias, para nao" >&2
  echo "sobrescrever o .env.local que voce ja configura manualmente aqui." >&2
  echo "Se realmente quiser reprovisionar a principal, rode com FORCE_MAIN=1." >&2
  exit 1
fi

SLUG="$(worktree_slug)"
PROJECT_NAME="timeline-${SLUG}"

# Se ja existe um .env.local com este projeto de Compose rodando, o ambiente
# ja esta provisionado e ao vivo: nao mexe nas portas (evita descasar as
# portas gravadas no arquivo das que os processos ja em execucao usam).
EXISTING_PROJECT="$(read_env_var "$ENV_FILE" COMPOSE_PROJECT_NAME)"
if [ -n "$EXISTING_PROJECT" ] && \
   [ -n "$(docker compose --env-file "$ENV_FILE" --project-name "$EXISTING_PROJECT" -f "$COMPOSE_FILE" ps --status running -q postgres 2>/dev/null || true)" ]; then
  echo "Ambiente '$EXISTING_PROJECT' ja esta provisionado e rodando — reaproveitando."
  PROJECT_NAME="$EXISTING_PROJECT"
else
  if [ -z "$POSTGRES_USER" ] || [ -z "$POSTGRES_PASSWORD" ] || [ -z "$POSTGRES_DB" ]; then
    echo "POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB precisam estar disponíveis pelo 1Password." >&2
    exit 1
  fi

  echo "Calculando portas livres para a worktree '$SLUG'..."
  WEB_PORT="$(find_free_port 3000)"
  API_PORT="$(find_free_port $((WEB_PORT + 1)))"
  AUTH_PORT="$(find_free_port $((API_PORT + 1)))"
  METRO_PORT="$(find_free_port $((AUTH_PORT + 1)))"
  POSTGRES_HOST_PORT="$(find_free_port $((METRO_PORT + 1)))"

  AUTH_POSTGRES_DB="${POSTGRES_DB}_auth"
  DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/${POSTGRES_DB}"
  AUTH_DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_HOST_PORT}/${AUTH_POSTGRES_DB}"
  AUTH_DATABASE_MIGRATION_URL="$AUTH_DATABASE_URL"
  AUTH_TEST_DATABASE_URL="$AUTH_DATABASE_URL"
  BACKEND_URL="http://127.0.0.1:${API_PORT}"
  AUTH_ISSUER="http://127.0.0.1:${AUTH_PORT}"
  AUTH_PUBLIC_URL="http://127.0.0.1:${AUTH_PORT}"
  AUTH_WEB_APP_URL="http://localhost:${WEB_PORT}"

  OLD_MOBILE_URL="${MOBILE_API_URL:-}"
  if [ -n "$OLD_MOBILE_URL" ]; then
    MOBILE_API_URL="$(echo "$OLD_MOBILE_URL" | sed -E "s#:[0-9]+\$#:${API_PORT}#")"
    if [ "$MOBILE_API_URL" = "$OLD_MOBILE_URL" ]; then
      MOBILE_API_URL="${OLD_MOBILE_URL}:${API_PORT}"
    fi
  else
    MOBILE_API_URL=""
  fi

  # Este arquivo contém somente configuração local derivada. Segredos e URLs
  # com senha permanecem no ambiente do processo, vindos do carregador.
  cat > "$ENV_FILE" <<EOF
WEB_PORT=${WEB_PORT}
API_PORT=${API_PORT}
API_HOST=127.0.0.1
AUTH_PORT=${AUTH_PORT}
AUTH_HOST=127.0.0.1
METRO_PORT=${METRO_PORT}
POSTGRES_HOST_PORT=${POSTGRES_HOST_PORT}
AUTH_POSTGRES_DB=${AUTH_POSTGRES_DB}
MOBILE_API_URL=${MOBILE_API_URL}
COMPOSE_PROJECT_NAME=${PROJECT_NAME}
EOF

  echo "Escrevi $ENV_FILE (web=$WEB_PORT api=$API_PORT auth=$AUTH_PORT metro=$METRO_PORT postgres=$POSTGRES_HOST_PORT)."
fi

echo "Subindo Postgres (projeto '$PROJECT_NAME')..."
docker compose --env-file "$ENV_FILE" --project-name "$PROJECT_NAME" -f "$COMPOSE_FILE" up -d

echo "Esperando o Postgres ficar saudavel..."
for _ in $(seq 1 30); do
  status="$(docker compose --env-file "$ENV_FILE" --project-name "$PROJECT_NAME" -f "$COMPOSE_FILE" ps --format json postgres 2>/dev/null | grep -o '"Health":"[a-z]*"' | cut -d'"' -f4 || true)"
  [ "$status" = "healthy" ] && break
  sleep 1
done
if [ "$status" != "healthy" ]; then
  echo "Postgres nao ficou saudavel a tempo." >&2
  exit 1
fi

PG_USER="$POSTGRES_USER"
AUTH_DB="$(read_env_var "$ENV_FILE" AUTH_POSTGRES_DB)"
echo "Garantindo que a base '$AUTH_DB' existe..."
EXISTS="$(docker compose --env-file "$ENV_FILE" --project-name "$PROJECT_NAME" -f "$COMPOSE_FILE" exec -T postgres \
  psql -U "$PG_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${AUTH_DB}'")"
if [ "$EXISTS" != "1" ]; then
  docker compose --env-file "$ENV_FILE" --project-name "$PROJECT_NAME" -f "$COMPOSE_FILE" exec -T postgres \
    createdb -U "$PG_USER" "$AUTH_DB"
fi

echo "Aplicando migrations..."
pnpm db:migrate
pnpm --filter @repo/auth run db:migrate

echo "Buildando pacotes (acelera o primeiro 'pnpm dev')..."
pnpm turbo run build

WEB_PORT="$(read_env_var "$ENV_FILE" WEB_PORT)"
API_PORT="$(read_env_var "$ENV_FILE" API_PORT)"
AUTH_PORT="$(read_env_var "$ENV_FILE" AUTH_PORT)"
METRO_PORT="$(read_env_var "$ENV_FILE" METRO_PORT)"
PG_PORT="$(read_env_var "$ENV_FILE" POSTGRES_HOST_PORT)"

cat <<SUMMARY

Worktree '$SLUG' pronta.
  web:      http://localhost:${WEB_PORT}
  api:      http://127.0.0.1:${API_PORT}
  auth:     http://127.0.0.1:${AUTH_PORT}
  metro:    ${METRO_PORT}
  postgres: 127.0.0.1:${PG_PORT} (projeto docker '${PROJECT_NAME}')

Suba os servidores com 'pnpm dev:web', 'pnpm dev:api', 'pnpm dev:auth' (ou
'pnpm dev' para os tres) de dentro desta worktree.
SUMMARY
