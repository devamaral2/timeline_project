#!/usr/bin/env bash
# Instalacao UNICA (precisa de root): instala o helper que atualiza o bloco
# <slug>.braid.local do /etc/hosts e uma regra de sudoers que permite SO esse
# helper, sem senha, ao usuario atual. Depois disso `pnpm worktree:new` cria
# o dominio sozinho.
#
# Uso: sudo bash scripts/worktree/hosts-install.sh
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Rode com sudo: sudo bash $0" >&2; exit 1; }
TARGET_USER="${SUDO_USER:?rode via sudo, nao como root direto}"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/braid-hosts"

install -o root -g root -m 755 "$SRC" /usr/local/sbin/braid-hosts

RULE="/etc/sudoers.d/braid-hosts"
tmp="$(mktemp)"
printf '%s ALL=(root) NOPASSWD: /usr/local/sbin/braid-hosts\n' "$TARGET_USER" > "$tmp"
visudo -cf "$tmp" >/dev/null
install -o root -g root -m 440 "$tmp" "$RULE"
rm -f "$tmp"

echo "Instalado: /usr/local/sbin/braid-hosts e $RULE (usuario: $TARGET_USER)."
