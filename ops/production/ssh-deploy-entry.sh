#!/usr/bin/env bash
set -euo pipefail

# Installed as a root-owned forced command for the GitHub Actions SSH key.
# OpenSSH provides the requested command here; never evaluate it as shell code.
if [[ "${SSH_ORIGINAL_COMMAND:-}" =~ ^sudo[[:space:]]-n[[:space:]]/opt/braid/bin/braid-deploy[[:space:]]([0-9a-f]{40})$ ]]; then
  exec sudo -n /opt/braid/bin/braid-deploy "${BASH_REMATCH[1]}"
fi

echo "Comando de deploy inválido" >&2
exit 2
