# Fase 4 — PostgreSQL e Redis no cluster

## 1. Objetivo

PostgreSQL e Redis rodando como StatefulSet no namespace `prod`, com os dados migrados do
Compose, backup por CronJob para armazenamento externo e um restore testado a partir dele
— com o Compose ainda de pé e capaz de retomar.

## 2. Por que isso existe

Esta é a fase mais perigosa do plano inteiro, e vale dizer por quê em voz alta: é a única
em que existe dado que não dá para recriar. Um deploy ruim de aplicação se resolve com
rollback; um banco corrompido se resolve com backup, e só se o backup existir e prestar.

A regra do v1 era "PostgreSQL não recebe dado real antes de backup e restore externos
funcionarem". Naquele momento o banco estava vazio e a regra era barata. Agora o banco tem
os seus eventos dentro, e a mesma regra custa caro e vale muito mais.

Por isso a fase tem uma estrutura diferente das outras: ela é escrita de trás para frente,
começando pelo caminho de volta. Você só executa o corte depois de ter provado que sabe
desfazê-lo.

Há também um ganho concreto que justifica mover o banco, e não é "porque tudo tem que ir
para o cluster": é a classe QoS `Guaranteed`. No Compose, o `mem_limit` era um teto e o
OOM killer escolhia a vítima por heurística — o glossário do v1 chama isso de vilão
recorrente, e a queixa era que ele mata o Postgres em vez do processo culpado. Com
`requests == limits`, o PostgreSQL passa a ser o último da fila de despejo. Isso é uma
proteção que o Compose não tinha como oferecer.

## 3. Passo a passo

### 3.1 — Antes de qualquer coisa: o caminho de volta

⚠️ Não prossiga sem estes três itens prontos e testados.

