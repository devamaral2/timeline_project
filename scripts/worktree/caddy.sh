#!/usr/bin/env bash
# Mantem o Caddyfile da worktree PRINCIPAL com um dominio por servico de cada
# worktree (<nome>.braid.local e web/api/auth.<nome>.localhost -> portas do
# .env.local de cada uma).
# Sempre escreve na raiz da principal, mesmo quando chamado de uma secundaria.
#
# O alias <nome>.braid.local sai em HTTPS (CADDY_HTTPS_PORT, 8443) com a CA local
# do Caddy, e tambem em HTTP (CADDY_PORT, 8080). Os *.localhost ficam so em HTTP:
# o navegador ja os trata como origem segura.
#
# Uso: bash scripts/worktree/caddy.sh sync     # regenera e recarrega o Caddy
#      bash scripts/worktree/caddy.sh status   # mostra quais portas respondem
#      bash scripts/worktree/caddy.sh trust    # confia na CA local (uma vez por maquina)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=./lib.sh
source "$SCRIPT_DIR/lib.sh"

CADDY_PORT="${CADDY_PORT:-8080}"
CADDY_HTTPS_PORT="${CADDY_HTTPS_PORT:-8443}"
MAIN_ROOT="$(main_worktree_root)"
TEMPLATE="$MAIN_ROOT/Caddyfile.tmpl"
OUTPUT="$MAIN_ROOT/Caddyfile"

# Imprime uma linha por worktree: slug|caminho|web|api|auth|estado
# `estado` e "principal", "provisionada" ou "nao-provisionada".
list_worktrees() {
  local path slug base n env web api auth state
  local -A seen=()
  while read -r path; do
    [ -d "$path" ] || continue
    if [ "$path" = "$MAIN_ROOT" ]; then
      base="main"
    else
      base="$(slugify "$(basename "$path")")"
    fi
    slug="$base"
    n=1
    while [ -n "${seen[$slug]:-}" ]; do
      n=$((n + 1))
      slug="${base}-${n}"
    done
    seen[$slug]=1

    env="$path/.env.local"
    web="$(read_env_var "$env" WEB_PORT)"
    if [ "$path" = "$MAIN_ROOT" ]; then
      state="principal"
      web="${web:-3000}"
      api="$(read_env_var "$env" API_PORT)"; api="${api:-3001}"
      auth="$(read_env_var "$env" AUTH_PORT)"; auth="${auth:-3002}"
    elif [ -n "$web" ]; then
      state="provisionada"
      api="$(read_env_var "$env" API_PORT)"
      auth="$(read_env_var "$env" AUTH_PORT)"
    else
      state="nao-provisionada"
      web="-"; api="-"; auth="-"
    fi
    printf '%s|%s|%s|%s|%s|%s\n' "$slug" "$path" "$web" "$api" "$auth" "$state"
  done < <(git -C "$MAIN_ROOT" worktree list --porcelain | awk '/^worktree /{sub(/^worktree /, ""); print}') \
    | flag_port_conflicts
}

# Marca com "+conflito" o estado das worktrees que repetem porta de web/api/auth
# de outra (ex.: duas worktrees com 3000), pois so uma consegue subir a app.
flag_port_conflicts() {
  awk -F'|' -v OFS='|' '
    { rows[NR] = $0; for (i = 3; i <= 5; i++) if ($i != "-") count[$i]++ }
    END {
      for (r = 1; r <= NR; r++) {
        split(rows[r], f, "|")
        dup = 0
        for (i = 3; i <= 5; i++) if (f[i] != "-" && count[f[i]] > 1) dup = 1
        if (dup) f[6] = f[6] "+conflito"
        print f[1], f[2], f[3], f[4], f[5], f[6]
      }
    }'
}

render_table() {
  local slug path web api auth state
  printf '# %-24s %-6s %-6s %-6s %s\n' worktree web api auth estado
  while IFS='|' read -r slug path web api auth state; do
    printf '# %-24s %-6s %-6s %-6s %s\n' "$slug" "$web" "$api" "$auth" "$state"
  done <<<"$1"
  printf '#\n'
}

