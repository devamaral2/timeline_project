#!/usr/bin/env bash
# Provisiona (ou reaproveita) o ambiente isolado de UMA worktree. Idempotente.
#
# Passos (nenhum e opcional):
#   1. .env.local com portas livres e nomes proprios (bases, dominio)
#   2. alias <slug>.braid.local: /etc/hosts + Caddy (HTTPS na 8443, CA local do Caddy)
#   3. node_modules integros (pnpm install reaplicado + binarios conferidos)
#   4. bancos SQLite da propria worktree: .data/api.sqlite e .data/auth.sqlite
#      (ADR 0024 e 0025); nenhum Postgres
#   5. build das dependencias de workspace da API e do Auth e migrations das duas
#   6. usuario admin (senha de ADMIN_PASSWORD)
#   7. build, sonda de saude (bases, tabela de jobs, admin) e servidores de dev
#   8. API respondendo, login de teste e link para abrir no navegador
#
# A fila de jobs de IA e a tabela `jobs` do banco da API (ADR 0013): nasce com as
# migrations e some com o arquivo, entao nao ha broker para subir nem fila a declarar.
#
# Uso: bash scripts/worktree/provision-env.sh   (de dentro da worktree;
#      via `pnpm worktree:provision`, que injeta o ambiente do 1Password)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

cd "$(worktree_root)"
ENV_FILE=".env.local"
CADDY_HTTPS_PORT="${CADDY_HTTPS_PORT:-8443}"
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

for var in ADMIN_PASSWORD; do
  if [ -z "${!var:-}" ]; then
    echo "$var precisa estar disponível pelo 1Password (rode via 'pnpm worktree:provision')." >&2
    exit 1
  fi
done

SLUG="$(worktree_slug)"
DB_NAME="$(db_name_for_slug "$SLUG")"
AUTH_DB_NAME="${DB_NAME}_auth"
HOST="${SLUG}.braid.local"
# HTTPS: fora de `localhost` o navegador so libera geolocalizacao e afins em origem segura.
APP_URL="https://${HOST}:${CADDY_HTTPS_PORT}"

step() { printf '\n[%s/8] %s\n' "$1" "$2"; }

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
  RESERVED_PORTS="$RESERVED_PORTS $AUTH_PORT"
  MCP_PORT="$(find_unreserved_port $((AUTH_PORT + 1)))"
  # Este arquivo guarda so configuracao local derivada. Segredos e URLs com
  # senha continuam vindo do 1Password (o carregador monta as URLs das bases).
  cat > "$ENV_FILE" <<EOT
WORKTREE_SLUG=${SLUG}
WEB_PORT=${WEB_PORT}
API_PORT=${API_PORT}
API_HOST=127.0.0.1
AUTH_PORT=${AUTH_PORT}
AUTH_HOST=127.0.0.1
MCP_PORT=${MCP_PORT}
POSTGRES_HOST_PORT=${SHARED_PG_PORT}
POSTGRES_DB=${DB_NAME}
AUTH_POSTGRES_DB=${AUTH_DB_NAME}
AUTH_WEB_APP_URL=${APP_URL}
EOT
  echo "Escrevi $ENV_FILE."
else
  echo "Reaproveitando o $ENV_FILE existente."
fi
WEB_PORT="$(read_env_var "$ENV_FILE" WEB_PORT)"
API_PORT="$(read_env_var "$ENV_FILE" API_PORT)"
AUTH_PORT="$(read_env_var "$ENV_FILE" AUTH_PORT)"
echo "web=$WEB_PORT api=$API_PORT auth=$AUTH_PORT"

# O carregador do 1Password le o .env.local ANTES deste script rodar; na
# primeira vez ele ainda nao existia e o ambiente herdado aponta para as bases
# da principal. Recarrega o ambiente (agora com o .env.local) uma unica vez.
if [ "${BRAID_ENV_RELOADED:-}" != "1" ]; then
  echo "Recarregando o ambiente com o .env.local da worktree..."
  BRAID_ENV_RELOADED=1 exec node scripts/onepassword/exec.mjs bash scripts/worktree/provision-env.sh
fi
# Trava: nunca migrar/criar admin se as URLs nao apontam para as bases desta worktree.
# O SQLite da API fica dentro da worktree; um API_DATABASE_PATH herdado apontaria para o de outra.
if [ -n "${API_DATABASE_PATH:-}" ]; then echo "API_DATABASE_PATH definido ('${API_DATABASE_PATH}'); a worktree usa o padrao .data/api.sqlite. Abortando." >&2; exit 1; fi
if [ -n "${AUTH_DATABASE_PATH:-}" ]; then echo "AUTH_DATABASE_PATH definido ('${AUTH_DATABASE_PATH}'); a worktree usa o padrao .data/auth.sqlite. Abortando." >&2; exit 1; fi

# --- 2. alias no Caddy + /etc/hosts -------------------------------------------
step 2 "Alias ${HOST} (Caddy + /etc/hosts)"
bash "$SCRIPT_DIR/hosts.sh" sync
bash "$SCRIPT_DIR/caddy.sh" sync
bash "$SCRIPT_DIR/hosts.sh" check "$SLUG"

