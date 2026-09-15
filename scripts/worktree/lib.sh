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
  basename "$(worktree_root)" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/-\+/-/g; s/^-//; s/-$//'
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
