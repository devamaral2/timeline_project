# 01 — Arquitetura e orçamento de recursos

Documento de referência para decidir onde cada workload entra e se ainda há RAM para
adicioná-lo. O alvo é um único VPS de 16 GiB rodando k3s, com tráfego baixo e builds
feitos no CI.

## Topologia alvo

```text
                              INTERNET
                                  |
                    +-------------v-------------+
                    | Traefik  hostPort 80/443  |
                    | namespace: ingress        |
                    +------+-------------+------+
                           |             |
              Ingress app.dominio   Ingress api.dominio
                           |             |
   namespace: prod  +------v-----+  +----v------+
                    | web x2     |->| api x2    |
                    | Deployment |  | Deployment|
                    +------------+  +--+-----+--+
                                       |     |
                          NetworkPolicy|     | NetworkPolicy
                          +------------v-+ +-v---------------+
                          | postgres     | | litellm         |
                          | redis        | | Deployment      |
                          | StatefulSet  | +--------+--------+
                          +--------------+          |
                                             egress HTTPS
                                       OpenRouter / Nous (Hermes)

   namespace: observability     namespace: flux-system   namespace: staging
   Alloy, VictoriaMetrics,      source/kustomize/helm/   web, api, redis
   VictoriaLogs, Tempo,         notification +           (PriorityClass baixa)
   Grafana, kube-state-metrics  image-automation
```

Cinco namespaces: `ingress`, `prod`, `observability`, `flux-system`, `staging`. A
divisória não é cosmética — ela é o que permite NetworkPolicy por namespace, quota de
recursos por ambiente e `PriorityClass` diferente para o staging.

## Redes e isolamento

O v1 isolava o banco com uma rede Docker `internal: true`. Isso é topologia: funciona
porque o web não está na rede, não porque alguém proibiu. O v2 usa **NetworkPolicy**, que
é regra.

Política em `prod`, com default-deny de ingress e egress:

| Origem | Destino permitido | Motivo |
|---|---|---|
| `ingress/traefik` | `prod/web:3000`, `prod/api:3001` | entrada |
| `prod/web` | `prod/api:3001` | o Next repassa `/api/*` |
| `prod/api` | `prod/postgres:5432`, `prod/redis:6379`, `prod/litellm:4000` | dados e modelos |
| `prod/api` | egress 443 externo | Firebase Auth enquanto existir |
| `prod/litellm` | `prod/postgres:5432`, `prod/redis:6379`, egress 443 | spend, cache, providers |
| `observability/alloy` | `/metrics` de tudo | coleta |
| qualquer outro par | negado | |

O `web` **não** alcança PostgreSQL, Redis nem o LiteLLM. Se um dia alcançar, foi porque
alguém escreveu uma política dizendo isso, e essa linha aparece no diff.

## Portas

| Porta | Exposta no host | Serviço |
|---|---|---|
| 22 | sim, idealmente restrita | SSH |
| 80 | sim | redirect HTTP→HTTPS e desafio ACME |
| 443 | sim | Traefik |
| 6443 | **não** | API do k3s — acesso por túnel SSH |
| 8443 | temporária, só nas fases 3–5 | Traefik do cluster durante a janela de migração |
| 3000, 3001, 4000, 5432, 6379 | nunca | Services internos do cluster |

Qualquer quarta porta pública permanente exige revisão de arquitetura, como no v1.

⚠️ O `6443` é o ponto novo mais perigoso. A API do Kubernetes exposta na internet é alvo
de varredura constante. O instalador do k3s não mexe no UFW, mas também não fecha nada por
você: confirme na Fase 1.

## Orçamento de RAM

O v1 tinha só `mem_limit`, que é teto. Kubernetes separa duas coisas:

- **`requests`** — o que o scheduler reserva. É uma promessa: a soma dos requests nunca
  passa da capacidade do nó, então esse valor está garantido para o pod.