# --- 3. node_modules ---------------------------------------------------------
step 3 "node_modules"
pnpm install --frozen-lockfile --prefer-offline
missing=0
for bin in apps/web/node_modules/.bin/next apps/auth/node_modules/.bin/tsx apps/api/node_modules/.bin/tsx node_modules/.bin/turbo; do
  if [ ! -e "$bin" ]; then echo "Binario ausente apos o install: $bin" >&2; missing=1; fi
done
[ "$missing" -eq 0 ] || { echo "node_modules incompleto; investigue o pnpm install acima." >&2; exit 1; }
echo "node_modules integros."

# --- 4. bancos SQLite da worktree ------------------------------------------------
step 4 "Bancos SQLite em .data/ (API e Auth)"
mkdir -p .data
echo "API em .data/api.sqlite e Auth em .data/auth.sqlite; as migrations do passo 5 criam os arquivos."

# --- 5. migrations -------------------------------------------------------------
step 5 "Migrations (API e Auth)"
# As migrations importam os pacotes de workspace pelo dist/, que nao existe numa
# worktree nova. O `^...` compila so as dependencias, na ordem certa, sem os apps.
pnpm turbo run build --filter='@repo/api^...' --filter='@repo/auth^...'
pnpm db:migrate
pnpm --filter @repo/auth run db:migrate

# --- 6. admin ------------------------------------------------------------------
step 6 "Usuario admin ${ADMIN_EMAIL}"
pnpm --filter @repo/auth run create-admin

# --- 7. build, sonda e servidores ----------------------------------------------
step 7 "Build, sonda de saude e servidores de dev"
# web (next build de producao) e mobile (Android SDK) nao sao necessarios para o pnpm dev.
pnpm turbo run build --filter='!@repo/mobile' --filter='!@repo/web'

# Os bancos SQLite, lidos pelo `node:sqlite` (o CLI `sqlite3` nao e pre-requisito).
sqlite_value() {
  node -e 'const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
    const db = new DatabaseSync(process.argv[1], { readOnly: true });
    const row = db.prepare(process.argv[2]).get(...process.argv.slice(3));
    console.log(Object.values(row)[0]);' "$@"
}
API_TABLES="$(sqlite_value .data/api.sqlite "SELECT count(*) FROM sqlite_schema WHERE type = 'table'")"
AUTH_TABLES="$(sqlite_value .data/auth.sqlite "SELECT count(*) FROM sqlite_schema WHERE type = 'table'")"
ADMIN_ROWS="$(sqlite_value .data/auth.sqlite "SELECT count(*) FROM users WHERE email = ?" "$ADMIN_EMAIL")"
# A fila de jobs de IA e uma tabela do banco da API; sem ela os workers nao tem o que ler.
JOBS_TABLE="$(sqlite_value .data/api.sqlite "SELECT count(*) FROM sqlite_schema WHERE type = 'table' AND name = 'jobs'")"
if [ "$API_TABLES" -lt 1 ] || [ "$AUTH_TABLES" -lt 1 ] || [ "$ADMIN_ROWS" -ne 1 ] || [ "$JOBS_TABLE" -ne 1 ]; then
  echo "Sonda falhou: tabelas api=$API_TABLES auth=$AUTH_TABLES admin=$ADMIN_ROWS jobs=$JOBS_TABLE." >&2
  exit 1
fi
echo "Sonda ok: bases prontas (api=${API_TABLES} tabelas, auth=${AUTH_TABLES} tabelas), tabela de jobs e admin presentes."

bash "$SCRIPT_DIR/start-dev.sh"

# --- 8. verificacao final e link -------------------------------------------------
step 8 "Verificacao final: API, login (via Caddy) e link"
# start-dev so confere a porta aberta; aqui a API precisa responder HTTP de fato
# (sem sessao ela devolve 401, o que ja prova que subiu e validou o ambiente).
API_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://127.0.0.1:${API_PORT}/api/tasks" || true)"
case "$API_CODE" in
  000|5??) echo "API em 127.0.0.1:${API_PORT} devolveu HTTP ${API_CODE}. Veja .agents/runtime/dev.log." >&2; exit 1 ;;
esac
echo "API em 127.0.0.1:${API_PORT}: HTTP ${API_CODE}."
LOGIN_CODE="$(node -e 'process.stdout.write(JSON.stringify({email:process.argv[1],password:process.env.ADMIN_PASSWORD}))' "$ADMIN_EMAIL" \
  | curl -sS -o /dev/null -w '%{http_code}' --max-time 30 --resolve "${HOST}:${CADDY_HTTPS_PORT}:127.0.0.1" \
      --cacert "$(caddy_root_cert)" \
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
             (aviso de certificado no navegador? rode uma vez: pnpm caddy:trust)
  login:     ${ADMIN_EMAIL} (senha: ADMIN_PASSWORD do 1Password)
  web/api/auth: ${WEB_PORT} / ${API_PORT} / ${AUTH_PORT}
  bancos:    .data/api.sqlite e .data/auth.sqlite (SQLite)
  logs:      $(pwd)/.agents/runtime/dev.log
SUMMARY
