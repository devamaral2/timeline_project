#!/usr/bin/env bash
# Provisiona (ou reaproveita) o ambiente isolado de UMA worktree. Idempotente.
#
# Passos (nenhum e opcional):
#   1. .env.local com portas livres e nomes proprios (bases, fila, dominio)
#   2. alias <slug>.braid.local: /etc/hosts + Caddy
#   3. node_modules integros (pnpm install reaplicado + binarios conferidos)
#   4. bases <slug> e <slug>_auth DENTRO do Postgres compartilhado (porta 54391)
#   5. fila <slug>.health no RabbitMQ compartilhado
#   6. migrations da API e do Auth
#   7. usuario admin (senha de ADMIN_PASSWORD)
#   8. build, sonda de saude (bases -> fila), servidores de dev e login de teste
#   9. link para abrir no navegador
#
# Uso: bash scripts/worktree/provision-env.sh   (de dentro da worktree;
#      via `pnpm worktree:provision`, que injeta o ambiente do 1Password)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

cd "$(worktree_root)"
ENV_FILE=".env.local"
CADDY_PORT="${CADDY_PORT:-8080}"
# Mesmo e-mail fixo do `create-admin` (apps/auth) e da worktree principal.
ADMIN_EMAIL="admin@admin.com"

MAIN_ROOT="$(main_worktree_root)"
if [ "$(worktree_root)" = "$MAIN_ROOT" ] && [ "${FORCE_MAIN:-}" != "1" ]; then
  echo "Esta e a worktree principal (${MAIN_ROOT})." >&2
  echo "Os scripts de worktree so provisionam worktrees secundarias, para nao" >&2
  echo "sobrescrever o .env.local que voce ja configura manualmente aqui." >&2
  echo "Se realmente quiser reprovisionar a principal, rode com FORCE_MAIN=1." >&2
  exit 1
fi

for var in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DB ADMIN_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "$var precisa estar disponível pelo 1Password (rode via 'pnpm worktree:provision')." >&2
    exit 1
  fi
done

SLUG="$(worktree_slug)"
DB_NAME="$(db_name_for_slug "$SLUG")"
AUTH_DB_NAME="${DB_NAME}_auth"
QUEUE="${SLUG}.health"
HOST="${SLUG}.braid.local"
APP_URL="http://${HOST}:${CADDY_PORT}"

step() { printf '\n[%s/9] %s\n' "$1" "$2"; }

# --- 1. .env.local -----------------------------------------------------------
step 1 "Portas e .env.local da worktree '$SLUG'"
if [ -n "$(read_env_var "$ENV_FILE" COMPOSE_PROJECT_NAME)" ]; then
  echo "Este .env.local e do modelo antigo (Postgres proprio por worktree)." >&2
  echo "Remova o ambiente antigo com teardown ou apague o .env.local e rode de novo." >&2
  exit 1
fi
if [ -z "$(read_env_var "$ENV_FILE" WORKTREE_SLUG)" ]; then
  RESERVED_PORTS="$(reserved_ports | tr '\n' ' ')"
  export RESERVED_PORTS
  WEB_PORT="$(find_unreserved_port 3000)"
  RESERVED_PORTS="$RESERVED_PORTS $WEB_PORT"
  API_PORT="$(find_unreserved_port $((WEB_PORT + 1)))"
  RESERVED_PORTS="$RESERVED_PORTS $API_PORT"
  AUTH_PORT="$(find_unreserved_port $((API_PORT + 1)))"
  # Este arquivo guarda so configuracao local derivada. Segredos e URLs com
  # senha continuam vindo do 1Password (o carregador monta as URLs das bases).
  cat > "$ENV_FILE" <<EOT
WORKTREE_SLUG=${SLUG}
WEB_PORT=${WEB_PORT}
API_PORT=${API_PORT}
API_HOST=127.0.0.1
AUTH_PORT=${AUTH_PORT}
AUTH_HOST=127.0.0.1
POSTGRES_HOST_PORT=${SHARED_PG_PORT}
POSTGRES_DB=${DB_NAME}
AUTH_POSTGRES_DB=${AUTH_DB_NAME}
AUTH_WEB_APP_URL=${APP_URL}
RABBITMQ_HEALTH_QUEUE=${QUEUE}
AI_JOBS_QUEUE_PREFIX=${SLUG}
EOT
  echo "Escrevi $ENV_FILE."
else
  echo "Reaproveitando o $ENV_FILE existente."
fi
if [ -z "$(read_env_var "$ENV_FILE" AI_JOBS_QUEUE_PREFIX)" ]; then
  printf '\nAI_JOBS_QUEUE_PREFIX=%s\n' "$SLUG" >> "$ENV_FILE"