1. **Backup fresco, validado, fora do servidor.** Rode o `backup.sh`, confirme o upload, e
   faça o restore num ambiente descartável seguindo o procedimento da
   [Fase 6 do v1](../docs/08-fase-6-postgres-e-redis.md#66--restore-obrigatório). Inclua as
   duas conferências novas da Fase 0: contagem de linhas e `max(created_at)`.
2. **Procedimento de volta escrito.** Uma página, com os comandos exatos para religar o
   Postgres do Compose e reapontar a API. Escrita antes, não durante.
3. **Janela combinada consigo mesmo.** O corte tem downtime de escrita. Escolha uma hora em
   que você não vá registrar eventos, e assuma que vai levar o dobro do que você estimou.

### 3.2 — StatefulSet do PostgreSQL

```yaml
# prod/postgres.yaml — trechos que importam
spec:
  serviceName: postgres
  replicas: 1
  template:
    spec:
      priorityClassName: prod-critical
      securityContext: {fsGroup: 999, runAsUser: 999, runAsNonRoot: true}
      containers:
        - name: postgres
          image: postgres:16-alpine
          args: ["-c", "config_file=/etc/postgresql/postgresql.conf"]
          resources:
            requests: {memory: 2Gi, cpu: 500m}
            limits:   {memory: 2Gi}
          readinessProbe:
            exec: {command: ["pg_isready", "-U", "timeline_admin", "-d", "timeline"]}
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            exec: {command: ["pg_isready", "-U", "timeline_admin"]}
            initialDelaySeconds: 60
            periodSeconds: 30
  volumeClaimTemplates:
    - metadata: {name: pgdata}
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: local-path
        resources: {requests: {storage: 20Gi}}
```

Três detalhes que não são cosméticos:

- **`requests == limits`** dá a classe `Guaranteed`. É o ponto da fase.
- **`livenessProbe` com `initialDelaySeconds` alto e período longo.** Uma liveness probe
  agressiva num banco é uma máquina de reinício: o Postgres fica lento sob carga, a probe
  falha, o kubelet mata o processo no meio de um checkpoint, e o restart deixa tudo mais
  lento ainda. Readiness pode ser agressiva; liveness, não.
- **`volumeClaimTemplates`, não um PVC solto.** O PVC nasce e morre com a identidade do
  StatefulSet, o que evita o cenário em que alguém recria o objeto e o volume antigo fica
  órfão, ocupando disco e sem ninguém saber para quê.

A `postgresql.conf` é a da Fase 0 com os valores novos de
[`01-arquitetura-e-orcamento.md`](01-arquitetura-e-orcamento.md): `shared_buffers=512MB`,
`effective_cache_size=4GB`, `work_mem=8MB`, `maintenance_work_mem=128MB`,
`max_connections=60`.

### 3.3 — Redis, e a tensão entre fila e cache

O Redis do v1 tinha um usuário só, hipotético: fila. Agora ele vai ter dois de verdade, e
com requisitos opostos — a fila não pode perder nada, o cache do LiteLLM pode perder tudo.

`noeviction` continua sendo a política, pelo motivo original: fila que perde job em
silêncio é pior que fila que falha alto. A consequência é que **um cache crescendo demais
quebra a escrita da fila**, e isso não é hipotético.

A mitigação desta fase é separar por database lógica e obrigar TTL:

| Database | Uso | Regra |
|---|---|---|
| `0` | fila (futura `jobs-api`) | sem TTL, dado durável |
| `1` | cache do LiteLLM | **TTL obrigatório**, configurado na Fase 7 |

E um alerta, criado agora e não depois: memória do Redis acima de 70% do `maxmemory`. O
gatilho para separar em duas instâncias de verdade está em
[`01-arquitetura-e-orcamento.md`](01-arquitetura-e-orcamento.md).

Os `--rename-command` do v1 para `FLUSHALL`, `FLUSHDB` e `CONFIG` continuam. Eles custam
nada e removem os três comandos que mais aparecem em incidente.

### 3.4 — Roles, e as duas novas

As roles do v1 (`timeline_admin`, `timeline_migrator`, `timeline_app`) vêm no
`globals.sql` e são restauradas junto. Acrescente as duas que o v2 precisa:

```sql
CREATE ROLE litellm_owner LOGIN PASSWORD :'litellm_password';
CREATE DATABASE litellm OWNER litellm_owner;

CREATE ROLE staging_app LOGIN PASSWORD :'staging_password';
CREATE DATABASE timeline_staging OWNER timeline_migrator;
```

O LiteLLM tem database própria de propósito. Ele guarda chave virtual, orçamento e spend
log — dado operacional cujo vazamento tem impacto diferente do dado da aplicação, e que
não tem por que dividir schema com ela.

`timeline_app` continua sem ser superusuário e sem ser dono do schema. Isso não mudou e
não deve mudar.

### 3.5 — O corte

⚠️ A partir daqui há downtime de escrita. Siga na ordem.

```bash
# 🖥️ servidor
# 1. Parar quem escreve, mantendo o banco de pe
docker compose -f /opt/stack/apps/docker-compose.yml stop api web

# 2. Dump final, com o banco parado de receber escrita
cd /opt/stack/data
set -a; . ./.env; set +a
docker compose exec -T postgres pg_dumpall -U "$POSTGRES_ADMIN_USER" --globals-only > /tmp/globals.sql
docker compose exec -T postgres pg_dump -U "$POSTGRES_ADMIN_USER" -d "$POSTGRES_DB" -Fc > /tmp/timeline.dump

# 3. Snapshot do Redis
docker compose exec -T redis redis-cli -a "$REDIS_PASSWORD" BGSAVE
sleep 5
docker cp redis:/data/dump.rdb /tmp/redis.rdb
```

Restaure no cluster:

```bash
# ☸️ cluster
kubectl -n prod cp /tmp/globals.sql postgres-0:/tmp/globals.sql
kubectl -n prod cp /tmp/timeline.dump postgres-0:/tmp/timeline.dump
kubectl -n prod exec -it postgres-0 -- psql -U timeline_admin -d postgres -f /tmp/globals.sql
kubectl -n prod exec -it postgres-0 -- pg_restore -U timeline_admin -d timeline --exit-on-error /tmp/timeline.dump
```

O `--exit-on-error` é obrigatório. Sem ele, o `pg_restore` reporta sucesso tendo pulado
objetos que falharam, e você descobre a lacuna semanas depois.

**Conferência antes de religar qualquer coisa:**

```bash
# ☸️ cluster
kubectl -n prod exec -it postgres-0 -- psql -U timeline_admin -d timeline -c "select count(*) from app.events;"
kubectl -n prod exec -it postgres-0 -- psql -U timeline_admin -d timeline -c "select max(created_at) from app.events;"
```

Os dois números têm que bater com o Postgres do Compose, que ainda está de pé ao lado
justamente para essa comparação. Se não baterem, **pare** e execute o caminho de volta do
passo 3.1.

Nesta fase a API ainda é a do Compose. Aponte-a para o banco novo mudando `DATABASE_URL` e
`REDIS_URL` no `api.env` para o `hostPort` do cluster, ou — melhor — deixe a API apontada
para o banco antigo e faça o corte de banco e de aplicação juntos, na Fase 5. A segunda
opção tem uma janela só, e é a recomendada.

### 3.6 — Backup como CronJob

O `backup.sh` do v1 vira um `CronJob`, ganhando o que o systemd timer não dava: log no
mesmo lugar que o resto, histórico de execuções e um alerta natural quando falha.

```yaml
# prod/backup-cronjob.yaml — trecho
spec:
  schedule: "0 4 * * *"
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  concurrencyPolicy: Forbid
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: OnFailure
          priorityClassName: low
```

`concurrencyPolicy: Forbid` importa: um backup lento que ainda roda quando o próximo
dispara dobraria a carga no banco no pior momento.

Os três artefatos continuam os mesmos do v1 — `globals.sql`, `timeline.dump`, `redis.rdb`
— e continuam indo para fora por `rclone`. Acrescente o quarto, da Fase 1:
`k3s-datastore.tar.gz`.

E o alerta que fecha o ciclo: `kube_job_status_failed` acima de zero, e ausência de job
bem-sucedido nas últimas 26 horas. O segundo pega o caso em que o CronJob simplesmente
parou de disparar — falha silenciosa que o primeiro não detecta.

### 3.7 — Restore obrigatório, de novo

A fase não termina sem um restore a partir do **armazenamento externo**, feito depois do
corte, com os dados novos. Sim, é o segundo desta fase. Sim, vale a pena: o primeiro
validou o backup do Compose; este valida o backup do cluster, que é um caminho de código
diferente.

Registre data, caminho remoto e resultado no checklist.

## 4. Por que não fazer diferente

**Deixar o banco no Compose para sempre.** Defensável, e é o que muita gente faz: banco em
container gerenciado à mão, resto no cluster. Você fica com duas plataformas para operar e
perde a classe QoS `Guaranteed`, que é o principal ganho técnico desta fase. Seria a
escolha certa se o cluster fosse experimental — mas a Fase 11 aposenta o Compose, então
manter o banco lá seria manter o Compose inteiro só por ele.

**Um operador de PostgreSQL (CloudNativePG, Zalando).** Trazem backup contínuo,
point-in-time recovery, failover e réplicas. São genuinamente melhores que um StatefulSet
à mão — e são a escolha certa a partir do segundo nó, ou quando PITR virar requisito.
Descartado agora porque um operador com um nó só entrega quase nada do que ele sabe fazer,
e cobra em RAM, CRDs e uma camada a mais entre você e o `psql`. Anote como o primeiro
candidato a revisitar.

**PostgreSQL gerenciado (Neon, Supabase, RDS).** Tira o problema mais difícil da sua mão:
backup, PITR e upgrade viram problema de outra pessoa. É a escolha certa se o dado for
crítico e o seu tempo, escasso. Descartado aqui porque contraria o objetivo declarado de
aprender cada peça, e porque acrescenta latência de rede no caminho mais quente.

**Banco fora de container, direto no host.** Mais leve e mais simples de dar tuning. Perde
a declaratividade e cria um serviço que não está no git nem no cluster — exatamente a
coisa que a Fase 6 quer eliminar.

## 5. Como garantir que está certo

```bash
# ☸️ cluster
kubectl -n prod get statefulset,pvc,pod
```

Esperado: `postgres` e `redis` com `1/1`, PVCs em `Bound`, pods em `Running`.

```bash
# ☸️ cluster
kubectl -n prod get pod postgres-0 -o jsonpath="{.status.qosClass}"
```

Esperado: `Guaranteed`. Se vier `Burstable`, o `requests` e o `limits` não são iguais e a
proteção principal da fase não existe.

```bash
# ☸️ cluster
kubectl -n prod exec -it postgres-0 -- psql -U timeline_admin -d timeline -c "show max_connections;"
kubectl -n prod exec -it postgres-0 -- psql -U timeline_admin -d timeline -c "show shared_buffers;"
kubectl -n prod exec -it postgres-0 -- psql -U timeline_admin -d timeline -c "\du"
```

Esperado: `60`, `512MB`, e as cinco roles — `timeline_admin`, `timeline_migrator`,
`timeline_app`, `litellm_owner`, `staging_app`. Nenhuma delas com `Superuser` além da de
administração.

```bash
# ☸️ cluster
kubectl -n prod exec -it redis-0 -- redis-cli -a "$REDIS_PASSWORD" CONFIG GET maxmemory-policy
```

Esperado: `noeviction`.

```bash
# 💻 local
nmap -Pn -p 5432,6379 SEU_IP
```

Esperado: `filtered` nas duas. Nenhum banco ganhou `hostPort` — se alguma vier `open`,
alguém publicou o Service sem querer.

E o teste de NetworkPolicy, que é o que substitui a rede `internal: true` do v1:

```bash
# ☸️ cluster
kubectl -n prod run netpol-test --rm -it --restart=Never --image=busybox --labels="app=web" -- \
  nc -zv postgres 5432
```

Esperado: **falha por timeout**. Um pod rotulado como `web` não pode alcançar o banco. Se
conectar, a política não está aplicada, e vale mais descobrir isso com um `busybox` que
com um incidente.

Faça também o exercício da seção "Como usar esta spec" do
[`00-convencoes.md`](00-convencoes.md): `kubectl delete pod postgres-0` e cronometre a
volta. Confirme que o dado continua lá — é a prova de que o PVC está fazendo o trabalho
dele, e é o teste que mais tranquiliza depois.

## 6. Armadilhas comuns

**`pg_restore` reportando sucesso com objetos faltando.** Sem `--exit-on-error` ele
continua depois de erro. É a armadilha mais cara desta fase.

**Permissão no volume do `local-path`.** O diretório nasce com dono do host, e o Postgres
recusa iniciar com `data directory has invalid permissions`. O `fsGroup: 999` no
`securityContext` resolve; sem ele, o pod entra em `CrashLoopBackOff` com uma mensagem que
parece corrupção mas é `chown`.

**Liveness probe agressiva reiniciando o banco sob carga.** Descrito em 3.2. O sintoma é
um `RESTARTS` que sobe exatamente nos momentos de pico — quando você menos pode perder o
banco.

**`kubectl delete pvc` achando que recria vazio.** ⚠️ Ele apaga o dado. Com
`local-path` não há snapshot, não há lixeira e não há desfazer.

**Redis enchendo por causa do cache.** Descrito em 3.3. Sintoma: escritas falhando com
`OOM command not allowed when used memory > maxmemory` num Redis que "não deveria estar
cheio".

**Esquecer o Postgres do Compose ligado.** Depois do corte, dois bancos no ar significa
dois destinos possíveis para uma escrita. Ele fica de pé até a Fase 11 de propósito, mas
**parado**, não rodando. Pare-o assim que a conferência do passo 3.5 fechar.

## 7. Para estudar

- 🆓 [Kubernetes — StatefulSets](https://kubernetes.io/docs/concepts/workloads/controllers/statefulset/)
- 🆓 [Kubernetes — Configure Liveness, Readiness and Startup Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/) — leia a seção sobre bancos de dados duas vezes.
- 🆓 [PostgreSQL — Server Configuration: Resource Consumption](https://www.postgresql.org/docs/16/runtime-config-resource.html)
- 🆓 [Redis — Key eviction](https://redis.io/docs/latest/develop/reference/eviction/) — por que `noeviction` e o que ele custa.
- 🆓 [Kubernetes — Network Policies](https://kubernetes.io/docs/concepts/services-networking/network-policies/)
- 💰 *PostgreSQL 14 Internals*, Egor Rogov — o capítulo de buffer cache explica `shared_buffers` melhor que a documentação.