- **`limits`** — o teto que o cgroup aplica. Pode somar mais que a RAM do nó
  (*oversubscription*), porque nem tudo pica ao mesmo tempo.

E uma consequência: a **classe QoS**. `requests == limits` dá `Guaranteed`, que é o último
a ser despejado sob pressão. É assim que se protege o PostgreSQL — o v1 não tinha como
fazer isso, e o glossário dele chamava o OOM killer de "vilão recorrente" justamente por
não ter.

| Componente | Namespace | requests | limits | Configuração associada |
|---|---|---:|---:|---|
| SO minimal | — | — | ~300 | |
| k3s server, kubelet, containerd, CoreDNS, metrics-server, local-path | — | — | ~600 | custo de entrada da plataforma |
| Traefik | ingress | 64 | 192 | |
| cert-manager (controller, webhook, cainjector) | cert-manager | 96 | 256 | |
| Flux (4 controllers + 2 de imagem) | flux-system | 128 | 512 | |
| web × 2 | prod | 512 | 1024 | heap V8 320 MiB por réplica |
| api × 2 | prod | 384 | 768 | heap V8 256 MiB por réplica |
| postgres | prod | 2048 | 2048 | `Guaranteed`; `shared_buffers=512MB` |
| redis | prod | 512 | 512 | `Guaranteed`; `maxmemory=384mb`, `noeviction` |
| litellm | prod | 256 | 768 | |
| alloy | observability | 192 | 512 | agora também recebe OTLP |
| victoriametrics | observability | 512 | 1536 | retenção 90d |
| victorialogs | observability | 256 | 768 | |
| tempo | observability | 256 | 768 | monolítico, storage local |
| grafana | observability | 128 | 384 | |
| kube-state-metrics e exporters pg/redis | observability | 96 | 256 | |
| staging (web, api, redis) | staging | 320 | 896 | `PriorityClass` baixa |
| reserva `auth-api` / `jobs-api` | prod | 192 | 640 | sem pods vazios, como no v1 |
| **Soma dos workloads** | | **5.952** | **11.840** | |
| **Com SO e k3s** | | **~6,7 GiB** | **~12,5 GiB** | |
| **Folga em 16 GiB** | | **~9,3 GiB** | **~3,5 GiB** | |

Leitura da tabela: **6,7 GiB é o piso garantido**, e é o número que precisa caber com
folga — cabe, sobrando 9,3 GiB que viram page cache, que é exatamente o que o PostgreSQL
quer. **12,5 GiB é o teto se tudo estourar ao mesmo tempo**, cenário que não deve
acontecer e, se acontecer, é o staging (`PriorityClass` baixa) que o kubelet despeja
primeiro — não o banco.

Postgres e Redis recebem `requests == limits` de propósito. Eles pagam o preço de reservar
memória que talvez não usem, em troca de serem os últimos da fila do despejo.

### Como validar os números

Depois do corte da Fase 5, registrar por sete dias:

```bash
# ☸️ cluster
kubectl top nodes
kubectl top pods -A --sort-by=memory
kubectl get pods -A -o jsonpath="{range .items[*]}{.metadata.namespace}{'\t'}{.metadata.name}{'\t'}{.spec.containers[*].resources.requests.memory}{'\t'}{.spec.containers[*].resources.limits.memory}{'\n'}{end}"
```

```bash
# 🖥️ servidor
free -h
```

Alertar quando um pod sustentar 80% do seu limite. Swap em uso contínuo continua sendo
falha de dimensionamento, não folga utilizável.

⚠️ O k3s, como todo Kubernetes, prefere que **não haja swap**. Ele foi tolerado no v1 como
amortecedor de pico. Na Fase 1 a decisão é explícita: manter o swap de 4 GiB e ligar
`fail-swap-on=false` no kubelet, aceitando que a contabilidade de memória fica menos
precisa, ou desligar o swap e confiar no despejo por `PriorityClass`. A fase recomenda a
segunda opção e explica por quê.

## PostgreSQL e Redis