fi
WEB_PORT="$(read_env_var "$ENV_FILE" WEB_PORT)"
API_PORT="$(read_env_var "$ENV_FILE" API_PORT)"
AUTH_PORT="$(read_env_var "$ENV_FILE" AUTH_PORT)"
echo "web=$WEB_PORT api=$API_PORT auth=$AUTH_PORT postgres=$SHARED_PG_PORT (compartilhado)"

# O carregador do 1Password le o .env.local ANTES deste script rodar; na
# primeira vez ele ainda nao existia e o ambiente herdado aponta para as bases
# da principal. Recarrega o ambiente (agora com o .env.local) uma unica vez.
if [ "${BRAID_ENV_RELOADED:-}" != "1" ]; then
  echo "Recarregando o ambiente com o .env.local da worktree..."
  BRAID_ENV_RELOADED=1 exec node scripts/onepassword/exec.mjs bash scripts/worktree/provision-env.sh
fi
# Trava: nunca migrar/criar admin se as URLs nao apontam para as bases desta worktree.
case "${DATABASE_URL:-}" in */"${DB_NAME}") ;; *) echo "DATABASE_URL nao aponta para '${DB_NAME}'; abortando." >&2; exit 1 ;; esac
case "${AUTH_DATABASE_URL:-}" in */"${AUTH_DB_NAME}") ;; *) echo "AUTH_DATABASE_URL nao aponta para '${AUTH_DB_NAME}'; abortando." >&2; exit 1 ;; esac
case "${AUTH_DATABASE_MIGRATION_URL:-}" in */"${AUTH_DB_NAME}") ;; *) echo "AUTH_DATABASE_MIGRATION_URL nao aponta para '${AUTH_DB_NAME}'; abortando." >&2; exit 1 ;; esac

# --- 2. alias no Caddy + /etc/hosts -------------------------------------------
step 2 "Alias ${HOST} (Caddy + /etc/hosts)"
bash "$SCRIPT_DIR/hosts.sh" sync
bash "$SCRIPT_DIR/caddy.sh" sync
bash "$SCRIPT_DIR/hosts.sh" check "$SLUG"

# --- 3. node_modules ---------------------------------------------------------
step 3 "node_modules"
pnpm install --frozen-lockfile --prefer-offline
missing=0
for bin in apps/web/node_modules/.bin/next apps/auth/node_modules/.bin/tsx apps/api/node_modules/.bin/drizzle-kit node_modules/.bin/turbo; do
  if [ ! -e "$bin" ]; then echo "Binario ausente apos o install: $bin" >&2; missing=1; fi
done
[ "$missing" -eq 0 ] || { echo "node_modules incompleto; investigue o pnpm install acima." >&2; exit 1; }
echo "node_modules integros."

# --- 4. bases no Postgres compartilhado ----------------------------------------
step 4 "Bases '${DB_NAME}' e '${AUTH_DB_NAME}' no Postgres compartilhado"
PG_CONTAINER="$(shared_pg_container)"
if [ -z "$PG_CONTAINER" ]; then
  echo "Postgres compartilhado (porta ${SHARED_PG_PORT}) parado; subindo o da worktree principal..."
  docker compose --project-name infra -f "$MAIN_ROOT/infra/docker-compose.local.yml" up -d postgres
  for _ in $(seq 1 30); do PG_CONTAINER="$(shared_pg_container)"; [ -n "$PG_CONTAINER" ] && break; sleep 1; done
  [ -n "$PG_CONTAINER" ] || { echo "Nao consegui subir o Postgres compartilhado." >&2; exit 1; }
