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

docker build -f apps/api/Dockerfile -t "braid-api:$SHA" .
docker build -f apps/auth/Dockerfile -t "braid-auth:$SHA" .
docker build -f apps/mcp/Dockerfile -t "braid-mcp:$SHA" .
docker build --no-cache \
  --build-arg "OP_ENVIRONMENT_ID=$OP_ENVIRONMENT_ID" \
  --secret id=onepassword-token,src=/opt/braid/private/onepassword-token \
  -f apps/web/Dockerfile -t "braid-web:$SHA" .

# A API e o auth migram o proprio arquivo SQLite na subida do pod (ADR 0024 e 0025), com uma copia antes de cada
# mudanca de schema.

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

for app in api auth web; do
  if ! kubectl -n braid rollout status "deployment/$app" --timeout=300s; then
    rollout_diagnostics "$app"
    exit 1
  fi
done

# Virada do auth para SQLite (ADR 0025): o primeiro pod sobe com o arquivo sem usuarios. Enquanto o Postgres antigo
# existir, os dados de acesso vem dele uma vez (usuarios, papeis, chaves de dispositivo e de assinatura, auditoria) e o
# auth reinicia. Com usuarios no arquivo, o passo nao faz nada. A senha do Postgres vai pela entrada padrao.
auth_users() {
  kubectl -n braid exec deploy/auth -- node -e '
    const db = new (process.getBuiltinModule("node:sqlite").DatabaseSync)(process.env.AUTH_DATABASE_PATH, { readOnly: true });
    console.log(db.prepare("SELECT count(*) AS n FROM users").get().n);'
}
if kubectl -n braid get svc postgres >/dev/null 2>&1 && [[ "$(auth_users)" == "0" ]]; then
  OWNER_PW=$(kubectl -n braid get secret postgres-env -o "jsonpath={.data.AUTH_OWNER_PASSWORD}" | base64 -d)
  printf 'postgres://auth_owner:%s@postgres.braid.svc.cluster.local:5432/braid_auth' "$OWNER_PW" \
    | kubectl -n braid exec -i deploy/auth -- node apps/auth/dist/db/copy-from-postgres.cli.js --url-from-stdin
  unset OWNER_PW
  kubectl -n braid rollout restart deployment/auth
  if ! kubectl -n braid rollout status deployment/auth --timeout=300s; then
    rollout_diagnostics auth
    exit 1
  fi
  echo "Auth: dados copiados do Postgres para o SQLite ($(auth_users) usuario(s))."
fi

# O MCP so atende o Hermes (ADR 004); web, auth e API nao dependem dele. Se nao
# subir, avisa e segue: nao trava a release das aplicacoes. Causa comum: faltam
# campos do scope mcp-runtime no Environment do 1Password (docs/runbook/hermes.md).
MCP_READY=1
if ! kubectl -n braid rollout status deployment/mcp --timeout=300s; then
  rollout_diagnostics mcp
  echo "::warning title=MCP fora do ar::O deployment mcp nao assentou; o deploy segue sem ele. Veja 'kubectl -n braid logs deploy/mcp --previous' na VPS." >&2
  MCP_READY=0
fi

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
if [[ "$MCP_READY" != 1 ]]; then
  echo "::warning title=MCP fora do ar::Release $SHA no ar, mas o MCP do Hermes nao esta rodando." >&2
fi
