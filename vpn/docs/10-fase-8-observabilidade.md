# Fase 8 — Observabilidade

## Objetivo

Ao final desta fase, você tem métricas e logs de tudo — host, containers e aplicações —
centralizados no Grafana, com três alertas configurados. Custo: ~1.1GB de RAM dos 4GB.

---

## Por que isso existe

Sem observabilidade, você descobre problemas de duas formas: alguém reclama, ou você
percebe por acaso. As duas são tarde demais.

Vale distinguir os termos, porque eles são usados como sinônimos e não são:

- **Monitoramento** responde perguntas que você sabia fazer: "a CPU está alta?", "o site
  está no ar?". São dashboards e alertas sobre coisas previstas.
- **Observabilidade** é a capacidade de responder perguntas que você **não** previu: "por
  que as requisições daquele endpoint específico ficaram lentas só para alguns usuários,
  entre 14h e 15h de ontem?". Isso exige dados suficientemente ricos para investigar
  depois do fato.

Os três pilares clássicos são métricas, logs e traces. Esta fase cobre os dois primeiros
— traces (OpenTelemetry) são um degrau seguinte, e fazem mais sentido quando você tiver
várias apps conversando entre si.

**Por que gastar quase um terço da RAM nisso?** Porque a alternativa é operar às cegas.
Num VPS de 4GB, os modos de falha são específicos e recorrentes: disco enchendo,
container batendo no `mem_limit`, banco lento por falta de índice. Todos são triviais de
detectar com métricas e praticamente invisíveis sem elas.

Dito isso, é uma decisão com trade-off honesto. Se você precisar do espaço para
aplicações reais, a seção "Alternativa mais leve" no final mostra como cortar para ~130MB
sem perder o essencial.

---

## Arquitetura

```
   node-exporter ──┐                 (metricas do host: CPU, RAM, disco)
       cAdvisor ───┤
                   ├──▶  Alloy  ──┬──▶ VictoriaMetrics  ──┐
   apps /metrics ──┘  (coletor)   │      (metricas)       │
                                  │                       ├──▶ Grafana
   logs dos containers ───────────┴──▶ Loki  ─────────────┘   (dashboards
                                        (logs)                 + alertas)
```

**Alloy** é o coletor unificado do Grafana: ele raspa métricas no formato Prometheus e
envia para o VictoriaMetrics, e ao mesmo tempo lê os logs dos containers Docker e envia
para o Loki. Uma peça no lugar de duas (`vmagent` + `promtail`), economizando ~70MB e um
arquivo de configuração.

---

## Passo a passo

### 8.1 — Estrutura

```bash
# 🖥️ servidor
mkdir -p /opt/stack/observability/{grafana/provisioning/{datasources,dashboards},loki,alloy}
cd /opt/stack/observability
```

### 8.2 — Senhas

```bash
# 🖥️ servidor
cat > .env <<EOF
GRAFANA_ADMIN_PASSWORD=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)
EOF
chmod 600 .env
cat .env
```

Gere também o hash para o basic auth do Traefik:

```bash
# 🖥️ servidor
sudo apt install -y apache2-utils
htpasswd -nbB admin 'MESMA_SENHA_OU_OUTRA'
```

⚠️ Ao colar o resultado num arquivo YAML do Traefik, **duplique os cifrões**
(`$` vira `$$`), senão o Compose tenta interpretar como variável de ambiente. É um erro
clássico e o sintoma é um 401 que você jura estar certo.

### 8.3 — Configuração do Loki

`/opt/stack/observability/loki/config.yml`:

```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  log_level: warn

common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  storage:
    filesystem:
      chunks_directory: /loki/chunks
      rules_directory: /loki/rules
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory

schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: filesystem
      schema: v13
      index:
        prefix: index_
        period: 24h

limits_config:
  retention_period: 168h        # 7 dias
  ingestion_rate_mb: 4
  ingestion_burst_size_mb: 8
  max_query_series: 500
  reject_old_samples: true
  reject_old_samples_max_age: 24h

compactor:
  working_directory: /loki/compactor
  retention_enabled: true
  delete_request_store: filesystem

analytics:
  reporting_enabled: false
```

