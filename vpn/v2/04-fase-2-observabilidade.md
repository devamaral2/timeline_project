# Fase 2 — Observabilidade no cluster

## 1. Objetivo

Alloy, VictoriaMetrics, VictoriaLogs, Tempo e Grafana rodando no namespace
`observability`, já coletando o host e os containers Docker que ainda servem produção,
com acesso por `port-forward` e retenção definida.

## 2. Por que isso existe

O v1 deixou a observabilidade para a última fase. Fazia sentido lá, porque a stack era
hospedada e a instalação era curta. Aqui a ordem se inverte por um motivo prático: as
fases 4 e 5 movem o banco e a aplicação de casa. Fazer isso sem enxergar latência, memória
e erro é migrar às cegas, e quando algo piorar você não vai saber se piorou.

Subir a observabilidade agora tem um segundo efeito, que é o mais valioso: durante as
fases 3 a 5, a stack nova coleta **os dois lados**. Você vê o Compose e o cluster no mesmo
gráfico, com a mesma régua. Isso transforma "parece que ficou mais lento" numa comparação.

A troca do Grafana Cloud pela stack local está registrada em
[`adr/105-observabilidade-local.md`](adr/105-observabilidade-local.md). O resumo: com
4 GiB, 1,1 GiB de stack local não cabia; com 16 GiB cabe, e o que se ganha é retenção
própria, LogsQL e — principalmente — **tracing**, que é o que faltava para diagnosticar
as rotas de IA.

O que se perde é o "sobrevive à queda do VPS". Isso é coberto pela sonda externa do passo
3.6, que é a única peça que continua fora do servidor. A lição do v1 continua valendo
inteira: um monitor dentro do VPS não detecta a queda do VPS.

## 3. Passo a passo

### 3.1 — Por que estes quatro componentes

| Papel | Escolha | Em vez de | Motivo |
|---|---|---|---|
| Métricas | VictoriaMetrics single-node | Prometheus | menos RAM para a mesma retenção, e ingere `remote_write` sem adaptação |
| Logs | VictoriaLogs | Loki | muito mais leve; o modelo de índice do Loki cobra caro por cardinalidade que aqui não existe |
| Traces | Tempo monolítico | Jaeger | integra melhor com o Grafana e usa storage local sem depender de objeto |
| Coleta | Alloy | Prometheus mais promtail mais otel-collector | um binário no lugar de três; e já é o que o v1 usava |

Manter o Alloy é deliberado: a configuração da
[Fase 8 do v1](../docs/10-fase-8-observabilidade.md) é ponto de partida, não lixo. O que
muda é o destino (local, não remoto) e o que se acrescenta (Kubernetes, OTLP, exporters
de banco).

### 3.2 — Volumes e retenção

```yaml
# observability/pvcs.yaml — trecho
apiVersion: v1
kind: PersistentVolumeClaim
metadata: {name: victoriametrics, namespace: observability}
spec:
  accessModes: [ReadWriteOnce]
  storageClassName: local-path
  resources: {requests: {storage: 20Gi}}
```

Retenções iniciais, a revisar com dado real na Fase 11:

| Sinal | Retenção | Volume | Motivo |
|---|---|---|---|
| Métricas | 90 dias | 20 GiB | comparação mês a mês, e a Fase 11 precisa comparar com a Fase 0 |
| Logs | 14 dias | 15 GiB | log serve para diagnóstico recente; o que precisa durar vira métrica |
| Traces | 3 dias | 10 GiB | trace é caro e só interessa perto do incidente |

⚠️ Some antes de aplicar: 45 GiB de PVC. Confira o `df -h /` da Fase 0. Disco cheio é a
causa de incidente mais comum do runbook do v1, e a observabilidade é a candidata número
um a enchê-lo — com a ironia de derrubar justamente quem avisaria.

### 3.3 — O que o Alloy coleta

Quatro origens, três delas novas em relação ao v1:

```text
node-exporter (host)           --+
kubelet / cAdvisor             --+
kube-state-metrics             --+--> Alloy --> VictoriaMetrics
/metrics dos pods anotados     --+
cAdvisor do Docker (fases 2-5) --+

logs dos pods                  --+--> Alloy --> VictoriaLogs
logs dos containers Docker     --+

OTLP :4317 / :4318             ----> Alloy --> Tempo
```

