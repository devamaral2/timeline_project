#!/usr/bin/env bash
# Mantem <slug>.braid.local -> 127.0.0.1 no /etc/hosts para todas as worktrees
# (main.braid.local, refactory-events.braid.local, ...), via o helper root
# instalado por hosts-install.sh. Os dominios chegam ao Caddy (porta 8080).
#
# Uso: hosts.sh sync           # reescreve o bloco com as worktrees atuais
#      hosts.sh ready          # confirma que o helper root esta instalado
#      hosts.sh check <slug>   # confirma que <slug>.braid.local resolve
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

HELPER="/usr/local/sbin/braid-hosts"

# Sai com 0 se o helper root esta instalado e liberado no sudoers (sem senha).
cmd_ready() {
  if [ -x "$HELPER" ] && sudo -n -l "$HELPER" >/dev/null 2>&1; then return 0; fi
  echo "Helper do /etc/hosts nao instalado. Instalacao unica (pede sudo):" >&2
  echo "  sudo bash $SCRIPT_DIR/hosts-install.sh" >&2
  exit 1
}

cmd_sync() {
  mapfile -t slugs < <(worktree_slugs)
  if [ ! -x "$HELPER" ] || ! sudo -n "$HELPER" sync "${slugs[@]}" 2>/dev/null; then
    cat >&2 <<MSG
Nao consegui atualizar o /etc/hosts sem senha. Instalacao unica (pede sudo):
  sudo bash $SCRIPT_DIR/hosts-install.sh
Depois rode de novo: bash $SCRIPT_DIR/hosts.sh sync
MSG
    exit 1
  fi
  echo "/etc/hosts atualizado: ${slugs[*]/%/.braid.local}"
}

cmd_check() {
  local host="$1.braid.local" ip
  ip="$(getent hosts "$host" | awk '{print $1; exit}')"
  if [ "$ip" = "127.0.0.1" ]; then
    echo "$host resolve para $ip."
  else
    echo "$host NAO resolve para 127.0.0.1 (getent: '${ip:-vazio}')." >&2
    exit 1
  fi
}

case "${1:-}" in
  ready) cmd_ready ;;
  sync) cmd_sync ;;
  check) cmd_check "${2:?slug}" ;;
  *) echo "Uso: $0 ready|sync|check <slug>" >&2; exit 1 ;;
esac