⚠️ **`retention_period: 168h`** (7 dias) é a linha mais importante deste arquivo. Sem
retenção configurada, o Loki guarda logs **para sempre** e enche o disco — que é o modo
de falha nº 1 de VPS pequeno, mencionado desde a [Fase 2](04-fase-2-docker.md). Sete dias
são suficientes para investigar quase qualquer incidente. Se seu disco for apertado,
reduza para 72h.

**`auth_enabled: false`** é seguro *porque* o Loki está numa rede `internal` sem acesso
externo. Se um dia você expuser o Loki, isso precisa mudar — sem autenticação, qualquer um
lê todos os seus logs, que frequentemente contêm dados sensíveis.

### 8.4 — Configuração do Alloy

`/opt/stack/observability/alloy/config.alloy`:

```hcl
// ---------- METRICAS ----------

prometheus.scrape "infra" {
  targets = [
    { __address__ = "node-exporter:9100", job = "node" },
    { __address__ = "cadvisor:8080",      job = "cadvisor" },
  ]
  scrape_interval = "30s"
  forward_to = [prometheus.remote_write.victoria.receiver]
}

prometheus.scrape "apps" {
  targets = [
    { __address__ = "hello-api:3000", job = "hello-api", instance = "hello-api" },
  ]
  metrics_path    = "/metrics"
  scrape_interval = "30s"
  forward_to = [prometheus.remote_write.victoria.receiver]
}

prometheus.remote_write "victoria" {
  endpoint {
    url = "http://victoriametrics:8428/api/v1/write"
  }
}

// ---------- LOGS ----------

discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
  refresh_interval = "30s"
}

discovery.relabel "containers" {
  targets = discovery.docker.containers.targets

  rule {
    source_labels = ["__meta_docker_container_name"]
    regex         = "/(.*)"
    target_label  = "container"
  }
  rule {
    source_labels = ["__meta_docker_container_log_stream"]
    target_label  = "stream"
  }
}

loki.source.docker "containers" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.relabel.containers.output
  labels     = { job = "docker" }
  forward_to = [loki.write.default.receiver]
}

loki.write "default" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}
```

**`scrape_interval = "30s"`** em vez do padrão de 15s: metade dos pontos de dados,
metade do armazenamento e da CPU. Para um servidor pessoal, 30 segundos de granularidade
é mais que suficiente.

⚠️ **Cuidado com cardinalidade.** Cada combinação única de labels vira uma série temporal
separada, e séries consomem memória. Um label com valor de alta variabilidade — ID de
usuário, ID de requisição, caminho de URL com parâmetros — cria milhares de séries e
derruba o VictoriaMetrics. Esta é a forma mais comum de destruir uma stack de métricas.
Mantenha labels com poucos valores possíveis: `job`, `container`, `status`, `method`.

### 8.5 — Datasources do Grafana

`/opt/stack/observability/grafana/provisioning/datasources/ds.yml`:

```yaml
apiVersion: 1

datasources:
  - name: VictoriaMetrics
    type: prometheus
    access: proxy
    url: http://victoriametrics:8428
    isDefault: true
    jsonData:
      timeInterval: "30s"

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
```

Provisionar por arquivo em vez de configurar pela interface significa que sua
configuração é versionável e reproduzível — recriar o Grafana do zero não exige refazer
nada à mão.

O VictoriaMetrics é declarado como tipo `prometheus` porque implementa a mesma API. Essa
compatibilidade é o que permite usar dashboards prontos da comunidade sem adaptação.

### 8.6 — O compose

`/opt/stack/observability/docker-compose.yml`:

