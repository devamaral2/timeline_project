# Fase 5 — web e API no cluster, e o corte de produção

## 1. Objetivo

web e API rodando como Deployment com duas réplicas, probes, NetworkPolicy default-deny e
rolling update funcionando; o Traefik do cluster assumindo 80 e 443; certificados de
produção emitidos e HSTS ligado.

## 2. Por que isso existe

É o corte. Até aqui tudo foi montado ao lado; nesta fase o tráfego real muda de caminho.

O ganho concreto está na primeira "consequência negativa" que a
[ADR-001 do v1](../docs/adr/001-docker-compose-vs-k3s.md) aceitou: *"sem rolling updates de
verdade — há uma janela de indisponibilidade de alguns segundos no deploy"*. Com
`Deployment`, `readinessProbe` e `maxSurge`, essa janela fecha. O pod novo só entra na
rotação depois de responder `/ready`; o velho só sai depois. Não é uma melhoria de
conforto — é a diferença entre poder fazer deploy a qualquer hora e não poder.

O segundo ganho é a `readinessProbe` separada da `livenessProbe`. O healthcheck do Docker
fazia o trabalho dos dois com um comando só, e o Traefik do v1 tirava de rota o container
unhealthy. Funcionava, mas confundia duas perguntas diferentes: *está vivo?* e *pode
receber tráfego?*. A API já tem `/health` e `/ready` — esta fase finalmente usa os dois
para o que eles são.

E o terceiro, que só aparece meses depois: `kubectl rollout undo`. O rollback do v1 era
reescrever `RELEASE_SHA` num `.env.images` e rodar `up -d`. Agora há histórico de revisões
e um comando que volta uma.

## 3. Passo a passo

### 3.1 — Deployment da API

```yaml
# prod/api.yaml — trechos que importam
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate: {maxSurge: 1, maxUnavailable: 0}
  template:
    spec:
      priorityClassName: prod-default
      containers:
        - name: api
          image: ghcr.io/SEU_USUARIO/api:SHA
          env:
            - {name: NODE_ENV,  value: production}
            - {name: API_HOST,  value: "0.0.0.0"}
            - {name: PORT,      value: "3001"}
            - {name: NODE_OPTIONS, value: "--max-old-space-size=256"}
          resources:
            requests: {memory: 192Mi, cpu: 100m}
            limits:   {memory: 384Mi}
          startupProbe:
            httpGet: {path: /health, port: 3001}
            failureThreshold: 30
            periodSeconds: 2
          readinessProbe:
            httpGet: {path: /ready, port: 3001}
            periodSeconds: 5
          livenessProbe:
            httpGet: {path: /health, port: 3001}
            periodSeconds: 30
            failureThreshold: 3
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            capabilities: {drop: [ALL]}
```

`maxUnavailable: 0` é o que fecha a janela: o Kubernetes sobe a réplica nova **antes** de
derrubar a velha. Custa uma réplica a mais de memória durante o rollout — está no
orçamento.

`API_HOST: 0.0.0.0` é necessário e seguro aqui, pelo mesmo raciocínio do `env.ts`: o bind
em loopback protegia porque só o Next falava com a API na mesma máquina. Num pod, o
loopback é o próprio pod, e ninguém alcançaria a API. Quem protege agora é a
NetworkPolicy, que é uma regra melhor que um bind.

`NODE_OPTIONS` alinhado ao limite do container é a mesma lição do v1: o V8 tem um teto
próprio, e desalinhá-lo do cgroup produz mortes silenciosas. `256` para um limite de
`384Mi` deixa espaço para o resto do processo.

`startupProbe` é a peça que o Compose não tinha. Sem ela, a liveness começa a contar
durante a subida e mata um processo que só estava iniciando. Com ela, a aplicação ganha
até 60 segundos para subir, e a liveness só entra depois.

### 3.2 — Deployment do web

Igual em estrutura. As diferenças:

```yaml
env:
  - {name: BACKEND_URL, value: "http://api.prod.svc.cluster.local:3001"}
  - {name: HOSTNAME,    value: "0.0.0.0"}
  - {name: NODE_OPTIONS, value: "--max-old-space-size=320"}
resources:
  requests: {memory: 256Mi, cpu: 100m}
  limits:   {memory: 512Mi}
```

O `rewrites` do `next.config.ts` continua repassando `/api/*`; muda só o destino, que
agora é um Service do Kubernetes em vez de um nome de rede Docker. A direção de
dependência do `AGENTS.md` não é afetada — o web continua sem regra de negócio e sem
alcançar banco.

### 3.3 — NetworkPolicy default-deny

```yaml
# prod/netpol-default-deny.yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: {name: default-deny, namespace: prod}
spec:
  podSelector: {}
  policyTypes: [Ingress, Egress]
```

