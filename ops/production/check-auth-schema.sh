#!/usr/bin/env bash
set -euo pipefail

ROOT=${1:-.}
cd "$ROOT"
CODE_VERSION=$(sed -nE 's/^export const AUTH_SCHEMA_VERSION = ([0-9]+);/\1/p' apps/auth/src/db/readiness.ts)
SQL_VERSION=$(sed -nE 's/.*SET version *= *([0-9]+).*/\1/p' apps/auth/drizzle/[0-9]*.sql | sort -n | tail -1)
printf 'Auth: código espera %s; migrations deixam %s\n' "$CODE_VERSION" "$SQL_VERSION"
if [[ -z "$CODE_VERSION" || -z "$SQL_VERSION" || "$CODE_VERSION" != "$SQL_VERSION" ]]; then
  echo "PARE: schema e código do auth incompatíveis. Corrija no repositório antes de migrar." >&2
  exit 1
fi