```yaml
services:
  victoriametrics:
    image: victoriametrics/victoria-metrics:v1.106.1
    container_name: victoriametrics
    restart: unless-stopped
    command:
      - "--storageDataPath=/storage"
      - "--retentionPeriod=30d"
      - "--memory.allowedPercent=60"
      - "--search.maxUniqueTimeseries=100000"
    volumes:
      - vmdata:/storage
    networks:
      - observability
    mem_limit: 256m
    memswap_limit: 256m
    security_opt:
      - no-new-privileges:true

  loki:
    image: grafana/loki:3.3.0
    container_name: loki
    restart: unless-stopped
    command: -config.file=/etc/loki/config.yml
    volumes:
      - ./loki/config.yml:/etc/loki/config.yml:ro
      - lokidata:/loki
    networks:
      - observability
    mem_limit: 256m
    memswap_limit: 256m
    user: "10001:10001"
    security_opt:
      - no-new-privileges:true

  alloy:
    image: grafana/alloy:v1.5.0
    container_name: alloy
    restart: unless-stopped
    command:
      - run
      - --server.http.listen-addr=0.0.0.0:12345
      - /etc/alloy/config.alloy
    volumes:
      - ./alloy/config.alloy:/etc/alloy/config.alloy:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - alloydata:/var/lib/alloy/data
    networks:
      - observability
      - edge          # para raspar /metrics das apps
    mem_limit: 128m
    memswap_limit: 128m
    security_opt:
      - no-new-privileges:true

  cadvisor:
    image: gcr.io/cadvisor/cadvisor:v0.49.1
    container_name: cadvisor
    restart: unless-stopped
    command:
      - "--housekeeping_interval=30s"
      - "--docker_only=true"
      - "--store_container_labels=false"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
    devices:
      - /dev/kmsg
    networks:
      - observability
    mem_limit: 160m
    memswap_limit: 160m
    privileged: true

  node-exporter:
    image: prom/node-exporter:v1.8.2
    container_name: node-exporter
    restart: unless-stopped
    command:
      - "--path.rootfs=/host"
      - "--collector.disable-defaults"
      - "--collector.cpu"
      - "--collector.meminfo"
      - "--collector.filesystem"
      - "--collector.loadavg"
      - "--collector.netdev"
      - "--collector.diskstats"
    pid: host
    volumes:
      - /:/host:ro,rslave
    networks:
      - observability
    mem_limit: 32m
    memswap_limit: 32m

  grafana:
    image: grafana/grafana:11.4.0
    container_name: grafana
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
      GF_USERS_ALLOW_SIGN_UP: "false"
      GF_ANALYTICS_REPORTING_ENABLED: "false"
      GF_ANALYTICS_CHECK_FOR_UPDATES: "false"
      GF_SECURITY_COOKIE_SECURE: "true"
      GF_SECURITY_STRICT_TRANSPORT_SECURITY: "true"
      GF_INSTALL_PLUGINS: ""
    volumes:
      - grafanadata:/var/lib/grafana
      - ./grafana/provisioning:/etc/grafana/provisioning:ro
    networks:
      - observability
    mem_limit: 256m
    memswap_limit: 256m
    security_opt:
      - no-new-privileges:true
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.grafana.rule=Host(`grafana.SEUDOMINIO.com`)"
      - "traefik.http.routers.grafana.entrypoints=websecure"
      - "traefik.http.routers.grafana.tls.certresolver=letsencrypt"
      - "traefik.http.services.grafana.loadbalancer.server.port=3000"
      # 🔒 Dupla autenticacao: basic auth do Traefik + login do Grafana
      - "traefik.http.routers.grafana.middlewares=internal-auth@file,rate-limit-strict@file"

volumes:
  vmdata:
  lokidata:
  alloydata:
  grafanadata:

networks:
  observability:
    external: true
  edge:
    external: true
```

⚠️ **`cadvisor` com `privileged: true`** é o ponto fraco desta stack. Ele precisa de
acesso profundo ao host para ler estatísticas de containers e cgroups. Um container
privilegiado é essencialmente root no host. As mitigações: `--docker_only=true` reduz o
que ele coleta, ele está numa rede sem acesso externo, e a imagem é oficial do Google.
**Se isso te incomodar** — e é razoável que incomode — o node-exporter sozinho já dá
métricas de host, e você perde apenas o detalhamento por container. É uma troca defensável.

**`--memory.allowedPercent=60`** no VictoriaMetrics: ele detecta o limite do cgroup e usa
no máximo 60% para cache, deixando margem. Sem isso, ele tenta usar tudo e é morto pelo
OOM.

