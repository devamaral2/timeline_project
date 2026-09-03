# 15 — Runbook de operação

Documento lido no meio de um incidente, quando ninguém tem paciência. Comandos primeiro,
explicação depois.

Todo comando `☸️` pressupõe o túnel SSH aberto e `KUBECONFIG` exportado:

```bash
ssh -N -L 6443:127.0.0.1:6443 SEU_USUARIO@SEU_IP
export KUBECONFIG=~/.kube/config-vps
```

---

## Diagnóstico inicial

```bash
kubectl get pods -A --field-selector=status.phase!=Running
kubectl top nodes
kubectl top pods -A --sort-by=memory
kubectl get events -A --sort-by=.lastTimestamp | tail -30
flux get all -A
```

Os eventos ordenados por tempo são o comando mais útil e o menos lembrado: eles contam a
história recente do cluster em uma tela.

---

## Site não responde

```bash
kubectl -n ingress get pods
kubectl -n prod get pods -l app=web
kubectl -n prod get ingress
kubectl -n ingress logs deploy/traefik --tail 100
```

Ordem de suspeita:

1. **Pods do web não estão `READY`.** Veja `kubectl -n prod describe pod` — readiness
   falhando, imagem não baixando, ou `Pending` por memória.
2. **Traefik fora.** Se o pod dele caiu, nada entra.
3. **Certificado expirado.** `kubectl -n prod get certificate` — `READY: False` explica.
4. **DNS.** Se o cluster está saudável e o site não abre, teste pelo IP.

Se for preciso voltar rápido para a última versão boa:

```bash
kubectl -n prod rollout undo deploy/web
kubectl -n prod rollout status deploy/web
```

⚠️ O Flux vai reconciliar de volta em minutos. Para um rollback que dure, suspenda antes
com `flux suspend kustomization prod`, e leve a correção ao git antes de retomar.

---

## Pod reiniciando

```bash
kubectl -n NAMESPACE describe pod NOME | tail -40
kubectl -n NAMESPACE logs NOME --previous
```

O `--previous` é a chave: ele mostra o log do container **que morreu**, não do que acabou
de subir. Sem ele você lê a inicialização e não vê a causa.

Causas por frequência:

| Motivo | Significado | Ação |
|---|---|---|
| `OOMKilled` | passou do `limits` de memória | subir o limite, ou achar o vazamento |
| `Error` com exit 1 | a aplicação quebrou na subida | ler o log `--previous` |
| liveness falhando | probe agressiva demais, ou app travado | ver a Fase 4 sobre banco |
| `ImagePullBackOff` | tag inexistente ou sem permissão no GHCR | conferir o SHA |

---

## Pod preso em `Pending`

```bash
kubectl -n NAMESPACE describe pod NOME | grep -A10 Events
```

Quase sempre `Insufficient memory` ou `Insufficient cpu`: a soma dos **requests** não
cabe. Note que isso independe do uso real — o nó pode ter RAM livre e ainda recusar.

Para liberar espaço rápido, na ordem:

```bash
kubectl -n staging scale deploy --all --replicas=0
kubectl -n prod scale deploy/api --replicas=1
```

---

## Disco cheio

```bash
df -h /
du -sh /var/lib/rancher/k3s/storage/*
crictl images
crictl rmi --prune
```

Suspeitos, em ordem: retenção da observabilidade, imagens antigas do containerd, backups
locais não expurgados.

⚠️ Nunca apague nada em `/var/lib/rancher/k3s/storage/` à mão. São os PVs, e ali está o
banco.

---

## Servidor lento

```bash
kubectl top pods -A --sort-by=cpu
uptime
free -h
kubectl get events -A | grep -i evict
```

Se houver despejo, confirme que a vítima foi o `staging` — é para isso que a
`PriorityClass` existe. Se a vítima foi algo em `prod`, a configuração de prioridade está
errada e isso é um incidente por si só.

---

## PostgreSQL lento ou indisponível

```bash
kubectl -n prod get pod postgres-0
kubectl -n prod logs postgres-0 --tail 100
kubectl -n prod exec -it postgres-0 -- psql -U timeline_admin -d timeline -c "select count(*) from pg_stat_activity;"
```

