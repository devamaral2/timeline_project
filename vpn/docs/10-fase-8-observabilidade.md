# Fase 8 — Grafana Cloud e Alloy

## Objetivo

Coletar métricas do host, containers e API, além dos logs Docker, com um único Alloy de
192 MiB. Os dados são enviados ao Grafana Cloud; Grafana, Loki, VictoriaMetrics,
cAdvisor e node-exporter não viram containers separados no caminho padrão.

Além de economizar RAM, observabilidade externa continua disponível quando o VPS inteiro
cai — justamente quando os dados são mais necessários.

## Arquitetura

```text
prometheus.exporter.unix -----+
prometheus.exporter.cadvisor -+--> Alloy --> Grafana Cloud Metrics
api:3001/metrics -------------+

Docker logs ----------------------> Alloy --> Grafana Cloud Logs
```

Os exporters são componentes internos do Alloy. Isso não elimina o acesso privilegiado
necessário para observar Docker: o socket e partes do filesystem do host ainda são
montados read-only e precisam ser tratados como superfície sensível.

## 8.1 — Conta e credenciais

Crie uma stack Grafana Cloud e, na página de envio de métricas/logs, gere tokens somente
com permissão de escrita. Não fixe cotas no documento: consulte os
[limites oficiais](https://grafana.com/docs/grafana-cloud/platform/pricing-and-usage/usage-limits/)
antes da instalação.

`/opt/stack/observability/.env`, modo `600`:

```dotenv
GRAFANA_CLOUD_METRICS_URL=https://prometheus-REGIAO.grafana.net/api/prom/push
GRAFANA_CLOUD_METRICS_USER=ID_DA_INSTANCIA
GRAFANA_CLOUD_METRICS_TOKEN=TOKEN_SOMENTE_ESCRITA
GRAFANA_CLOUD_LOGS_URL=https://logs-REGIAO.grafana.net/loki/api/v1/push
GRAFANA_CLOUD_LOGS_USER=ID_DA_INSTANCIA
GRAFANA_CLOUD_LOGS_TOKEN=TOKEN_SOMENTE_ESCRITA
```

Não reutilize token de administrador. Rotacione um token por vez e confirme ingestão
antes de revogar o anterior.

## 8.2 — Configuração do Alloy

`/opt/stack/observability/config.alloy`:

```hcl
logging {
  level  = "info"
  format = "json"
}

prometheus.remote_write "cloud" {
  endpoint {
    url = sys.env("GRAFANA_CLOUD_METRICS_URL")
    basic_auth {
      username = sys.env("GRAFANA_CLOUD_METRICS_USER")
      password = sys.env("GRAFANA_CLOUD_METRICS_TOKEN")
    }
    queue_config {
      capacity             = 2500
      max_shards           = 2
      max_samples_per_send = 500
    }
  }
}

prometheus.exporter.unix "host" {
  procfs_path = "/host/proc"
  sysfs_path  = "/host/sys"
  rootfs_path = "/host/root"
  set_collectors = ["cpu", "diskstats", "filesystem", "loadavg", "meminfo", "netdev", "stat", "time", "uname", "vmstat"]
}

prometheus.scrape "host" {
  targets         = prometheus.exporter.unix.host.targets
  scrape_interval = "30s"
  forward_to      = [prometheus.remote_write.cloud.receiver]
}

prometheus.exporter.cadvisor "containers" {
  docker_host      = "unix:///var/run/docker.sock"
  storage_duration = "5m"
}

prometheus.scrape "containers" {
  targets         = prometheus.exporter.cadvisor.containers.targets
  scrape_interval = "30s"
  forward_to      = [prometheus.remote_write.cloud.receiver]
}

prometheus.scrape "api" {
  targets = [{
    __address__ = "api:3001",
    job         = "api",
    instance    = "api",
  }]
  metrics_path    = "/metrics"
  scrape_interval = "30s"
  forward_to      = [prometheus.remote_write.cloud.receiver]
}

discovery.docker "containers" {
  host = "unix:///var/run/docker.sock"
}

discovery.relabel "docker_logs" {
  targets = []
  rule {
    source_labels = ["__meta_docker_container_name"]
    regex         = "/(.*)"
    target_label  = "service_name"
  }
}

loki.source.docker "containers" {
  host          = "unix:///var/run/docker.sock"
  targets       = discovery.docker.containers.targets
  labels        = {platform = "docker", environment = "production"}
  relabel_rules = discovery.relabel.docker_logs.rules
  forward_to    = [loki.write.cloud.receiver]
}

loki.write "cloud" {
  endpoint {
    url = sys.env("GRAFANA_CLOUD_LOGS_URL")
    basic_auth {
      username = sys.env("GRAFANA_CLOUD_LOGS_USER")
      password = sys.env("GRAFANA_CLOUD_LOGS_TOKEN")
    }
  }
}
```

Não transforme URL, user ID, event ID ou conteúdo de log em label. Use apenas labels de
baixa cardinalidade, como serviço e ambiente.

## 8.3 — Compose

`/opt/stack/observability/docker-compose.yml`:

```yaml
services:
  alloy:
    image: grafana/alloy:v1.18.0
    container_name: alloy
    restart: unless-stopped
    command:
      - run
      - --server.http.listen-addr=0.0.0.0:12345
      - --storage.path=/var/lib/alloy/data
      - /etc/alloy/config.alloy
    env_file: [.env]
    volumes:
      - ./config.alloy:/etc/alloy/config.alloy:ro
      - alloydata:/var/lib/alloy/data
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - /proc:/host/proc:ro
      - /sys:/host/sys:ro
      - /:/host/root:ro,rslave
    pid: host
    networks: [edge, observability]
    mem_limit: 192m
    memswap_limit: 192m
    read_only: true
    tmpfs: [/tmp]
    security_opt: [no-new-privileges:true]

volumes:
  alloydata:

networks:
  edge: {external: true}
  observability: {external: true}
```

Não publique 12345. Para abrir a UI de diagnóstico, use túnel SSH e um bind temporário no
loopback, ou `docker exec`.

Depois que a stack estiver estável, colocar um Docker socket proxy entre Alloy/Traefik e
o socket real reduz as operações disponíveis se um desses containers for comprometido.

## 8.4 — Dashboards e alertas

Configure ao menos:

- RAM por container como percentual do `mem_limit`;
- RAM, load, disco e swap do host;
- taxa HTTP da API por status e rota normalizada;
- reinícios e desaparecimento de containers;
- volume/erro de envio do próprio Alloy.

Alertas mínimos:

1. disco acima de 80% por dez minutos;
2. container acima de 80% do limite por cinco minutos;
3. web indisponível externamente por dois minutos;
4. `up{job="api"} == 0` por dois minutos;
5. swap em uso contínuo por dez minutos;
6. Alloy sem enviar dados ou token recusado.

Use Synthetic Monitoring ou outra sonda externa para `https://app.SEUDOMINIO.com/health`.
Uma sonda dentro do próprio VPS não detecta a queda completa do host.

## 8.5 — Validação

```bash
cd /opt/stack/observability
docker compose config
docker compose up -d
docker compose logs --tail 100 alloy
docker stats --no-stream alloy
docker exec alloy wget -qO- http://api:3001/metrics | head
```

No Grafana Cloud, confirme dados recentes para:

```promql
up{job="api"}
node_memory_MemAvailable_bytes
container_memory_working_set_bytes{name!=""}
```

Em logs, filtre `service_name="api"` e `service_name="web"`. Gere uma requisição de teste
e confirme que ela aparece sem token, cabeçalho Authorization ou dados pessoais.

Simule falha de credencial trocando temporariamente um token por valor inválido; o Alloy
deve registrar 401/403 e o alerta de ausência de ingestão deve disparar. Restaure o token
e confirme recuperação.

## Medição de sete dias

Por sete dias após o primeiro deploy, acompanhe picos e uso sustentado. Registre no
checklist máximo observado de web, API, PostgreSQL, Redis, Alloy e Traefik.

Reconsidere limites quando:

- qualquer container sustentar mais de 80%;
- houver OOM/restart;
- swap permanecer usado;
- a folga medida ficar abaixo de 1 GiB.

## Alternativa local, não padrão

Grafana + VictoriaMetrics + Loki podem ser reinstalados localmente para estudo ou por
exigência de soberania. Isso adiciona aproximadamente 768 MiB de limites e reduz a folga
com os dois serviços futuros para menos de 1 GiB. A decisão exige atualizar o orçamento,
backup dos volumes, retenção e ADR-005 antes do deploy.

## Armadilhas comuns

**Token com permissão ampla.** Use somente write e armazene em `.env` modo `600`.

**Alloy sem acesso à API.** Ele precisa participar da rede `edge`; `/metrics` continua
sem router público.

**Cardinalidade explosiva.** IDs e URLs concretas em labels consomem séries rapidamente.

**Confiar apenas em monitor interno.** Se o VPS cair, o monitor cai junto. Mantenha uma
sonda externa.
