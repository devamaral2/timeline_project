#!/usr/bin/env bash
# Cria uma worktree nova e a deixa rodando no navegador: pnpm install,
# portas livres, alias <slug>.braid.local (Caddy + /etc/hosts), bases proprias
# no Postgres compartilhado, fila <slug>.health no RabbitMQ, migrations, admin
# e servidores de dev. Os passos estao em provision-env.sh; nenhum e opcional.
#
# Uso: bash scripts/worktree/setup.sh <caminho> [args do git worktree add...]
# Ex.:  bash scripts/worktree/setup.sh .worktrees/minha-feature -b minha-feature
# (de preferencia via `pnpm worktree:new`, que injeta o ambiente do 1Password)
#
# Ao terminar, mude para a pasta da worktree (`cd <caminho absoluto>`): o script
# roda num subshell e nao consegue alterar o diretorio de quem o chamou, entao
# o resumo final imprime o `cd` pronto. Dai em diante, rode tudo da worktree.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

if [ "$#" -lt 1 ]; then
  echo "Uso: $0 <caminho> [args do git worktree add...]" >&2
  echo "Ex.:  $0 .worktrees/minha-feature -b minha-feature" >&2
  exit 1
fi

REPO_ROOT="$(worktree_root)"
cd "$REPO_ROOT"

# Falha antes de criar qualquer coisa se um pre-requisito nao esta pronto.
command -v docker >/dev/null || { echo "docker nao encontrado." >&2; exit 1; }
bash "$SCRIPT_DIR/hosts.sh" ready

WORKTREE_PATH="$1"
shift
echo "[0/9] Criando a worktree (git worktree add)"
git worktree add "$WORKTREE_PATH" "$@"

cd "$WORKTREE_PATH"
# O carregador do 1Password (usado por `pnpm worktree:provision`) vive no
# node_modules, entao o install vem antes do provisionamento.
echo "Instalando dependencias (pnpm install)..."
pnpm install --frozen-lockfile --prefer-offline

# Usa o comando da propria worktree nova, que injeta o ambiente do 1Password e
# mantém apenas os overrides locais não secretos no .env.local.
pnpm worktree:provision
