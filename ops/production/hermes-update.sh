#!/usr/bin/env bash
# Atualizacao diaria do Hermes (ADR 004). Instalado em /opt/braid/bin e chamado
# por hermes-update.timer.
#
# 1. guarda o digest da imagem em execucao;
# 2. repoe a tag `stable` e reinicia (imagePullPolicy: Always puxa a nova);
# 3. espera o rollout e valida a API de dentro do cluster;
# 4. se qualquer etapa falhar, volta ao digest guardado e sai com erro.
set -euo pipefail

source /opt/braid/env.sh
NS=braid
DEPLOY=hermes
STABLE=nousresearch/hermes-agent:stable
LOG=/opt/braid/hermes-update.log
KEY_SECRET=hermes-env

log() { printf '%s %s\n' "$(date -u +%FT%TZ)" "$*" | tee -a "$LOG"; }

running_image() {
  kubectl -n "$NS" get pod -l app="$DEPLOY" \
    -o jsonpath='{.items[0].status.containerStatuses[0].imageID}'
}

# Chama /health e /v1/models (com a chave) pelo pod da API, o unico que tem
# permissao de rede para o Hermes. A chave entra por stdin, nunca por argumento.
smoke() {
  kubectl -n "$NS" get secret "$KEY_SECRET" -o jsonpath='{.data.API_SERVER_KEY}' | base64 -d \
    | kubectl -n "$NS" exec -i deploy/api -- node -e '
      let key = "";
      process.stdin.on("data", (d) => (key += d)).on("end", async () => {
        const base = "http://hermes.braid.svc.cluster.local:8642";
        const health = await fetch(base + "/health");
        const models = await fetch(base + "/v1/models", { headers: { authorization: "Bearer " + key } });
        if (!health.ok || !models.ok) {
          console.error("health=" + health.status + " models=" + models.status);
          process.exit(1);
        }
      });'
}

previous="$(running_image)"
[[ "$previous" == *@sha256:* ]] || { log "digest atual ilegivel: '$previous'"; exit 1; }
log "atual: $previous"

kubectl -n "$NS" set image "deployment/$DEPLOY" "$DEPLOY=$STABLE"
kubectl -n "$NS" rollout restart "deployment/$DEPLOY"

if kubectl -n "$NS" rollout status "deployment/$DEPLOY" --timeout=300s && smoke; then
  current="$(running_image)"
  if [[ "$current" == "$previous" ]]; then log "sem versao nova"; else log "atualizado: $current"; fi
  exit 0
fi

log "falhou; voltando para $previous"
kubectl -n "$NS" set image "deployment/$DEPLOY" "$DEPLOY=$previous"
kubectl -n "$NS" rollout status "deployment/$DEPLOY" --timeout=300s
log "rollback concluido; a stable de hoje nao foi aceita"
exit 1
