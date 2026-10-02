#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)"

port_from_local_env() {
  local key="$1" default="$2" value=""
  if [[ -f "$ROOT/.env.local" ]]; then
    value="$(awk -F= -v key="$key" '$1 == key { sub(/^[^=]*=/, ""); print; exit }' "$ROOT/.env.local")"
  fi
  printf '%s' "${value:-$default}"
}

ports=(
  "$(port_from_local_env WEB_PORT 3000)"
  "$(port_from_local_env API_PORT 3001)"
  "$(port_from_local_env AUTH_PORT 3002)"
)

for port in "${ports[@]}"; do
  if [[ ! "$port" =~ ^[0-9]+$ ]]; then
    echo "Porta inválida em .env.local: $port" >&2
    exit 1
  fi
done

declare -A targets=()

for port in "${ports[@]}"; do
  while IFS= read -r pid; do
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    if [[ "$cwd" == "$ROOT" || "$cwd" == "$ROOT/"* ]]; then
      targets["$pid"]="porta $port"
    else
      echo "Porta $port pertence a um processo fora desta worktree; ignorando."
    fi
  done < <(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)
done

# Encerra tambem o wrapper do `pnpm dev`, que repassa o sinal ao Turbo e aos
# processos filhos. A verificacao do diretório impede atingir outra worktree.
while IFS= read -r pid; do
  [[ "$pid" =~ ^[0-9]+$ ]] || continue
  args="$(ps -p "$pid" -o args= 2>/dev/null || true)"
  [[ "$args" == *"scripts/onepassword/exec.mjs"* && "$args" == *"turbo run dev"* ]] || continue
  cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
  if [[ "$cwd" == "$ROOT" ]]; then
    targets["$pid"]="pnpm dev"
  fi
done < <(ps -eo pid=)

if [[ ${#targets[@]} -eq 0 ]]; then
  echo "Nenhum servidor desta worktree está rodando nas portas ${ports[*]}."
  exit 0
fi

for pid in "${!targets[@]}"; do
  if kill -TERM "$pid" 2>/dev/null; then
    echo "Encerrando ${targets[$pid]} (PID $pid)."
  fi
done

for _ in {1..20}; do
  remaining=0
  for port in "${ports[@]}"; do
    if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      remaining=1
      break
    fi
  done
  [[ "$remaining" -eq 0 ]] && break
  sleep 0.25
done

for port in "${ports[@]}"; do
  if lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "Ainda há um processo escutando na porta $port." >&2
    exit 1
  fi
done

echo "Web, API e Auth encerrados. O Postgres continua rodando."