🔒 **Grafana com dupla autenticação** — basic auth no Traefik **e** login do Grafana. Se
uma falha (senha fraca, CVE no Grafana), a outra ainda protege. O Grafana já teve
vulnerabilidades de bypass de autenticação; a camada extra é barata.

### 8.7 — Subir

```bash
# 🖥️ servidor
cd /opt/stack/observability
docker compose up -d
docker compose ps
sleep 60
docker stats --no-stream
```

### 8.8 — Dashboards

Acesse o Grafana e importe por ID em **Dashboards → New → Import**:

| ID | Dashboard | Serve para |
|---|---|---|
| **1860** | Node Exporter Full | CPU, RAM, disco, rede do host |
| **19792** | VictoriaMetrics single-node | Saúde da própria stack de métricas |
| **13639** | Logs / App | Exploração de logs no Loki |
| **193** | Docker monitoring (cAdvisor) | Recursos por container |

Depois crie um dashboard próprio com os quatro painéis que realmente importam no dia a
dia:

```promql
# 1. RAM por container, em % do limite
100 * container_memory_working_set_bytes{name!=""}
  / container_spec_memory_limit_bytes{name!=""}

# 2. Disco livre em %
100 * node_filesystem_avail_bytes{mountpoint="/"}
  / node_filesystem_size_bytes{mountpoint="/"}

# 3. Requisicoes por segundo, por status
sum by (status) (rate(http_requests_total[5m]))

# 4. Swap em uso
node_memory_SwapTotal_bytes - node_memory_SwapFree_bytes
```

O painel 4 merece destaque: **swap em uso constante é o sinal precoce** de que você está
sem RAM. Ele aparece antes do OOM killer agir, dando tempo de reagir.

### 8.9 — Os três alertas que importam

Em **Alerting → Alert rules**. Menos é mais: alerta demais gera fadiga, e alerta ignorado
é pior que alerta ausente.

**1. Disco acima de 80%** — o mais importante de todos:

```promql
100 - (100 * node_filesystem_avail_bytes{mountpoint="/"}
  / node_filesystem_size_bytes{mountpoint="/"}) > 80
```
Por 10 minutos. Disco cheio derruba Postgres, Traefik e Loki simultaneamente, e o sistema
fica difícil até de diagnosticar porque nada consegue escrever. 80% te dá dias de margem.

**2. Container perto do limite de memória:**

```promql
100 * container_memory_working_set_bytes{name!=""}
  / container_spec_memory_limit_bytes{name!=""} > 90
```
Por 5 minutos. Antecipa o OOM kill.

**3. Aplicação fora do ar:**

```promql
up{job="hello-api"} == 0
```
Por 2 minutos. Dois minutos evita alarme durante um deploy normal.

**Onde receber:** configure um contact point. Telegram é o mais prático (crie um bot com
o @BotFather, use o webhook), Discord também funciona. E-mail exige SMTP externo — veja a
nota abaixo sobre não enviar e-mail pelo VPS.

⚠️ **Não configure o alerta para enviar e-mail pelo próprio servidor.** A porta 25 é
bloqueada pela maioria dos provedores, e o IP de VPS tem má reputação — a mensagem não
chega. Use um serviço transacional (Resend, Brevo, SES) ou, mais simples, Telegram.

---

## Alternativa mais leve

Se ~1.1GB for demais, três caminhos:

**A) Grafana Cloud (free tier) + Alloy local — ~130MB.** Você mantém só o Alloy no VPS,
enviando métricas e logs para a nuvem. O free tier oferece 10k séries e 50GB de logs, mais
que suficiente. Ganho extra: se o VPS morrer, você ainda tem os dados para entender **por
que** ele morreu — o que é impossível quando a observabilidade morre junto. O contra é
depender de terceiro e aprender menos de operação.

**B) Só o essencial — ~150MB.** Dozzle (visualizador de logs em tempo real, ~20MB) +
Uptime Kuma (monitor de disponibilidade, ~100MB) + node-exporter. Você perde histórico e
consultas, mas sabe se está no ar e consegue ler logs.