Uma política sem regra nenhuma nega tudo. A partir daí, cada conexão permitida é uma linha
escrita de propósito, conforme a tabela de
[`01-arquitetura-e-orcamento.md`](01-arquitetura-e-orcamento.md).

⚠️ Duas coisas quebram na hora e assustam: **DNS** e **egress externo**. O CoreDNS vive em
`kube-system`, então sem uma regra liberando a porta 53 para lá, nenhum pod resolve nome
nenhum — e o sintoma é `getaddrinfo EAI_AGAIN`, que parece problema de rede do provedor. O
Firebase Auth precisa de egress 443, e sem ele o login para de funcionar com erro de
timeout. Escreva as duas regras junto com a default-deny, no mesmo commit.

### 3.4 — HPA, com expectativa calibrada

```yaml
# prod/api-hpa.yaml
spec:
  scaleTargetRef: {kind: Deployment, name: api}
  minReplicas: 2
  maxReplicas: 4
  metrics:
    - type: Resource
      resource: {name: cpu, target: {type: Utilization, averageUtilization: 70}}
```

Seja honesto sobre o que isso faz num nó só: ele **não** cria capacidade. O que ele
resolve é concorrência — as rotas de IA passam a maior parte do tempo esperando resposta
do provider, e mais processos Node esperando em paralelo aumentam a vazão sem aumentar a
CPU usada. Para uma rota que faz cálculo pesado, o HPA aqui não ajudaria em nada.

`maxReplicas: 4` porque 4 × 384 MiB ainda cabe no orçamento. Subir esse número sem revisar
a tabela de RAM é como o HPA derruba um cluster.

### 3.5 — O corte

⚠️ Janela de indisponibilidade real. Faça na hora combinada na Fase 4.

```bash
# 1. ☸️ cluster — subir tudo e conferir ANTES de trocar as portas
kubectl -n prod apply -f prod/
kubectl -n prod rollout status deploy/api
kubectl -n prod rollout status deploy/web
kubectl -n prod port-forward svc/web 3000:3000
# testar em http://127.0.0.1:3000 : login, timeline, criar evento
```

Só prossiga se o teste manual passar. Testar depois de trocar as portas é testar com o
site fora.

```bash
# 2. 🖥️ servidor — parar o Compose de aplicacao e o proxy antigo
docker compose -f /opt/stack/apps/docker-compose.yml stop web api
docker compose -f /opt/stack/traefik/docker-compose.yml stop traefik
```

```bash
# 3. ☸️ cluster — Traefik do cluster assume 80/443
#    trocar hostPort 8080/8443 para 80/443 nos values e reaplicar
kubectl -n ingress rollout status deploy/traefik
```

```bash
# 4. ☸️ cluster — issuer de producao, host a host
#    trocar letsencrypt-staging por letsencrypt no Ingress de app.SEUDOMINIO.com
kubectl -n prod describe certificate app-tls | tail -20
```

```bash
# 5. 💻 local — so depois de o certificado de producao estar valido
curl -I https://app.SEUDOMINIO.com/health
```

Esperado: `200`, com certificado válido e sem aviso do navegador. **Agora** ligue o HSTS
(`stsSeconds: 31536000`) e remova o arquivo `bridge.yml` e o `insecureSkipVerify` da
Fase 3.

### 3.6 — Se der errado

O caminho de volta, que deve caber em dois minutos:

```bash
# ☸️ cluster
kubectl -n ingress scale deploy/traefik --replicas=0
```

```bash
# 🖥️ servidor
docker compose -f /opt/stack/traefik/docker-compose.yml start traefik
docker compose -f /opt/stack/apps/docker-compose.yml start api web
```

Isso volta ao estado da Fase 4. O banco é o novo, no cluster — por isso o `api.env` do
Compose precisa estar apontado para ele **antes** do corte, mesmo que a API do Compose
esteja parada. Um caminho de volta que exige editar configuração no meio da emergência não
é um caminho de volta.

O critério de aborto da Fase 0 vale aqui: se o p95 da timeline ficar acima do dobro do
baseline por mais de 24 horas, volte e investigue com calma.

## 4. Por que não fazer diferente

**Uma réplica em vez de duas.** Economiza 256 MiB e é o que muita instalação pequena faz.
Descartado porque com uma réplica o `maxUnavailable: 0` não tem como funcionar — não há
para onde mandar o tráfego durante o rollout — e o rolling update sem janela é o ganho
principal da fase. Com duas réplicas num nó só você não ganha tolerância a falha de
hardware, mas ganha deploy sem queda, que é o problema real do dia a dia.

