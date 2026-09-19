#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 check|apply|remove [agent-root]" >&2
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CANONICAL_ROOT="${IA_CANONICAL_ROOT:-$ROOT/.ia}"
COMMAND="${1:-}"
AGENT_ROOT="${2:-${IA_AGENT_ROOT:-$ROOT/.ia/local/agent}}"
LINK_ROOT="$AGENT_ROOT/ia"

check() {
  [[ -f "$CANONICAL_ROOT/manifest.yaml" ]] || { echo "missing manifest: $CANONICAL_ROOT/manifest.yaml" >&2; return 1; }
  [[ -d "$CANONICAL_ROOT/skills" ]] || { echo "missing skills directory" >&2; return 1; }
  [[ -d "$CANONICAL_ROOT/hooks" ]] || { echo "missing hooks directory" >&2; return 1; }
  [[ -d "$CANONICAL_ROOT/mcp" ]] || { echo "missing mcp directory" >&2; return 1; }
  [[ -d "$CANONICAL_ROOT/plugins" ]] || { echo "missing plugins directory" >&2; return 1; }
  echo "canonical source ok: $CANONICAL_ROOT"
  echo "adapter target: $LINK_ROOT"
}

apply_adapter() {
  check
  mkdir -p "$AGENT_ROOT"
  if [[ -e "$LINK_ROOT" && ! -L "$LINK_ROOT" ]]; then
    echo "refusing to replace existing non-symlink: $LINK_ROOT" >&2
    return 1
  fi
  ln -sfn "$CANONICAL_ROOT" "$LINK_ROOT"
  echo "adapter installed: $LINK_ROOT -> $CANONICAL_ROOT"
}

remove_adapter() {
  if [[ -L "$LINK_ROOT" ]]; then
    rm "$LINK_ROOT"
    echo "adapter removed: $LINK_ROOT"
  elif [[ -e "$LINK_ROOT" ]]; then
    echo "refusing to remove non-symlink: $LINK_ROOT" >&2
    return 1
  else
    echo "adapter not installed: $LINK_ROOT"
  fi
}

case "$COMMAND" in
  check) check ;;
  apply) apply_adapter ;;
  remove) remove_adapter ;;
  *) usage; exit 64 ;;
esac