O `kube-state-metrics` é o que o v1 não tinha como ter. Ele expõe o **estado declarado**
do cluster, não o consumo: pod reiniciando, rollout travado, PVC enchendo e — o mais
útil — `kube_pod_container_status_last_terminated_reason`, que dá o alerta de `OOMKilled`
por container que o cAdvisor puro não consegue montar.

Durante as fases 2 a 5 o Alloy mantém **também** a coleta do Docker, para que o Compose
continue visível. Essa parte é removida na Fase 11.

### 3.4 — Regras de rotulagem

A advertência do v1 continua sendo a mais importante desta fase: não transforme URL,
user ID, event ID ou conteúdo de log em label.

Com Kubernetes há uma armadilha nova: o nome do pod contém um hash que muda a cada
rollout. Rotular por `pod` cria uma série de métrica nova a cada deploy, e em três meses o
VictoriaMetrics está guardando centenas de séries mortas. Rotule por `namespace`, `app` e
`container`; deixe o nome do pod como campo de log, não como label de métrica.

Labels permitidos: `namespace`, `app`, `container`, `environment`, `job` e `route`
normalizada, com `:id` no lugar do valor concreto.

### 3.5 — Acesso ao Grafana nesta fase

Ainda não há Ingress — ele é a Fase 3. Use `port-forward`:

```bash
# ☸️ cluster
kubectl -n observability port-forward svc/grafana 3000:3000
```

E abra `http://127.0.0.1:3000`. A senha inicial do admin entra por Secret, é trocada no
primeiro acesso, e o Grafana **não** ganha rota pública nesta fase.

O item 1.12 do checklist de segurança do v1 — dashboards internos nunca sem autenticação —
se aplica aqui inteiro. Um Grafana com admin/admin exposto é uma das formas mais rápidas
de perder um servidor.

### 3.6 — A sonda externa

A única peça que fica fora do servidor. Configure um monitor gratuito (UptimeRobot,
Better Stack, Grafana Cloud Synthetic Monitoring — o tier gratuito de qualquer um serve)
apontando para:

```text
https://app.SEUDOMINIO.com/health   a cada 60s, alerta apos 2 falhas
```

Com notificação para um canal que chega ao seu celular, não para e-mail que você lê no dia
seguinte. Se o VPS cair, esta é a **única** coisa que vai te avisar — Grafana, alertas e
métricas caem junto com ele.

## 4. Por que não fazer diferente

**Continuar no Grafana Cloud.** Continua sendo uma escolha correta, e é a certa se você
não quiser operar retenção, disco e upgrade de quatro componentes. Foi descartada aqui por
uma razão específica: com 16 GiB, a stack local cabe, e o motivo original da ADR-005 do v1
era exclusivamente memória. Se o custo de operação incomodar, voltar é fácil — o Alloy faz
`remote_write` para os dois destinos ao mesmo tempo.

**Prometheus em vez de VictoriaMetrics.** Prometheus é o padrão de fato e tem mais
material. Descartado por consumo: para 90 dias de retenção nesta escala, o VictoriaMetrics
usa uma fração da memória. A linguagem de consulta é a mesma (PromQL), então o aprendizado
transfere — que era a preocupação real.

**Loki em vez de VictoriaLogs.** Loki é mais conhecido e o LogQL aparece em mais vagas.
VictoriaLogs foi escolhido por peso e por não exigir o cuidado com cardinalidade de label
que o Loki exige. Se conhecer Loki for um objetivo em si, troque — o Alloy fala com os
dois e o resto da fase não muda.

**Pilha completa do `kube-prometheus-stack`.** Instala Prometheus, Alertmanager, Grafana,
node-exporter e kube-state-metrics de uma vez, com dezenas de dashboards prontos. É o
caminho mais rápido para ter tudo funcionando. Descartado porque tudo funcionando sem você
saber como é exatamente o que a seção 2 do [`00-convencoes.md`](00-convencoes.md) diz para
evitar — e porque ele traz um Prometheus junto.