fi
psql_admin() { docker exec -i "$PG_CONTAINER" psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$@"; }
for _ in $(seq 1 30); do psql_admin -d postgres -tAc 'SELECT 1' >/dev/null 2>&1 && break; sleep 1; done
for db in "$DB_NAME" "$AUTH_DB_NAME"; do
  if [ "$(psql_admin -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${db}'")" = "1" ]; then
    echo "Base '$db' ja existe em $PG_CONTAINER."
  else
    psql_admin -d postgres -c "CREATE DATABASE \"${db}\""
    echo "Base '$db' criada em $PG_CONTAINER."
  fi
done

# --- 5. fila no RabbitMQ -------------------------------------------------------
step 5 "Fila '${QUEUE}' no RabbitMQ compartilhado"
bash "$SCRIPT_DIR/rabbitmq.sh" up
bash "$SCRIPT_DIR/rabbitmq.sh" queue "$SLUG" health
for kind in agent-turn transcript-event meal-note; do
  bash "$SCRIPT_DIR/rabbitmq.sh" queue "$SLUG" "$kind"
done
# Credentials remain outside the checkout; start-dev inherits the AMQP URL.
RABBIT_CRED_FILE="${BRAID_RABBITMQ_ENV:-$HOME/.config/braid/rabbitmq.env}"
export RABBITMQ_URL
RABBITMQ_URL="$(RABBIT_USER="$(read_env_var "$RABBIT_CRED_FILE" RABBITMQ_DEFAULT_USER)" \
  RABBIT_PASS="$(read_env_var "$RABBIT_CRED_FILE" RABBITMQ_DEFAULT_PASS)" \
  RABBIT_PORT="$(read_env_var "$RABBIT_CRED_FILE" RABBITMQ_HOST_PORT)" \
  node -e 'process.stdout.write(`amqp://${encodeURIComponent(process.env.RABBIT_USER)}:${encodeURIComponent(process.env.RABBIT_PASS)}@127.0.0.1:${process.env.RABBIT_PORT}`)')"
export AI_JOBS_QUEUE_PREFIX="$SLUG"

# --- 6. migrations -------------------------------------------------------------
step 6 "Migrations (API e Auth)"
pnpm db:migrate
pnpm --filter @repo/auth run db:migrate

# --- 7. admin ------------------------------------------------------------------
step 7 "Usuario admin ${ADMIN_EMAIL}"
pnpm --filter @repo/auth run create-admin

# --- 8. build, sonda e servidores ----------------------------------------------
step 8 "Build, sonda de saude e servidores de dev"
# web (next build de producao) e mobile (Android SDK) nao sao necessarios para o pnpm dev.
pnpm turbo run build --filter='!@repo/mobile' --filter='!@repo/web'

count_tables() { psql_admin -d "$1" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"; }
API_TABLES="$(count_tables "$DB_NAME")"
AUTH_TABLES="$(count_tables "$AUTH_DB_NAME")"
ADMIN_ROWS="$(psql_admin -d "$AUTH_DB_NAME" -tAc "SELECT count(*) FROM users WHERE email='${ADMIN_EMAIL}'")"
if [ "$API_TABLES" -lt 1 ] || [ "$AUTH_TABLES" -lt 1 ] || [ "$ADMIN_ROWS" -ne 1 ]; then
  echo "Sonda falhou: tabelas api=$API_TABLES auth=$AUTH_TABLES admin=$ADMIN_ROWS." >&2
  exit 1
fi
PAYLOAD="$(node -e 'console.log(JSON.stringify({worktree:process.argv[1],status:"ok",checkedAt:new Date().toISOString(),databases:{[process.argv[2]]:{tables:+process.argv[4]},[process.argv[3]]:{tables:+process.argv[5]}}}))' \
  "$SLUG" "$DB_NAME" "$AUTH_DB_NAME" "$API_TABLES" "$AUTH_TABLES")"
bash "$SCRIPT_DIR/rabbitmq.sh" publish "$SLUG" "$PAYLOAD"
bash "$SCRIPT_DIR/rabbitmq.sh" peek "$SLUG" | grep -q '"status\\":\\"ok' \
  || { echo "A mensagem de saude nao foi lida de volta de '${QUEUE}'." >&2; exit 1; }
echo "Fila ${QUEUE} confirma: bases ok (api=${API_TABLES} tabelas, auth=${AUTH_TABLES} tabelas)."

bash "$SCRIPT_DIR/start-dev.sh"

# --- 9. verificacao final e link -------------------------------------------------
step 9 "Verificacao no navegador (via Caddy)"
LOGIN_CODE="$(node -e 'process.stdout.write(JSON.stringify({email:process.argv[1],password:process.env.ADMIN_PASSWORD}))' "$ADMIN_EMAIL" \
  | curl -sS -o /dev/null -w '%{http_code}' --max-time 30 --resolve "${HOST}:${CADDY_PORT}:127.0.0.1" \
      -H 'content-type: application/json' -d @- "${APP_URL}/api/session/login")"
if [ "$LOGIN_CODE" != "200" ]; then
  echo "Login de ${ADMIN_EMAIL} em ${APP_URL} devolveu HTTP ${LOGIN_CODE} (esperado 200)." >&2
  exit 1
fi
echo "Login de ${ADMIN_EMAIL} em ${APP_URL}: HTTP 200."

cat <<SUMMARY

Worktree '$SLUG' pronta e rodando.
  mudar de pasta: cd $(pwd)   (rode os proximos comandos de dentro da worktree)
  link:      ${APP_URL}
  login:     ${ADMIN_EMAIL} (senha: ADMIN_PASSWORD do 1Password)
  web/api/auth: ${WEB_PORT} / ${API_PORT} / ${AUTH_PORT}
  bases:     ${DB_NAME}, ${AUTH_DB_NAME} (${PG_CONTAINER}, porta ${SHARED_PG_PORT})
  fila:      ${QUEUE}
  logs:      $(pwd)/.agents/runtime/dev.log
SUMMARY
