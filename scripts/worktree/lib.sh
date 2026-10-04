# Helpers compartilhados pelos scripts de worktree. Precisa ser "sourced",
# não executado diretamente.

# Raiz do checkout git atual (a worktree onde o script foi chamado).
worktree_root() {
  git rev-parse --show-toplevel
}

# Caminho da worktree principal do repo (a primeira listada por
# `git worktree list`, que é sempre o checkout original, não um worktree
# secundário criado com `git worktree add`).
main_worktree_root() {
  git worktree list --porcelain | awk '/^worktree /{print $2; exit}'
}

# Slug minúsculo/hífen a partir do nome do diretório da worktree atual.
# Usado para nomear o projeto do Docker Compose e as bases do Postgres.
worktree_slug() {
  slugify "$(basename "$(worktree_root)")"
}

# Slug minúsculo/hífen de um nome qualquer (ex.: nome de diretório).
slugify() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/-\+/-/g; s/^-//; s/-$//'
}

# Primeira porta livre em 127.0.0.1 a partir de $1.
find_free_port() {
  node "$(dirname "${BASH_SOURCE[0]}")/find-free-port.mjs" "$1"
}

# Lê uma variável de um arquivo de env no formato KEY=value (sem exportar).
read_env_var() {
  local file="$1" key="$2"
  [ -f "$file" ] || return 0
  { grep -m1 -E "^${key}=" "$file" || true; } | sed -E "s/^${key}=//"
}

# Porta e container do Postgres compartilhado (o da worktree principal, que
# todas as outras worktrees reaproveitam com bases proprias).
SHARED_PG_PORT="${SHARED_PG_PORT:-54391}"

# Nome do container Docker que publica a porta do Postgres compartilhado.
shared_pg_container() {
  docker ps --filter "publish=${SHARED_PG_PORT}" --format '{{.Names}}' | head -n1
}

# Nome de base Postgres para um slug de worktree (hifen vira underscore, para
# nao exigir aspas em nenhuma ferramenta que monte SQL/URL).
db_name_for_slug() {
  printf '%s' "$1" | tr '-' '_'
}

# Slugs de todas as worktrees, na mesma regra do caddy.sh: "main" para a
# principal, nome do diretorio slugificado (e sufixo -N se repetir) para as demais.
worktree_slugs() {
  local main path base slug n
  local -A seen=()
  main="$(main_worktree_root)"
  while read -r path; do
    [ -d "$path" ] || continue
    if [ "$path" = "$main" ]; then base="main"; else base="$(slugify "$(basename "$path")")"; fi
    slug="$base"; n=1
    while [ -n "${seen[$slug]:-}" ]; do n=$((n + 1)); slug="${base}-${n}"; done
    seen[$slug]=1
    printf '%s\n' "$slug"
  done < <(git worktree list --porcelain | awk '/^worktree /{sub(/^worktree /, ""); print}')
}

# Portas (web/api/auth) ja reservadas nos .env.local das outras worktrees,
# uma por linha — para nao reaproveitar porta de worktree que esta parada.
reserved_ports() {
  local path
  while read -r path; do
    for key in WEB_PORT API_PORT AUTH_PORT; do
      read_env_var "$path/.env.local" "$key"
    done
  done < <(git worktree list --porcelain | awk '/^worktree /{sub(/^worktree /, ""); print}')
}

# Primeira porta livre a partir de $1 que tambem nao esteja reservada por outra
# worktree (le a lista de portas reservadas de $RESERVED_PORTS, separada por espaco).
find_unreserved_port() {
  local port="$1"
  while :; do
    port="$(find_free_port "$port")"
    case " ${RESERVED_PORTS:-} " in
      *" $port "*) port=$((port + 1)) ;;
      *) printf '%s' "$port"; return ;;
    esac
  done
}
