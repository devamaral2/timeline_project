#!/usr/bin/env bash
# Copia as skills versionadas em ops/hermes/skills para o volume do Hermes
# (/opt/data/skills). Chamado pelo deploy-release.sh a cada deploy.
#
# - Cada pasta que tem um SKILL.md e uma skill; o caminho relativo e mantido
#   (ex.: productivity/personal-tasks-and-timeline).
# - A skill do repositorio substitui a pasta inteira de mesmo caminho no volume:
#   uma edicao feita pelo Hermes nessa skill se perde no deploy seguinte.
# - Skills que so existem no volume (embutidas do Hermes ou criadas por ele) nao
#   sao tocadas. Uma skill apagada do repositorio continua no volume.
set -euo pipefail

ROOT=${1:?uso: sync-hermes-skills.sh <raiz-do-repositorio>}
SRC="$ROOT/ops/hermes/skills"
DEST=${HERMES_SKILLS_DIR:-/opt/data/skills}

if ! kubectl -n braid get deployment hermes >/dev/null 2>&1; then
  echo "Skills do Hermes: deployment hermes não existe, nada copiado"
  exit 0
fi

SKILLS=()
if [[ -d "$SRC" ]]; then
  mapfile -t SKILLS < <(cd "$SRC" && find . -name SKILL.md -printf '%h\n' | sed 's|^\./||' | sort)
fi
if [[ ${#SKILLS[@]} -eq 0 ]]; then
  echo "Skills do Hermes: nenhuma em ops/hermes/skills"
  exit 0
fi

kubectl -n braid rollout status deployment/hermes --timeout=180s

# Como usuario hermes: arquivos de root no volume o gateway nao consegue editar.
# shellcheck disable=SC2016
tar -C "$SRC" -cf - "${SKILLS[@]}" | kubectl -n braid exec -i deploy/hermes -- \
  env HOME=/opt/data /command/s6-setuidgid hermes sh -c '
    set -eu
    dest=$1; shift
    mkdir -p "$dest"
    tmp=$(mktemp -d "$dest/.braid-sync.XXXXXX")
    trap "rm -rf \"$tmp\"" EXIT
    tar -xf - -C "$tmp" --no-same-owner
    for skill in "$@"; do
      mkdir -p "$dest/$(dirname "$skill")"
      rm -rf "${dest:?}/$skill"
      mv "$tmp/$skill" "$dest/$skill"
    done
  ' sh "$DEST" "${SKILLS[@]}"

printf 'Skills do Hermes atualizadas: %s\n' "${SKILLS[*]}"
