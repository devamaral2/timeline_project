#!/usr/bin/env bash
set -euo pipefail

SHA=${1:?usage: deploy-release.sh <commit-sha>}
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "SHA inválido" >&2; exit 2; }
source /opt/braid/env.sh
ROOT=/opt/braid/src
cd "$ROOT"
test "$(git rev-parse HEAD)" = "$SHA"
test -n "${OP_ENVIRONMENT_ID:-}" || { echo "OP_ENVIRONMENT_ID ausente" >&2; exit 1; }
test -r /opt/braid/private/onepassword-token || { echo "Token do 1Password ausente" >&2; exit 1; }

if [[ -f /opt/braid/release.env ]]; then
  cp /opt/braid/release.env /opt/braid/previous-release.env
fi
/opt/braid/bin/backup.sh
bash ops/production/check-auth-schema.sh "$ROOT"

docker build --target builder -f apps/api/Dockerfile -t "braid-api-migrate:$SHA" .
docker build --target builder -f apps/auth/Dockerfile -t "braid-auth-migrate:$SHA" .
docker build -f apps/api/Dockerfile -t "braid-api:$SHA" .
docker build -f apps/auth/Dockerfile -t "braid-auth:$SHA" .
docker build -f apps/mcp/Dockerfile -t "braid-mcp:$SHA" .
docker build --no-cache \
  --build-arg "OP_ENVIRONMENT_ID=$OP_ENVIRONMENT_ID" \
  --secret id=onepassword-token,src=/opt/braid/private/onepassword-token \
  -f apps/web/Dockerfile -t "braid-web:$SHA" .

PGHOST=$(kubectl -n braid get svc postgres -o jsonpath='{.spec.clusterIP}')
get_secret() {
  kubectl -n braid get secret postgres-env -o "jsonpath={.data.$1}" | base64 -d
}
APP_PW=$(get_secret PG_APP_PASSWORD)
OWNER_PW=$(get_secret AUTH_OWNER_PASSWORD)

export DATABASE_URL="postgres://braid:${APP_PW}@${PGHOST}:5432/braid"
docker run --rm --network host -e DATABASE_URL \
  "braid-api-migrate:$SHA" pnpm db:migrate

export AUTH_DATABASE_MIGRATION_URL="postgres://auth_owner:${OWNER_PW}@${PGHOST}:5432/braid_auth"
docker run --rm --network host -e AUTH_DATABASE_MIGRATION_URL \
  "braid-auth-migrate:$SHA" pnpm --filter @repo/auth run db:migrate

kubectl -n braid exec -i postgres-0 -- \
  psql -v ON_ERROR_STOP=1 --single-transaction -U auth_owner -d braid_auth \
  < apps/auth/ops/grant-runtime.sql

docker save "braid-api:$SHA" "braid-auth:$SHA" "braid-web:$SHA" "braid-mcp:$SHA" -o /opt/braid/images.tar
k3s ctr images import /opt/braid/images.tar
rm -f /opt/braid/images.tar
k3s ctr images list | grep -F "$SHA"

sed "s/REPLACE_SHA/$SHA/g" ops/production/apps.template.yaml > /opt/braid/k8s/apps.yaml
kubectl apply -f /opt/braid/k8s/apps.yaml
# Se um rollout nao assenta, mostra por que antes de falhar: status dos pods,
# ultimo encerramento do container e eventos. Sem `kubectl logs`: o log do
# Actions e publico e o log da aplicacao pode carregar dados sensiveis.
rollout_diagnostics() {
  local app=$1 pod
  echo "::group::Diagnostico do rollout de $app" >&2
  kubectl -n braid get pods -l "app=$app" -o wide >&2 || true
  for pod in $(kubectl -n braid get pods -l "app=$app" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
    kubectl -n braid get pod "$pod" -o jsonpath='{range .status.containerStatuses[*]}{.name}: ready={.ready} restarts={.restartCount} waiting={.state.waiting.reason} lastExit={.lastState.terminated.exitCode} lastReason={.lastState.terminated.reason}{"\n"}{end}' >&2 || true
    kubectl -n braid get events --field-selector "involvedObject.name=$pod" --sort-by=.lastTimestamp \
      -o custom-columns=TYPE:.type,REASON:.reason,MESSAGE:.message >&2 || true
  done
  echo "::endgroup::" >&2
}

for app in api auth web mcp; do
  if ! kubectl -n braid rollout status "deployment/$app" --timeout=300s; then
    rollout_diagnostics "$app"
    exit 1
  fi
done

TRAEFIK_IP=$(kubectl -n kube-system get svc traefik -o jsonpath='{.spec.clusterIP}')
# Logo após o rollout o Traefik ainda pode apontar para o pod antigo (502); repete até assentar.
SMOKE_RETRY=(--retry 10 --retry-delay 3 --retry-all-errors)
curl -fsS "${SMOKE_RETRY[@]}" -o /dev/null -w 'web=%{http_code}\n' -H "Host: web.$DOMAIN" "http://$TRAEFIK_IP"
curl -fsS "${SMOKE_RETRY[@]}" -H "Host: auth.$DOMAIN" "http://$TRAEFIK_IP/health/ready" >/dev/null
API_STATUS=$(curl -sS "${SMOKE_RETRY[@]}" -o /dev/null -w '%{http_code}' -H "Host: api.$DOMAIN" "http://$TRAEFIK_IP/api/tasks")
test "$API_STATUS" = 401

printf 'export SHA=%q\n' "$SHA" > /opt/braid/release.env

# Depois de registrar a release: uma falha aqui deixa o deploy vermelho, mas as
# aplicacoes ja estao no ar na versao nova.
bash ops/production/sync-hermes-skills.sh "$ROOT"
printf 'Deploy concluído: %s\n' "$SHA"
