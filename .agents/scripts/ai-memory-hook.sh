#!/usr/bin/env bash
set -euo pipefail

# Contract wrapper for Codex/other agent hooks. Fail-open is intentional: memory
# improves continuity but must not block coding when its service is unavailable.
EVENT="${1:-}"
AI_MEMORY_BIN="${AI_MEMORY_BIN:-ai-memory}"
AI_MEMORY_DATA_DIR="${AI_MEMORY_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/ai-memory}"
AI_MEMORY_SERVER_URL="${AI_MEMORY_SERVER_URL:-http://127.0.0.1:49374}"

if [[ -z "$EVENT" ]]; then
  echo "usage: $0 <session-start|user-prompt-submit|pre-tool-use|post-tool-use|pre-compact|stop|session-end>" >&2
  exit 64
fi

if ! command -v "$AI_MEMORY_BIN" >/dev/null 2>&1; then
  echo "ai-memory unavailable; skipped event $EVENT" >&2
  exit 0
fi

if ! "$AI_MEMORY_BIN" --data-dir "$AI_MEMORY_DATA_DIR" hook \
  --event "$EVENT" --agent "${AI_AGENT_NAME:-codex}" \
  --server-url "$AI_MEMORY_SERVER_URL"; then
  echo "ai-memory hook failed open for event $EVENT" >&2
fi
exit 0