Se as conexões estiverem perto de 60, os suspeitos são: pool da API vazando, staging
aberto, ou o LiteLLM. Zerar as réplicas de staging alivia na hora.

Para ver o que está rodando, consulte `pg_stat_activity` filtrando estados diferentes de
`idle`, ordenando por `query_start`.

---

## Redis recusando escrita

Erro típico: comando não permitido porque a memória usada passou do `maxmemory`.

```bash
kubectl -n prod exec redis-0 -- redis-cli INFO memory | head -5
kubectl -n prod exec redis-0 -- redis-cli -n 1 DBSIZE
kubectl -n prod exec redis-0 -- redis-cli -n 0 DBSIZE
```

Se a database **1** (cache do LiteLLM) estiver grande, é o cenário previsto na Fase 4. O
alívio imediato é limpar o cache, que é descartável por natureza:

```bash
kubectl -n prod exec redis-0 -- redis-cli -n 1 FLUSHDB
```

⚠️ Confirme que está na database **1**. A **0** é a fila, e não é descartável. O
`rename-command` deve impedir o comando que apaga tudo; se ele funcionar, a configuração
se perdeu.

---

## Custo de LLM disparando

```bash
kubectl -n prod logs deploy/litellm --tail 200 | grep -i budget
```

E no Grafana: custo por lane nas últimas 24h, taxa de fallback, taxa de acerto do cache.

Causas prováveis: fallback ativo em silêncio (o primário está falhando e o secundário é
mais caro), cache não sendo consultado, ou uso legítimo acima do esperado.

Freio de emergência, sem deploy: reduzir o limite por minuto da chave virtual pelo
endpoint de atualização de chave do proxy. Isso degrada a funcionalidade para todos, e é a
consequência do risco declarado no item 4.4 do
[checklist de segurança](14-seguranca-checklist.md).

---

## Deploy não chegou

```bash
flux get all -A
flux logs --level=error --all-namespaces
kubectl -n prod get deploy api -o jsonpath="{.spec.template.spec.containers[0].image}"
```

A cadeia é: CI publica no GHCR, o image-reflector detecta, o image-automation commita, o
Flux reconcilia. Descubra em qual elo parou antes de mexer.

```bash
flux reconcile source git flux-system
flux reconcile kustomization prod
```

---

## Alteração manual sendo revertida

Comportamento correto do Flux. Para intervir de propósito:

```bash
flux suspend kustomization prod
flux resume kustomization prod
```

Deixar suspenso é dívida: enquanto estiver, o git não descreve o cluster. Leve a correção
ao repositório no mesmo dia.

---

## Restaurar PostgreSQL

```bash
rclone copy remoto:timeline-backups/DATA ./restore
kubectl -n prod cp ./restore/timeline.dump postgres-0:/tmp/timeline.dump
kubectl -n prod exec -it postgres-0 -- pg_restore -U timeline_admin -d timeline --exit-on-error --clean /tmp/timeline.dump
```

⚠️ `--clean` apaga os objetos antes de recriar. Só use com a certeza de que o backup é o
bom. Em dúvida, restaure numa database temporária e compare antes.

---

## Suspeita de invasão

1. **Não desligue nada** — memória viva é evidência.
2. `kubectl get events -A --sort-by=.lastTimestamp` e os logs de acesso do Traefik.
3. `kubectl get pods -A` procurando pod que você não criou.
4. `kubectl -n flux-system logs deploy/kustomize-controller` — deploy que você não fez.
5. `git log --oneline -20 -- deploy/` — commit que você não fez.
6. Revogue: chave virtual do LiteLLM, tokens do Firebase, chave SSH, chave age.
7. Só então decida entre isolar e reconstruir.

O item 2.10 do checklist do v1 continua sendo a referência do que coletar.

---

## Manutenção

| Tarefa | Frequência |
|---|---|
| Conferir que o backup rodou e o restore continua válido | mensal |
| Auditoria da Parte 5 do checklist | mensal |
| Atualizar imagens e reler o scan do Trivy | mensal |
| Atualizar o k3s | trimestral, lendo o changelog antes |
| Revisar retenção e uso de disco | trimestral |
| Revisar orçamento de LLM e limites de RAM | trimestral |
| Testar o rollback de verdade | semestral |
