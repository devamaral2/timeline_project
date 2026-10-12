#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$ROOT_DIR"

env_file="${BRAID_ENV_FILE:-.env.local}"
if [ ! -f "$env_file" ] && [ -f .env ]; then
  env_file=.env
fi

read_env() {
  local key="$1" fallback="$2"
  if [ -f "$env_file" ]; then
    local value
    value="$(grep -m1 -E "^${key}=" "$env_file" | sed -E "s/^${key}=//" || true)"
    if [ -n "$value" ]; then
      printf '%s\n' "$value"
      return
    fi
  fi
  printf '%s\n' "$fallback"
}

API_PORT="$(read_env API_PORT 3001)"
AUTH_PORT="$(read_env AUTH_PORT 3002)"

command -v adb >/dev/null 2>&1 || {
  echo "adb não foi encontrado no PATH; instale o Android SDK Platform-Tools." >&2
  exit 1
}

adb reverse "tcp:${API_PORT}" "tcp:${API_PORT}"
adb reverse "tcp:${AUTH_PORT}" "tcp:${AUTH_PORT}"

pnpm --filter @repo/mobile run android