render_sites() {
  local slug path web api auth state svc port
  while IFS='|' read -r slug path web api auth state; do
    if [ "$state" = "nao-provisionada" ]; then
      printf '# %s: nao provisionada (rode `pnpm worktree:provision` nela)\n\n' "$slug"
      continue
    fi
    printf '# %s (%s)\n' "$slug" "$path"
    # Alias curto do app: <slug>.braid.local (resolvido via /etc/hosts por hosts.sh).
    printf 'https://%s.braid.local:%s {\n\ttls internal\n\treverse_proxy 127.0.0.1:%s\n}\n' "$slug" "$CADDY_HTTPS_PORT" "$web"
    printf 'http://%s.braid.local:%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' "$slug" "$CADDY_PORT" "$web"
    for svc in web api auth; do
      case "$svc" in web) port="$web" ;; api) port="$api" ;; auth) port="$auth" ;; esac
      printf 'http://%s.%s.localhost:%s {\n\treverse_proxy 127.0.0.1:%s\n}\n' "$svc" "$slug" "$CADDY_PORT" "$port"
    done
    printf '\n'
  done <<<"$1"
}

cmd_sync() {
  [ -f "$TEMPLATE" ] || { echo "Template nao encontrado: $TEMPLATE" >&2; exit 1; }
  local rows table sites tmp
  rows="$(list_worktrees)"
  table="$(render_table "$rows")"
  sites="$(render_sites "$rows")"

  tmp="$(mktemp)"
  trap 'rm -f "$tmp"' EXIT
  awk -v table="$table" -v sites="$sites" '
    $0 == "@@TABLE@@" { print table; next }
    $0 == "@@SITES@@" { print sites; next }
    { print }
  ' "$TEMPLATE" >"$tmp"

  if command -v caddy >/dev/null 2>&1; then
    caddy validate --config "$tmp" --adapter caddyfile >/dev/null 2>&1 \
      || { echo "Caddyfile gerado e invalido; mantive o anterior." >&2; caddy validate --config "$tmp" --adapter caddyfile >&2 || true; exit 1; }
  fi
  mv "$tmp" "$OUTPUT"
  trap - EXIT
  echo "Caddyfile atualizado: $OUTPUT"

  if ! command -v caddy >/dev/null 2>&1; then
    echo "Aviso: caddy nao esta instalado; so gerei o arquivo." >&2
  elif curl -fsS -o /dev/null --max-time 2 http://localhost:2019/config/; then
    caddy reload --config "$OUTPUT" --adapter caddyfile >/dev/null 2>&1 \
      && echo "Caddy recarregado." \
      || echo "Aviso: falha ao recarregar o Caddy." >&2
  else
    echo "Aviso: Caddy nao esta rodando (admin :2019); suba com 'systemctl --user start timeline-caddy'." >&2
  fi
}

port_state() {
  [ "$1" = "-" ] && { printf '%s' "-"; return; }
  if timeout 1 bash -c "exec 3<>/dev/tcp/127.0.0.1/$1" 2>/dev/null; then
    printf '%s' "$1 up"
  else
    printf '%s' "$1 down"
  fi
}

cmd_status() {
  local slug path web api auth state
  printf '%-22s %-12s %-12s %-12s %s\n' worktree web api auth url
  while IFS='|' read -r slug path web api auth state; do
    printf '%-22s %-12s %-12s %-12s %s\n' "$slug" \
      "$(port_state "$web")" "$(port_state "$api")" "$(port_state "$auth")" \
      "$([ "$state" = "nao-provisionada" ] && echo "(nao provisionada)" || echo "https://${slug}.braid.local:${CADDY_HTTPS_PORT}")"
  done <<<"$(list_worktrees)"
  ca_trusted || printf '\nA CA local do Caddy ainda nao e confiavel nesta maquina: rode `pnpm caddy:trust`.\n'
}

# O sistema confia na CA local? Sem isso o navegador mostra aviso de certificado no <nome>.braid.local.
ca_trusted() {
  local root
  root="$(caddy_root_cert)"
  [ -f "$root" ] && command -v openssl >/dev/null 2>&1 && openssl verify "$root" >/dev/null 2>&1
}

# Instala a CA local do Caddy no sistema e nos navegadores (pede sudo). Uma vez por maquina.
cmd_trust() {
  command -v caddy >/dev/null 2>&1 || { echo "caddy nao esta instalado." >&2; exit 1; }
  curl -fsS -o /dev/null --max-time 2 http://localhost:2019/config/ \
    || { echo "Caddy nao esta rodando (admin :2019); suba com 'systemctl --user start timeline-caddy'." >&2; exit 1; }
  caddy trust --address localhost:2019
  echo "CA local instalada. Reinicie o navegador para ele passar a confiar em https://<nome>.braid.local:${CADDY_HTTPS_PORT}."
}

case "${1:-}" in
  sync) cmd_sync ;;
  status) cmd_status ;;
  trust) cmd_trust ;;
  *) echo "Uso: $0 sync|status|trust" >&2; exit 1 ;;
esac