**Deixar traces para depois.** Seria consistente com o v1. Mas traces são a razão principal
de trazer a stack para casa, e a Fase 8 depende do Tempo existir. Subir o Tempo agora, com
o cluster vazio, custa cinco minutos; subir depois, com produção em cima, custa uma janela.

## 5. Como garantir que está certo

```bash
# ☸️ cluster
kubectl -n observability get pods
```

Esperado: `alloy`, `victoriametrics`, `victorialogs`, `tempo`, `grafana` e
`kube-state-metrics` em `Running`, todos com `RESTARTS 0`.

```bash
# ☸️ cluster
kubectl -n observability get pvc
```

Esperado: três PVCs em `Bound`, somando 45 GiB.

No Grafana, com o `port-forward` ativo, confirme dado recente para:

```promql
up
node_memory_MemAvailable_bytes
kube_pod_container_status_restarts_total
container_memory_working_set_bytes
```

Esperado: `up` com uma série por alvo, todas em `1`; memória do host com valor plausível;
contador de reinícios existindo, ainda que zerado; e — a mais importante —
`container_memory_working_set_bytes` trazendo séries dos containers do **Compose**.

Se a última vier sem as séries do Compose, a coleta do Docker não está funcionando e você
perdeu a comparação que justifica esta fase vir antes das migrações.

Em logs, filtre por serviço e gere uma requisição de teste. Esperado: a linha aparece em
segundos, com o serviço correto, e **sem** token, cabeçalho de autorização ou dado pessoal.

Teste o caminho de traces antes de a aplicação existir no cluster: envie um span sintético
para `alloy:4317`. Esperado: o trace aparece no Tempo, consultável pelo Grafana, em menos
de um minuto. Se não aparecer, resolva agora — depurar OTLP com a aplicação junto é muito
pior.

Por fim, derrube a sonda de propósito: pare o `web` do Compose por dois minutos. Esperado:
notificação no seu celular dentro de três minutos, e resolução automática depois que o web
voltar. Uma sonda nunca testada é um monitor imaginário.

## 6. Armadilhas comuns

**PVC preso em `Pending`.** Com `local-path`, o volume só é criado quando o primeiro pod o
monta (`WaitForFirstConsumer`). `Pending` sem pod é normal; `Pending` com pod parado é
disco cheio ou `storageClassName` errado.

**Cardinalidade explodindo pelo nome do pod.** Descrito em 3.4. Sintoma: o
VictoriaMetrics cresce em memória a cada deploy e nunca volta.

**Alloy sem permissão no cluster.** Ele precisa de `ServiceAccount` com `ClusterRole` de
leitura em pods, nodes e endpoints. O erro contém `is forbidden` e o nome da service
account — explícito, mas fácil de confundir com problema de rede.

**Grafana com storage efêmero.** Sem PVC, todo dashboard criado na UI some no primeiro
restart. A Fase 6 resolve de vez versionando os dashboards no git; até lá, use PVC.

**Disco enchendo em silêncio.** Configure o alerta de disco acima de 80% **nesta fase**,
não na 8. É o alerta que protege a própria observabilidade.

**A sonda externa apontando para o IP.** Se ela apontar para o IP em vez do domínio, não
detecta problema de DNS nem de certificado — duas das falhas mais prováveis.

## 7. Para estudar

- 🆓 [Grafana Alloy — componentes](https://grafana.com/docs/alloy/latest/reference/components/) — a referência que você vai reabrir toda vez.
- 🆓 [VictoriaMetrics — Single-server docs](https://docs.victoriametrics.com/single-server-victoriametrics/)
- 🆓 [VictoriaLogs — LogsQL](https://docs.victoriametrics.com/victorialogs/logsql/)
- 🆓 [kube-state-metrics — lista de métricas](https://github.com/kubernetes/kube-state-metrics/tree/main/docs/metrics) — vale ler a lista inteira uma vez; metade dos alertas úteis está ali.
- 🆓 [Google SRE Book, cap. 4 — Service Level Objectives](https://sre.google/sre-book/service-level-objectives/) — base da Fase 8.