**C) Cortar o cAdvisor — economiza 160MB.** Mantém host, logs e métricas de aplicação;
perde só o detalhamento por container. Bom meio-termo, e resolve também a questão do
`privileged: true`.

---

## Por que não fazer diferente

**"Por que VictoriaMetrics e não Prometheus?"** — Mesma linguagem de consulta (PromQL),
mesma API, dashboards compatíveis. VictoriaMetrics usa cerca de metade da memória e
comprime melhor em disco. Em 4GB, essa diferença é decisiva. O Prometheus tem ecossistema
maior e é o que você encontra em vagas — mas como a interface é idêntica, o que você
aprende transfere integralmente. Ver [ADR-005](adr/005-victoriametrics.md).

**"Por que Loki e não Elasticsearch/ELK?"** — Elasticsearch precisa de 1–2GB só para a
JVM. Está fora de questão. Além do tamanho, o Loki indexa apenas labels, não o conteúdo
dos logs — o que o torna muito mais barato ao custo de buscas full-text mais lentas. Para
o volume de um servidor pessoal, a diferença de velocidade é imperceptível.

**"Por que Alloy e não Promtail + vmagent?"** — Alloy substitui os dois, economizando
~70MB e um arquivo de configuração. Promtail, aliás, está em modo de manutenção — o Grafana
direcionou o desenvolvimento para o Alloy. A sintaxe (HCL) é diferente do YAML e leva um
tempo para acostumar.

**"Por que não Netdata, que é um container só?"** — Netdata é excelente e dá dashboards
lindos imediatamente, com quase zero configuração. Duas ressalvas: o histórico local é
curto (para reter mais, você paga a nuvem deles), e ele não agrega logs. Se seu objetivo
fosse só "ver se está tudo bem agora", Netdata seria a escolha mais eficiente. Como você
quer aprender a stack padrão do mercado, Grafana faz mais sentido.

**"Por que não adicionar traces (OpenTelemetry/Tempo)?"** — Traces brilham quando há
várias apps chamando umas às outras e você precisa achar onde o tempo foi gasto. Com uma
aplicação, o custo (mais ~200MB) não se justifica. É o próximo degrau natural.

---

## Como garantir que está certo

**Tudo no ar dentro do orçamento:**

```bash
# 🖥️ servidor
docker stats --no-stream --format "table {{.Name}}\t{{.MemUsage}}\t{{.MemPerc}}"
free -h
```
→ Esperado: soma da stack de observabilidade abaixo de ~800MB reais; total do servidor
abaixo de 2.5GB; swap em `0B` ou próximo.

**O Alloy está coletando:**

```bash
# 🖥️ servidor
docker exec alloy wget -qO- http://localhost:12345/metrics | grep -c prometheus_
```
→ Esperado: número maior que zero.

**O VictoriaMetrics tem dados:**

```bash
# 🖥️ servidor
docker exec alloy wget -qO- 'http://victoriametrics:8428/api/v1/query?query=up' | head -c 500
```
→ Esperado: JSON com `"status":"success"` e resultados com `"value"`.

**As métricas da sua aplicação chegaram** — o teste que valida a ponta a ponta:

```bash
# 🖥️ servidor
docker exec alloy wget -qO- \
  'http://victoriametrics:8428/api/v1/query?query=http_requests_total' | head -c 500
```
→ Esperado: dados com label `job="hello-api"`. Se vier vazio: a app não está na rede que
o Alloy alcança, ou o `/metrics` não responde, ou o nome no `config.alloy` está errado.

**Os logs estão chegando ao Loki:**

```bash
# 🖥️ servidor
docker exec alloy wget -qO- \
  'http://loki:3100/loki/api/v1/labels' | head -c 300
```
→ Esperado: JSON listando labels incluindo `container` e `job`.

**Grafana acessível e protegido:** 🔒

```bash
# 💻 local
curl -sI https://grafana.SEUDOMINIO.com
```
→ Esperado: `401 Unauthorized` (basic auth do Traefik). Se retornar `200` ou a tela de
login do Grafana direto, o middleware não foi aplicado.

🔒 **Nenhum componente interno está exposto** — teste crítico:

