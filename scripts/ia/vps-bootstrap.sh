#!/usr/bin/env bash
set -euo pipefail

# Run on a fresh Ubuntu development host as a user with sudo. It is deliberately
# explicit about the packages and never accepts secrets as command arguments.
IA_DEV_USER="${IA_DEV_USER:-$USER}"
IA_REPO_DIR="${IA_REPO_DIR:-$HOME/src/timeline_project}"
IA_REPO_URL="${IA_REPO_URL:-https://github.com/devamaral2/timeline_project.git}"

if [[ "$EUID" -eq 0 ]]; then
  echo "Run this bootstrap as the development user, not root." >&2
  exit 1
fi

sudo -v

sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
  ca-certificates curl git jq openssh-client build-essential

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

corepack enable
corepack prepare pnpm@latest --activate

mkdir -p "$(dirname "$IA_REPO_DIR")"
if [[ -d "$IA_REPO_DIR/.git" ]]; then
  git -C "$IA_REPO_DIR" fetch --prune
else
  git clone "$IA_REPO_URL" "$IA_REPO_DIR"
fi

git -C "$IA_REPO_DIR" pull --ff-only
cd "$IA_REPO_DIR"
pnpm install --frozen-lockfile
scripts/ia/adapter.sh check

echo "Bootstrap complete for $IA_DEV_USER at $IA_REPO_DIR"
echo "Next: configure secrets outside Git, then follow docs/runbooks/ia-vps-bootstrap.md."