Um único PostgreSQL continua atendendo tudo. O que muda com 16 GiB:

```conf
shared_buffers = 512MB
effective_cache_size = 4GB
work_mem = 8MB
maintenance_work_mem = 128MB
max_connections = 60
```

`effective_cache_size` não aloca nada: é uma dica ao planejador sobre quanta memória o SO
tem para page cache. Com 9 GiB de folga, manter os 512 MB do v1 faria o planejador evitar
index scan sem motivo.

`max_connections = 60` cobre: pools da API (2 réplicas × 5), staging, LiteLLM (que abre
pool próprio para spend logs), migrações, backup e administração. PgBouncer continua sendo
a evolução antes de centenas de conexões, não o aumento deste número.

Redis sobe para `maxmemory=384mb` e continua `noeviction`. Ele agora tem dois usuários com
perfis opostos: fila (não pode perder job) e cache do LiteLLM (perder é aceitável). Isso é
uma tensão real — `noeviction` significa que um cache crescendo demais quebra a escrita da
fila. A Fase 7 resolve separando por **database lógica** com TTL obrigatório no cache, e
registra o gatilho para separar em instâncias de verdade.

## Bancos e roles

| Database | Dono | Consumidor |
|---|---|---|
| `timeline` | `timeline_migrator` | `timeline_app` (API) |
| `timeline_staging` | `timeline_migrator` | `staging_app` |
| `litellm` | `litellm_owner` | o próprio proxy |

O LiteLLM ganha database própria e role própria. Ele guarda chave virtual, orçamento e
spend log — dado operacional que não tem por que compartilhar schema com a aplicação, e
cujo vazamento tem impacto diferente.

## Armazenamento

`local-path` é o provisionador padrão do k3s: cada PVC vira um diretório em
`/var/lib/rancher/k3s/storage`. Com um nó só isso é adequado e é o que tem menos peças.

A consequência a não esquecer: **o volume está preso ao nó**. Não há réplica, não há
snapshot de PV, e perder o disco é perder o PV. Por isso o backup lógico do v1
(`pg_dump` mais `rclone` para fora) continua sendo a rede de segurança real — agora
rodando como `CronJob`, e ainda com restore testado a partir do armazenamento externo.

## Caminho de uma requisição de IA

Vale destacar porque é o caminho mais longo do sistema e o que a Fase 8 instrumenta:

1. DNS resolve `app.SEUDOMINIO.com` para o VPS.
2. UFW permite 443; Traefik encerra TLS e aplica headers e rate limit.
3. Traefik → Service `web` → um pod do Next.
4. O Next repassa `/api/*` → Service `api` → um pod do Nest.
5. O controller valida o token e chama o gateway de parsing ou o agente.
6. O gateway chama o **Service `litellm`**, não mais o OpenRouter direto.
7. O LiteLLM escolhe a lane, consulta o cache no Redis e, em caso de miss, chama o
   provider (OpenRouter ou Nous) pela egress 443.
8. A skill do agente grava o evento no PostgreSQL.
9. O LiteLLM grava custo e tokens na database `litellm`.

Nove saltos, dos quais três podem ser lentos por motivos completamente diferentes. É por
isso que a Fase 8 existe: sem um trace atravessando tudo isso, "demorou nove segundos" não
tem diagnóstico.

## Critérios de evolução

- Considerar um **segundo nó** quando o uso sustentado passar de 80%, quando a
  indisponibilidade durante manutenção do nó deixar de ser aceitável, ou quando houver
  motivo real para HA — e não antes: um nó só com k3s é escolha consciente, não limitação
  esquecida.
- Considerar **PgBouncer** quando as conexões passarem de 40 sustentadas.
- Considerar **separar o Redis** em instâncias de fila e cache quando a memória do cache
  passar de metade do `maxmemory`.
- Considerar **quota de IA por usuário** antes de a base passar de um punhado de pessoas
  conhecidas — ver [`12-fase-10-api-publica.md`](12-fase-10-api-publica.md).