**`Recreate` em vez de `RollingUpdate`.** Mais simples, e o comportamento do Compose.
Seria a escolha certa se a aplicação não tolerasse duas versões no ar ao mesmo tempo — o
caso clássico é uma migration incompatível. Como a migration da Fase 6 roda como Job antes
do rollout, e o schema é compatível entre versões adjacentes, `RollingUpdate` é seguro.

**Deixar a API sem `readOnlyRootFilesystem`.** Economiza um `emptyDir` em `/tmp` e evita
uma classe de erro chato. Mantido porque é o mesmo endurecimento que o v1 já aplicava no
Compose, e afrouxar na migração seria regredir em segurança sem discussão.

**Não usar HPA.** Perfeitamente razoável para este volume, e é uma peça a menos. Mantido
porque as rotas de IA têm perfil de espera longa e o custo é baixo — mas se ele nunca
disparar em três meses, remova. Componente que nunca age é componente que ninguém testa.

## 5. Como garantir que está certo

```bash
# ☸️ cluster
kubectl -n prod get deploy,pod
kubectl -n prod get pod -o jsonpath="{range .items[*]}{.metadata.name}{'  '}{.status.qosClass}{'\n'}{end}"
```

Esperado: `api 2/2`, `web 2/2`, pods em `Running`, QoS `Burstable` para web e api (limits
maiores que requests, de propósito) e `Guaranteed` para postgres e redis.

O teste que prova o objetivo da fase:

```bash
# ☸️ cluster — num terminal
kubectl -n prod rollout restart deploy/web
```

```bash
# 💻 local — noutro terminal, ao mesmo tempo
while true; do curl -s -o /dev/null -w "%{http_code}\n" https://app.SEUDOMINIO.com/health; sleep 0.3; done
```

Esperado: **só `200`**, nenhum `502` ou `503`. Se aparecer erro, o `maxUnavailable` ou a
`readinessProbe` estão errados — e é exatamente a janela que a ADR-001 do v1 aceitava.

```bash
# ☸️ cluster
kubectl -n prod rollout history deploy/api
kubectl -n prod rollout undo deploy/api --dry-run=client
```

Esperado: histórico com as revisões. Vale executar um `rollout undo` de verdade uma vez,
para saber que funciona antes de precisar dele.

```bash
# 💻 local
nmap -Pn -p 22,80,443,3000,3001,5432,6379,6443,8080,8443 SEU_IP
```

Esperado: `22`, `80` e `443` abertas; **todas as outras `filtered`**, incluindo a 8443 que
era temporária. Se ela continuar aberta, o `hostPort` antigo ficou para trás.

E a verificação de log, herdada do v1: gere uma requisição autenticada e confirme que ela
aparece no VictoriaLogs sem token, sem cabeçalho de autorização e sem dado pessoal.

## 6. Armadilhas comuns

**Tudo quebra ao aplicar a default-deny.** Descrito em 3.3. `EAI_AGAIN` é DNS; timeout no
login é egress 443 para o Firebase.

**`CrashLoopBackOff` com `EADDRINUSE` ou sem log nenhum.** Quase sempre `API_HOST` ainda em
`127.0.0.1`: o processo sobe, a probe não alcança, o kubelet mata. O log parece normal, o
que torna esse erro demorado de achar.

**Pod `Running` mas `0/1 READY` para sempre.** A readiness probe aponta para um caminho
que não existe ou para a porta errada. `kubectl describe pod` mostra o evento
`Readiness probe failed` com o código HTTP — que costuma ser 404, não erro de conexão.

**Rollout travado sem mensagem clara.** `kubectl rollout status` fica esperando; a causa
está em `kubectl describe pod` do pod novo. Com `maxUnavailable: 0`, um pod novo que nunca
fica ready trava o rollout **sem derrubar a produção** — que é o comportamento desejado,
mas parece que travou tudo.

**HSTS ligado antes do certificado de produção.** ⚠️ Descrito na Fase 3, repetido aqui
porque é neste passo que o erro acontece.

**Esquecer de parar o Compose de aplicação.** Dois `api` no ar, um deles escrevendo no
mesmo banco, com metade do comportamento vindo de uma versão que você achava desligada.

## 7. Para estudar

- 🆓 [Kubernetes — Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) — a seção de estratégia de rollout.
- 🆓 [Kubernetes — Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/) — as três probes e por que são três.
- 🆓 [Kubernetes — Horizontal Pod Autoscaling](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- 🆓 [Node.js — Docker e memória](https://nodejs.org/en/learn/getting-started/docker) — o alinhamento entre heap do V8 e limite do cgroup.
- 🆓 [Kubernetes — Security Context](https://kubernetes.io/docs/tasks/configure-pod-container/security-context/)