```bash
# 💻 local (PowerShell)
Test-NetConnection SEU_IP -Port 8428
Test-NetConnection SEU_IP -Port 3100
Test-NetConnection SEU_IP -Port 8080
Test-NetConnection SEU_IP -Port 9100
```
→ Esperado: `False` em todas. VictoriaMetrics e Loki sem autenticação expostos
significam que qualquer um lê suas métricas e logs — que costumam conter muito mais
informação sensível do que se imagina.

**A retenção está configurada:**

```bash
# 🖥️ servidor
docker exec loki wget -qO- http://localhost:3100/config 2>/dev/null | grep -A2 retention
```
→ Esperado: `retention_period: 168h`. Se vier `0s`, o disco vai encher.

**Um alerta realmente dispara** — teste antes de confiar:

```bash
# 🖥️ servidor — gera 500MB de lixo para acionar o alerta de disco
fallocate -l 500M /tmp/teste-disco
```
Aguarde o período de avaliação e confirme que a notificação chegou ao seu Telegram.
```bash
# 🖥️ servidor
rm /tmp/teste-disco
```
Ajuste o tamanho conforme o espaço livre do seu servidor. Um alerta que nunca foi testado
é um alerta que você não sabe se funciona.

---

## Armadilhas comuns

**Loki enchendo o disco.** Retenção não configurada ou compactor desligado. Confira as
duas coisas no `config.yml`.

**Explosão de cardinalidade.** Um label com valores únicos por requisição cria milhares
de séries. Sintoma: VictoriaMetrics consumindo cada vez mais memória até morrer.
Diagnostique com `/api/v1/status/tsdb`, que lista os labels de maior cardinalidade.

**cAdvisor consumindo mais que o esperado.** Sem `--docker_only=true` e
`--housekeeping_interval`, ele monitora tudo com alta frequência. Se continuar pesado,
remova — ver alternativa C.

**Grafana pedindo para trocar a senha e você perdeu o `.env`.** A senha do admin fica no
banco interno do Grafana. Recuperação:
`docker exec -it grafana grafana-cli admin reset-admin-password NOVA_SENHA`.

**Alloy não encontra as apps.** Ele precisa estar na mesma rede — por isso está em
`observability` **e** `edge`. Confira com
`docker exec alloy wget -qO- http://hello-api:3000/metrics`.

**Cifrão do hash bcrypt quebrando o basic auth.** No compose ou em YAML processado pelo
Compose, `$` precisa ser `$$`. Sintoma: 401 mesmo com a senha certa.

**Dashboard importado sem dados.** Quase sempre o datasource selecionado na importação
está errado, ou o dashboard espera nomes de métricas de uma versão diferente do exporter.

---

## Para estudar

- 🆓 **Grafana Loki docs: "Best practices"** — a página sobre labels explica cardinalidade
  melhor que qualquer outra fonte. Leia antes de criar labels próprios.
- 🆓 **VictoriaMetrics docs** — o README principal já cobre os parâmetros de memória e
  retenção que você usou.
- 🆓 **Prometheus docs: "Querying basics"** — PromQL vale aprender de verdade; funciona
  igual no VictoriaMetrics. Comece por `rate()`, `sum by()` e `histogram_quantile()`.
- 🆓 **Grafana Alloy docs** — a sintaxe HCL e os componentes disponíveis. A seção de
  migração do Promtail ajuda a traduzir exemplos antigos.
- 🆓 **Google SRE Book, capítulo 6 "Monitoring Distributed Systems"** — gratuito online.
  Define os "quatro sinais de ouro" (latência, tráfego, erros, saturação) e explica por
  que alertar em sintomas, não em causas. É o capítulo mais formativo sobre o assunto.
- 🆓 **"My Philosophy on Alerting"** (Rob Ewaschuk) — o documento que originou o capítulo
  acima. Curto, e muda como você pensa sobre alertas.
- 💰 **"Observability Engineering"** (Majors, Fong-Jones, Miranda) — o livro de referência
  moderno; explica bem a diferença entre monitoramento e observabilidade.
- 🆓 **Canal Grafana (YouTube)** — os vídeos de introdução ao Loki e ao Alloy são curtos e
  mostram a configuração na prática.
