# Deploy inicial e CI/CD de produção

Este roteiro parte do ponto em que você **já criou o Environment de produção e a
Service Account no 1Password**. Ao final, Web, API e Auth estarão no k3s de uma
VPS, e cada merge em `main` passará por CI e aprovação antes de atualizar a
produção. Execute os oito passos na ordem. As ações marcadas **VPS** são feitas
num shell Bash como `root` (`sudo -i`); **computador** é sua máquina; **painel** é
o navegador. Não cole senhas em comandos do GitHub Actions ou no Git.

Você precisa ter: uma VPS Ubuntu 22.04/24.04 com usuário SSH que tenha `sudo`,
um domínio ativo na Cloudflare, acesso de administrador ao repositório
`devamaral2/timeline_project`, e o token e o ID reais do Environment do
1Password. Este roteiro usa um nó único, Docker para construir imagens, k3s
para executá-las e Cloudflare Tunnel para publicá-las. Reserve cerca de 8 GiB
de RAM, 4 vCPU e 80 GiB de disco. O mobile não é implantado neste cluster.

Não avance se já houver um cluster, banco ou volumes com dados de produção na
VPS: primeiro identifique o que está rodando. Os comandos de criação de banco
abaixo são apenas para o primeiro uso de um volume vazio.

Se uma sessão SSH cair, reabra o shell root e execute `set -euo pipefail` e
`source /opt/braid/env.sh`. Depois de criar `generated.env`, execute também
`source /opt/braid/private/generated.env`. Não gere novas senhas para retomar.

## 1. Preparar VPS, domínio, Docker e k3s

**Painel:** confirme que o domínio está ativo na Cloudflare. Os endereços usados
serão `timeline`, `api`, `auth`, `grafana` e `rabbit` sob esse domínio. Não crie
registros A/AAAA apontando esses nomes para a VPS. O Tunnel criará os registros
quando as rotas forem cadastradas.

**VPS:** mantenha sua sessão SSH aberta e faça as verificações iniciais:

```bash
sudo -i
set -euo pipefail
cat /etc/os-release
uname -m
free -h
df -h /
if ! command -v ufw >/dev/null; then apt update && apt install -y ufw; fi
ufw status verbose
swapon --show
command -v docker || true
command -v k3s || true
ss -lntup
```

Se Docker ou k3s já estiverem instalados, confira o estado deles antes de
reconfigurá-los. Mantenha a regra de entrada do SSH. As portas 80/443, 5432,
5672, 6443 e 10250 da VPS não devem estar abertas à internet. O Tunnel inicia
conexões de saída; confirme também que a VPS pode sair para a internet,
inclusive pela porta 7844 TCP/UDP.

Se o UFW estiver **inactive**, descubra a porta SSH que você realmente usa,
libere-a e só então ative o firewall. Deixe a sessão atual aberta e confirme
outra conexão SSH antes de continuar:

```bash
if ufw status | grep -q inactive; then
  read -rp 'Porta SSH desta VPS: ' INITIAL_SSH_PORT
  [[ "$INITIAL_SSH_PORT" =~ ^[0-9]+$ ]] || exit 1
  ufw allow "$INITIAL_SSH_PORT/tcp"
  ufw enable
fi
ufw status verbose
```

**VPS:** salve os valores da instalação. Informe o *ID* do Environment, não só
seu nome de exibição. Troque o IP/interface padrão se forem diferentes na sua
VPS.

```bash
apt update
apt install -y ca-certificates curl git jq openssl dnsutils
install -d -m 0755 /opt/braid
install -d -m 0700 /opt/braid/private /opt/braid/backups
install -d -m 0755 /opt/braid/bin /opt/braid/k8s
umask 077
read -rp 'Domínio sem https://: ' DOMAIN
read -rp 'ID do Environment do 1Password: ' OP_ENVIRONMENT_ID
read -rp 'Interface pública [eth0]: ' PUB_IFACE
PUB_IFACE=${PUB_IFACE:-eth0}
read -rp 'IP IPv4 público: ' PUBLIC_IP
[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || exit 1
[[ -n "$OP_ENVIRONMENT_ID" && -n "$PUBLIC_IP" ]] || exit 1
ip -4 addr show "$PUB_IFACE" | grep -F "$PUBLIC_IP"
printf 'export DOMAIN=%q\nexport OP_ENVIRONMENT_ID=%q\nexport PUB_IFACE=%q\nexport PUBLIC_IP=%q\nexport KUBECONFIG=%q\n' \
  "$DOMAIN" "$OP_ENVIRONMENT_ID" "$PUB_IFACE" "$PUBLIC_IP" \
  /etc/rancher/k3s/k3s.yaml > /opt/braid/env.sh
chmod 600 /opt/braid/env.sh
source /opt/braid/env.sh
```

Se Docker não estiver instalado, instale-o. Se já estiver instalado e servindo
outros containers, avalie o efeito de reiniciá-lo antes de executar o bloco.

```bash
if ! docker version >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  . /etc/os-release
  printf 'Types: deb\nURIs: https://download.docker.com/linux/ubuntu\nSuites: %s\nComponents: stable\nArchitectures: %s\nSigned-By: /etc/apt/keyrings/docker.asc\n' \
    "$VERSION_CODENAME" "$(dpkg --print-architecture)" > /etc/apt/sources.list.d/docker.sources
  apt update
  apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  systemctl enable --now docker
fi
docker version
docker buildx version
```

Para preservar o encaminhamento de rede necessário aos pods, configure o
Docker. Se `/etc/docker/daemon.json` já tiver opções, o comando abaixo as
preserva; o backup fica em `/opt/braid/private`.

```bash
if test -f /etc/docker/daemon.json; then
  cp /etc/docker/daemon.json /opt/braid/private/docker-daemon.before.json
  jq '. + {"ip-forward-no-drop":true}' /etc/docker/daemon.json > /opt/braid/private/docker-daemon.new.json
else
  printf '%s\n' '{"ip-forward-no-drop":true}' > /opt/braid/private/docker-daemon.new.json
fi
dockerd --validate --config-file=/opt/braid/private/docker-daemon.new.json
install -m 0600 /opt/braid/private/docker-daemon.new.json /etc/docker/daemon.json
systemctl restart docker
```

Se k3s ainda não existir, instale-o com Traefik apenas interno. O arquivo do
Traefik precisa existir **antes** da primeira inicialização.

```bash
if ! command -v k3s >/dev/null; then
  install -d -m 0755 /etc/rancher/k3s /var/lib/rancher/k3s/server/manifests
  printf 'secrets-encryption: true\nnode-ip: "%s"\nflannel-iface: "%s"\ndisable:\n  - servicelb\nkubelet-arg:\n  - "fail-swap-on=false"\n' \
    "$PUBLIC_IP" "$PUB_IFACE" > /etc/rancher/k3s/config.yaml
  tee /var/lib/rancher/k3s/server/manifests/traefik-config.yaml >/dev/null <<'EOF'
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata: {name: traefik, namespace: kube-system}
spec:
  valuesContent: |-
    service:
      type: ClusterIP
EOF
  curl -fsSL https://get.k3s.io -o /opt/braid/install-k3s.sh
  INSTALL_K3S_CHANNEL=stable sh /opt/braid/install-k3s.sh
fi
source /opt/braid/env.sh
kubectl wait --for=condition=Ready nodes --all --timeout=300s
for attempt in $(seq 1 60); do
  if kubectl -n kube-system get deployment traefik >/dev/null 2>&1; then break; fi
  sleep 5
done
kubectl -n kube-system rollout status deployment/traefik --timeout=300s
kubectl -n kube-system get svc traefik
k3s --version > /opt/braid/k3s-version.txt
```

O Traefik deve ser `ClusterIP`, sem IP externo e sem pod `svclb-traefik`.
Verifique `ufw status numbered`: SSH deve continuar acessível, e 80/443,
6443/10250/8472 não devem ter regras públicas. Se o UFW estiver ativo, aplique
as regras de rede do nó único abaixo e confirme uma **segunda sessão SSH** antes
de fechar a primeira:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow in on cni0 from 10.42.0.0/16
ufw allow from 10.43.0.0/16
ufw default allow routed
ufw route insert 1 deny in on "$PUB_IFACE"
ufw insert 1 deny in on "$PUB_IFACE" to any port 6443 proto tcp
ufw insert 1 deny in on "$PUB_IFACE" to any port 10250 proto tcp
ufw insert 1 deny in on "$PUB_IFACE" to any port 8472 proto udp
ufw reload
ufw status verbose
```

Remova manualmente eventuais regras antigas que liberem 80/443, sem apagar a
regra de SSH. Não publique `kubeconfig` ou banco de dados fora da VPS.

## 2. Conferir o Environment de produção no 1Password

**Painel 1Password:** a Service Account precisa ter leitura do Environment
indicado em `/opt/braid/env.sh`. Confira os valores que serão consumidos:

| Uso | Variáveis no Environment |
| --- | --- |
| API | `DATABASE_URL`, `AUTH_SERVICE_URL`, `AUTH_INTERNAL_SERVICE_KEY`; opcionalmente `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `OPENROUTER_AGENT_MODEL` |
| Auth | `NODE_ENV=production`, `AUTH_DATABASE_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_PUBLIC_URL`, `AUTH_WEB_APP_URL`, `AUTH_KEY_ENCRYPTION_KEY`, `AUTH_INTERNAL_SERVICE_KEY`, `API_SERVICE_URL` |
| Build do Web | `BACKEND_URL`, `AUTH_SERVICE_URL` |

Use os seguintes destinos. `AUTH_INTERNAL_SERVICE_KEY` deve ser o **mesmo**
valor lido pela API e pelo Auth. As senhas dentro das URLs de banco precisam
ser as mesmas que serão usadas no passo 3.

```dotenv
DATABASE_URL=postgres://braid:<PG_APP_PASSWORD>@postgres.braid.svc.cluster.local:5432/braid
AUTH_DATABASE_URL=postgres://auth_runtime:<AUTH_RUNTIME_PASSWORD>@postgres.braid.svc.cluster.local:5432/braid_auth
AUTH_SERVICE_URL=http://auth.braid.svc.cluster.local:3002
API_SERVICE_URL=http://api.braid.svc.cluster.local:3001
BACKEND_URL=http://api.braid.svc.cluster.local:3001
AUTH_ISSUER=https://auth.SEUDOMINIO
AUTH_PUBLIC_URL=https://auth.SEUDOMINIO
AUTH_WEB_APP_URL=https://timeline.SEUDOMINIO
AUTH_AUDIENCE=timeline-api
NODE_ENV=production
```

Substitua `SEUDOMINIO` pelo domínio real. Se a senha do banco contém símbolos
reservados em URL, codifique-a na URL; use o valor original quando o terminal
pedir a senha no passo 3. Não inclua `ADMIN_PASSWORD`, `AUTH_TEST_DATABASE_URL`
nem dados locais no Environment de produção.

O token da Service Account será salvo **somente na VPS** e no Secret Kubernetes
dos pods. O GitHub não recebe o token ou as variáveis da aplicação. Se o
Environment ainda não tiver as URLs e chaves acima, complete-o antes de
prosseguir.

## 3. Criar Secrets, bancos, fila, observabilidade e Tunnel

**VPS:** crie namespaces. Gere uma vez as credenciais locais. Para
`PG_APP_PASSWORD`, `AUTH_RUNTIME_PASSWORD`, `AUTH_KEY_ENCRYPTION_KEY` e
`AUTH_INTERNAL_SERVICE_KEY`, digite os **valores já configurados no
1Password**. O arquivo de recuperação não é recriado numa nova sessão.

```bash
source /opt/braid/env.sh
for ns in braid observability edge; do
  kubectl create namespace "$ns" --dry-run=client -o yaml | kubectl apply -f -
done
test ! -e /opt/braid/private/generated.env || { echo 'generated.env já existe; carregue-o em vez de gerar outro'; exit 1; }
umask 077
read -rsp 'PG_APP_PASSWORD (valor da DATABASE_URL): ' PG_APP_PASSWORD; echo
read -rsp 'AUTH_RUNTIME_PASSWORD (valor da AUTH_DATABASE_URL): ' AUTH_RUNTIME_PASSWORD; echo
read -rsp 'AUTH_KEY_ENCRYPTION_KEY (valor do 1Password): ' AUTH_KEY_ENCRYPTION_KEY; echo
read -rsp 'AUTH_INTERNAL_SERVICE_KEY (valor do 1Password): ' AUTH_INTERNAL_SERVICE_KEY; echo
PG_ADMIN_PASSWORD=$(openssl rand -hex 24)
AUTH_OWNER_PASSWORD=$(openssl rand -hex 24)
RABBIT_PASSWORD=$(openssl rand -hex 24)
GRAFANA_PASSWORD=$(openssl rand -hex 24)
for name in PG_ADMIN_PASSWORD PG_APP_PASSWORD AUTH_OWNER_PASSWORD AUTH_RUNTIME_PASSWORD RABBIT_PASSWORD GRAFANA_PASSWORD AUTH_KEY_ENCRYPTION_KEY AUTH_INTERNAL_SERVICE_KEY; do
  printf 'export %s=%q\n' "$name" "${!name}"
done > /opt/braid/private/generated.env
chmod 600 /opt/braid/private/generated.env
```

Guarde `PG_ADMIN_PASSWORD`, `AUTH_OWNER_PASSWORD`, `RABBIT_PASSWORD` e
`GRAFANA_PASSWORD` no seu gerenciador de senhas. Se reconectar à VPS, use
`source /opt/braid/env.sh` e `source /opt/braid/private/generated.env`.

**VPS:** cadastre o token e os Secrets. A passphrase do backup deve ser nova e
guardada fora da VPS; perder essa passphrase impede restaurar os backups.

```bash
source /opt/braid/private/generated.env
read -rsp 'Token da Service Account do 1Password: ' OP_TOKEN; echo
printf '%s' "$OP_TOKEN" > /opt/braid/private/onepassword-token
unset OP_TOKEN
chmod 600 /opt/braid/private/onepassword-token
kubectl -n braid create secret generic onepassword-loader \
  --from-file=OP_SERVICE_ACCOUNT_TOKEN=/opt/braid/private/onepassword-token \
  --from-literal=OP_ENVIRONMENT_ID="$OP_ENVIRONMENT_ID" \
  --dry-run=client -o yaml | kubectl apply -f -
read -rsp 'Passphrase nova do backup: ' BACKUP_PASSPHRASE; echo
printf '%s' "$BACKUP_PASSPHRASE" > /opt/braid/private/backup-passphrase
unset BACKUP_PASSPHRASE
chmod 600 /opt/braid/private/backup-passphrase
kubectl -n braid create secret generic postgres-env \
  --from-literal=POSTGRES_USER=postgres \
  --from-literal=POSTGRES_PASSWORD="$PG_ADMIN_PASSWORD" \
  --from-literal=POSTGRES_DB=postgres \
  --from-literal=PG_APP_PASSWORD="$PG_APP_PASSWORD" \
  --from-literal=AUTH_OWNER_PASSWORD="$AUTH_OWNER_PASSWORD" \
  --from-literal=AUTH_RUNTIME_PASSWORD="$AUTH_RUNTIME_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n braid create secret generic rabbitmq-env \
  --from-literal=RABBITMQ_DEFAULT_USER=braid \
  --from-literal=RABBITMQ_DEFAULT_PASS="$RABBIT_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n observability create secret generic grafana-admin \
  --from-literal=admin-user=admin \
  --from-literal=admin-password="$GRAFANA_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -
```

**VPS:** crie PostgreSQL com volume persistente. O script de inicialização só
executa quando o volume está vazio. Nunca apague o PVC para corrigir uma senha.

```bash
tee /opt/braid/k8s/postgres.yaml >/dev/null <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata: {name: postgres-init, namespace: braid}
data:
  10-databases.sh: |
    #!/bin/sh
    set -eu
    psql -v ON_ERROR_STOP=1 \
      -v app_password="$PG_APP_PASSWORD" \
      -v owner_password="$AUTH_OWNER_PASSWORD" \
      -v runtime_password="$AUTH_RUNTIME_PASSWORD" \
      --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
      CREATE ROLE braid LOGIN PASSWORD :'app_password';
      CREATE DATABASE braid OWNER braid;
      CREATE ROLE auth_owner LOGIN PASSWORD :'owner_password';
      CREATE ROLE auth_runtime LOGIN PASSWORD :'runtime_password';
      CREATE DATABASE braid_auth OWNER auth_owner;
    SQL
---
apiVersion: v1
kind: Service
metadata: {name: postgres, namespace: braid}
spec:
  type: ClusterIP
  selector: {app: postgres}
  ports:
    - {name: postgres, port: 5432, targetPort: 5432}
---
apiVersion: apps/v1
kind: StatefulSet
metadata: {name: postgres, namespace: braid}
spec:
  serviceName: postgres
  replicas: 1
  selector:
    matchLabels: {app: postgres}
  template:
    metadata:
      labels: {app: postgres}
    spec:
      containers:
        - name: postgres
          image: postgres:17-alpine
          envFrom:
            - secretRef: {name: postgres-env}
          env:
            - {name: PGDATA, value: /var/lib/postgresql/data/pgdata}
          ports:
            - {containerPort: 5432}
          volumeMounts:
            - {name: data, mountPath: /var/lib/postgresql/data}
            - {name: init, mountPath: /docker-entrypoint-initdb.d}
          readinessProbe:
            exec:
              command: [sh, -c, 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"']
            initialDelaySeconds: 10
            periodSeconds: 5
          resources:
            requests: {cpu: 100m, memory: 256Mi}
            limits: {cpu: "1", memory: 1Gi}
      volumes:
        - name: init
          configMap: {name: postgres-init, defaultMode: 493}
  volumeClaimTemplates:
    - metadata: {name: data}
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: local-path
        resources:
          requests: {storage: 20Gi}
EOF
kubectl apply -f /opt/braid/k8s/postgres.yaml
kubectl -n braid rollout status statefulset/postgres --timeout=300s
kubectl -n braid get pvc
kubectl -n braid exec postgres-0 -- psql -U postgres -c '\l'
```

Confirme que `braid` e `braid_auth` aparecem e que o PVC está `Bound`. As
senhas no Environment do 1Password precisam corresponder exatamente às dos
usuários `braid` e `auth_runtime` criados aqui.

**VPS:** prepare RabbitMQ. Ainda não há consumidor de fila da aplicação; o
serviço faz parte da infraestrutura e do painel administrativo.

```bash
tee /opt/braid/k8s/rabbitmq.yaml >/dev/null <<'EOF'
apiVersion: v1
kind: Service
metadata: {name: rabbitmq, namespace: braid}
spec:
  type: ClusterIP
  selector: {app: rabbitmq}
  ports:
    - {name: amqp, port: 5672, targetPort: 5672}
    - {name: management, port: 15672, targetPort: 15672}
---
apiVersion: apps/v1
kind: StatefulSet
metadata: {name: rabbitmq, namespace: braid}
spec:
  serviceName: rabbitmq
  replicas: 1
  selector:
    matchLabels: {app: rabbitmq}
  template:
    metadata:
      labels: {app: rabbitmq}
    spec:
      containers:
        - name: rabbitmq
          image: rabbitmq:4-management-alpine
          envFrom:
            - secretRef: {name: rabbitmq-env}
          ports:
            - {containerPort: 5672}
            - {containerPort: 15672}
          volumeMounts:
            - {name: data, mountPath: /var/lib/rabbitmq}
          readinessProbe:
            exec:
              command: [rabbitmq-diagnostics, -q, ping]
            initialDelaySeconds: 20
            periodSeconds: 15
            timeoutSeconds: 10
          resources:
            requests: {cpu: 100m, memory: 256Mi}
            limits: {cpu: 500m, memory: 768Mi}
  volumeClaimTemplates:
    - metadata: {name: data}
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: local-path
        resources:
          requests: {storage: 5Gi}
EOF
kubectl apply -f /opt/braid/k8s/rabbitmq.yaml
kubectl -n braid rollout status statefulset/rabbitmq --timeout=300s
```

**VPS:** instale Grafana/Prometheus. A versão do chart é salva para permitir
recriar o mesmo conjunto. O backup do deploy usa esse registro.

```bash
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 -o /opt/braid/install-helm.sh
bash /opt/braid/install-helm.sh
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm show chart prometheus-community/kube-prometheus-stack > /opt/braid/monitoring-chart.yaml
awk '$1 == "version:" {print $2}' /opt/braid/monitoring-chart.yaml > /opt/braid/monitoring-version.txt
test -s /opt/braid/monitoring-version.txt
tee /opt/braid/k8s/monitoring-values.yaml >/dev/null <<EOF
alertmanager:
  enabled: false
kubeEtcd:
  enabled: false
kubeControllerManager:
  enabled: false
kubeScheduler:
  enabled: false
kubeProxy:
  enabled: false
prometheus:
  prometheusSpec:
    retention: 3d
    retentionSize: 8GB
    storageSpec:
      volumeClaimTemplate:
        spec:
          storageClassName: local-path
          accessModes: [ReadWriteOnce]
          resources:
            requests: {storage: 10Gi}
grafana:
  admin:
    existingSecret: grafana-admin
    userKey: admin-user
    passwordKey: admin-password
  persistence:
    enabled: true
    storageClassName: local-path
    size: 2Gi
  grafana.ini:
    server:
      root_url: https://grafana.$DOMAIN
  ingress:
    enabled: true
    ingressClassName: traefik
    annotations:
      traefik.ingress.kubernetes.io/router.entrypoints: web
    hosts:
      - grafana.$DOMAIN
prometheus-node-exporter:
  hostNetwork: false
  service:
    hostPort: null
EOF
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace observability --version "$(cat /opt/braid/monitoring-version.txt)" \
  -f /opt/braid/k8s/monitoring-values.yaml --wait --timeout 15m
```

**Painel Cloudflare:** antes de publicar os endereços, crie aplicações Access
do tipo Self-hosted para `auth`, `grafana` e `rabbit`, cada uma com policy
`Allow` restrita aos e-mails administradores. Use One-time PIN ou o provedor de
identidade da sua conta. Não coloque Access em `timeline` ou `api`, pois o
navegador e o mobile usam a autenticação da aplicação. Depois crie um Tunnel
do tipo `cloudflared`, copie **somente** seu token, e não execute o comando
Docker sugerido no painel.

**VPS:** coloque o token no Secret `edge` e suba o conector:

```bash
read -rsp 'Token do Cloudflare Tunnel: ' TUNNEL_TOKEN; echo
kubectl -n edge create secret generic cloudflared-token \
  --from-literal=token="$TUNNEL_TOKEN" --dry-run=client -o yaml | kubectl apply -f -
unset TUNNEL_TOKEN
tee /opt/braid/k8s/cloudflared.yaml >/dev/null <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: cloudflared, namespace: edge}
spec:
  replicas: 1
  selector:
    matchLabels: {app: cloudflared}
  template:
    metadata:
      labels: {app: cloudflared}
    spec:
      containers:
        - name: cloudflared
          image: cloudflare/cloudflared:latest
          args: [tunnel, --no-autoupdate, --metrics, '0.0.0.0:2000', run]
          env:
            - name: TUNNEL_TOKEN
              valueFrom:
                secretKeyRef: {name: cloudflared-token, key: token}
          ports:
            - {name: metrics, containerPort: 2000}
          readinessProbe:
            httpGet: {path: /ready, port: metrics}
            periodSeconds: 10
          resources:
            requests: {cpu: 50m, memory: 64Mi}
            limits: {cpu: 500m, memory: 256Mi}
EOF
kubectl apply -f /opt/braid/k8s/cloudflared.yaml
kubectl -n edge rollout status deployment/cloudflared --timeout=300s
```

**Painel Cloudflare:** no Tunnel, crie cinco *Published application routes*.
Em todas, use tipo HTTP e URL interna
`traefik.kube-system.svc.cluster.local:80`. Defina `HTTP Host Header` com o
hostname da mesma linha; deixe Path vazio.

| Subdomínio | HTTP Host Header |
| --- | --- |
| `timeline` | `timeline.SEUDOMINIO` |
| `api` | `api.SEUDOMINIO` |
| `auth` | `auth.SEUDOMINIO` |
| `grafana` | `grafana.SEUDOMINIO` |
| `rabbit` | `rabbit.SEUDOMINIO` |

O navegador usará HTTPS na Cloudflare. O trecho Tunnel → Traefik usa HTTP
dentro do cluster. Aguarde o Tunnel aparecer como saudável. As rotas dos três
apps só responderão depois do passo 6.

## 4. Preparar o código e a identidade de deploy na VPS

**VPS:** gere uma Deploy Key de leitura para a VPS buscar o repositório. Mostre
apenas a chave pública:

```bash
ssh-keygen -t ed25519 -f /opt/braid/private/github-deploy -N '' -C timeline-vps-readonly
chmod 600 /opt/braid/private/github-deploy
cat /opt/braid/private/github-deploy.pub
```

**Painel GitHub:** em `devamaral2/timeline_project` → Settings → Deploy keys,
adicione essa chave pública com **Allow write access desmarcado**. A chave
privada não entra no GitHub. Teste a conexão a partir da VPS e confirme a
identidade do host GitHub antes de aceitar a chave SSH na primeira conexão.

```bash
export GIT_SSH_COMMAND='ssh -i /opt/braid/private/github-deploy -o IdentitiesOnly=yes'
GITHUB_SSH_STATUS=0
ssh -i /opt/braid/private/github-deploy -T git@github.com || GITHUB_SSH_STATUS=$?
test "$GITHUB_SSH_STATUS" -eq 1
```

Crie as rotas internas do Traefik. Elas são necessárias para o teste de fumaça
do deploy, mesmo antes de os pods dos apps existirem.

```bash
for mapping in 'timeline web 3000' 'api api 3001' 'auth auth 3002' 'rabbit rabbitmq 15672'; do
  read -r sub service port <<< "$mapping"
  tee "/opt/braid/k8s/ingress-$sub.yaml" >/dev/null <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: $sub
  namespace: braid
  annotations:
    traefik.ingress.kubernetes.io/router.entrypoints: web
spec:
  ingressClassName: traefik
  rules:
    - host: $sub.$DOMAIN
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: $service
                port:
                  number: $port
EOF
  kubectl apply -f "/opt/braid/k8s/ingress-$sub.yaml"
done
kubectl get ingress -A
```

## 5. Configurar GitHub Actions e testar SSH

**Computador:** gere uma chave SSH **separada** para o Actions. Exemplo em Bash
(no PowerShell, use `ssh-keygen` com um caminho equivalente):

```bash
ssh-keygen -t ed25519 -f "$HOME/.ssh/timeline-actions" -N '' -C timeline-actions
cat "$HOME/.ssh/timeline-actions.pub"
```

**VPS:** cole a chave pública completa no prompt. O prefixo `restrict` e o
comando forçado fazem essa chave aceitar apenas o deploy com SHA válido.

```bash
useradd --system --home-dir /var/lib/gha-deploy --create-home --shell /bin/bash gha-deploy
install -d -m 0700 -o gha-deploy -g gha-deploy /var/lib/gha-deploy/.ssh
read -rp 'Chave pública timeline-actions: ' GHA_PUBLIC_KEY
[[ "$GHA_PUBLIC_KEY" =~ ^ssh-ed25519[[:space:]]+[A-Za-z0-9+/=]+([[:space:]].*)?$ ]] || exit 1
printf 'restrict,command="/opt/braid/bin/ssh-deploy-entry" %s\n' "$GHA_PUBLIC_KEY" > /var/lib/gha-deploy/.ssh/authorized_keys
chown gha-deploy:gha-deploy /var/lib/gha-deploy/.ssh/authorized_keys
chmod 600 /var/lib/gha-deploy/.ssh/authorized_keys
printf '%s\n' 'gha-deploy ALL=(root) NOPASSWD: /opt/braid/bin/braid-deploy *' > /etc/sudoers.d/braid-github-deploy
chmod 440 /etc/sudoers.d/braid-github-deploy
visudo -cf /etc/sudoers.d/braid-github-deploy
```

Se `gha-deploy` já existir, inspecione a conta e use
`usermod --shell /bin/bash gha-deploy` em vez de recriá-la. O shell Bash é
necessário para o SSH executar o comando forçado; `/usr/sbin/nologin`
bloquearia o deploy.

**VPS:** mostre a impressão da chave do servidor para comparar com a cópia
obtida no computador:

```bash
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

**Computador:** leia a chave pública do servidor pelo SSH e grave uma entrada
`known_hosts` para o mesmo host/porta usados no workflow. O exemplo abaixo
usa Bash; informe os valores reais e compare o fingerprint com a saída da
VPS antes de cadastrar o Secret.

```bash
read -rp 'Host ou IP da VPS: ' PROD_HOST
read -rp 'Porta SSH [22]: ' PROD_PORT
PROD_PORT=${PROD_PORT:-22}
ssh-keyscan -p "$PROD_PORT" -t ed25519 "$PROD_HOST" > "$HOME/.ssh/timeline-production-known-hosts"
ssh-keygen -lf "$HOME/.ssh/timeline-production-known-hosts"
```

**Painel GitHub:** Settings → Environments → New environment → `production`.
Ative **Required reviewers** e **Deployment branches: Selected branches →
main**. Cadastre:

| Tipo | Nome | Valor |
| --- | --- | --- |
| Variable | `PROD_HOST` | Host/IP SSH da VPS |
| Variable | `PROD_PORT` | Porta SSH; normalmente `22` |
| Variable | `PROD_USER` | `gha-deploy` |
| Secret | `PROD_SSH_PRIVATE_KEY` | Conteúdo completo da chave privada `timeline-actions` do computador |
| Secret | `PROD_KNOWN_HOSTS` | Conteúdo completo do arquivo `timeline-production-known-hosts` após comparar o fingerprint |

Crie também uma regra de proteção para `main` em Settings → Rules → Rulesets:
exija PR e o check `CI / validate` antes do merge, e bloqueie force pushes.
Confirme o nome exato do check no PR inicial antes de torná-lo obrigatório.
Essa regra controla entrada de código em produção; a aprovação do Environment
controla quando o deploy ocorre.

Não cadastre o token do 1Password, as URLs de banco ou a senha do
administrador no GitHub. A chave SSH do Actions dá acesso apenas ao comando
forçado; a VPS consulta o 1Password durante build/runtime.

No CI, PRs e pushes em `main` executam lint, typecheck, unit tests, build e
Playwright E2E. O lint mostra problemas existentes, mas ainda não bloqueia o
deploy; os demais passos bloqueiam. Os E2E usam um PostgreSQL temporário do
Testcontainers, três serviços locais e mocks para chamadas externas. O runner
precisa de Docker e instala o Chromium do Playwright; não precisa de
credenciais do 1Password ou de acesso à produção. O script de smoke com
`E2E_EMAIL`/`E2E_PASSWORD` é outro teste, contra serviços já rodando, e não
faz parte deste CI.

## 6. Fazer o primeiro deploy pela pipeline

O repositório precisa conter `.github/workflows/ci.yml`,
`.github/workflows/deploy-production.yml` e `ops/production/`. Se esses
arquivos ainda estão em uma branch local, abra o PR e aguarde o CI.

**Painel GitHub:** depois de configurar o Environment no passo 5 e de o PR
passar no CI, faça merge em `main`. O workflow `Deploy production` repetirá as
validações e aguardará a aprovação do Environment `production`. Deixe o job
aguardando enquanto prepara o clone na VPS.

**VPS:** clone o `main` como root; assim o wrapper também poderá executar Git
sem depender de uma configuração adicional de `safe.directory`. Use a Deploy
Key do passo 4.

```bash
source /opt/braid/env.sh
export GIT_SSH_COMMAND='ssh -i /opt/braid/private/github-deploy -o IdentitiesOnly=yes -o BatchMode=yes'
test ! -e /opt/braid/src || { echo '/opt/braid/src já existe; inspecione antes de clonar'; exit 1; }
git clone git@github.com:devamaral2/timeline_project.git /opt/braid/src
cd /opt/braid/src
git status --short
git rev-parse HEAD
test -f ops/production/deploy-release.sh
```

Instale os scripts versionados. Todos são arquivos de root; `gha-deploy` não
pode editá-los.

```bash
install -m 0750 -o root -g root ops/production/backup.sh /opt/braid/bin/backup.sh
install -m 0750 -o root -g root ops/production/check-auth-schema.sh /opt/braid/bin/check-auth-schema.sh
install -m 0750 -o root -g root ops/production/braid-deploy-wrapper.sh /opt/braid/bin/braid-deploy
install -m 0755 -o root -g root ops/production/ssh-deploy-entry.sh /opt/braid/bin/ssh-deploy-entry
install -m 0644 -o root -g root ops/production/apps.template.yaml /opt/braid/k8s/apps.template.yaml
bash ops/production/check-auth-schema.sh /opt/braid/src
```

**Computador:** teste a chave do Actions antes de aprovar o job. O erro
`Comando de deploy inválido` é o resultado esperado para `true`: a chave
conecta, mas não abre um shell. Informe novamente host e porta se abriu outro
terminal desde o passo 5.

```bash
ssh -p "$PROD_PORT" -i "$HOME/.ssh/timeline-actions" \
  -o UserKnownHostsFile="$HOME/.ssh/timeline-production-known-hosts" \
  -o StrictHostKeyChecking=yes "gha-deploy@$PROD_HOST" true
```

**Painel GitHub:** confirme que o SHA do job é o commit recém-publicado,
que o clone da VPS está limpo e que todos os componentes dos passos 1–5
estão prontos. Aprove o deploy.

O workflow conecta por SSH como `gha-deploy` e executa
`sudo -n /opt/braid/bin/braid-deploy <SHA>`. Na VPS, o wrapper:

1. busca o commit no repositório usando a Deploy Key somente leitura;
2. faz backup cifrado dos bancos e da configuração;
3. valida as migrations do Auth;
4. constrói imagens de migration e imagens finais de API, Auth e Web;
5. consulta o 1Password no build do Web via secret temporário do BuildKit;
6. executa as migrations e aplica permissões do banco Auth;
7. importa imagens com tag do SHA no k3s e aplica os Deployments;
8. espera os três rollouts, testa Web/Auth/API pelo Traefik e registra o SHA
   em `/opt/braid/release.env` somente ao concluir.

O backup inicial funciona sem `release.env`; ele ainda não existe antes da
primeira release. A API e o Auth consultam o 1Password ao iniciar; seus pods
recebem apenas o token e o ID pelo Secret `braid/onepassword-loader`.

**VPS:** após o job ficar verde, valide:

```bash
source /opt/braid/env.sh
kubectl -n braid get pods,svc,pvc
kubectl -n braid rollout status deployment/api --timeout=300s
kubectl -n braid rollout status deployment/auth --timeout=300s
kubectl -n braid rollout status deployment/web --timeout=300s
source /opt/braid/release.env
git -C /opt/braid/src rev-parse HEAD
printf 'Release publicada: %s\n' "$SHA"
curl -fsS -o /dev/null -w 'web=%{http_code}\n' "https://timeline.$DOMAIN"
curl -sS -o /dev/null -w 'api=%{http_code}\n' "https://api.$DOMAIN/api/events"
```

Esperado: Web 200 e API 401 sem sessão. Teste no navegador o login e a criação
de um evento após concluir o passo 7. Uma release que falha antes do smoke test
não atualiza `release.env`; entretanto migrations já aplicadas não são
desfeitas automaticamente.

## 7. Criar o administrador e verificar o produto

**VPS:** depois de o Auth estar pronto, execute o bootstrap **uma vez**.

```bash
read -rp 'Nome do administrador: ' ADMIN_NAME
read -rp 'E-mail do administrador: ' ADMIN_EMAIL
kubectl -n braid exec deployment/auth -- \
  node scripts/onepassword/exec.mjs node apps/auth/dist/cli/bootstrap-admin.cli.js \
  --email "$ADMIN_EMAIL" --name "$ADMIN_NAME"
unset ADMIN_NAME ADMIN_EMAIL
```

**Navegador:** abra o convite retornado em `https://timeline.SEUDOMINIO` e
defina a senha inicial. Depois faça a atualização única da senha no terminal;
ela verifica a política e senhas comprometidas, registra auditoria e revoga
sessões abertas. A senha vai por stdin, não como argumento nem Secret GitHub.

```bash
read -rp 'E-mail do administrador ativo: ' ADMIN_EMAIL
read -rsp 'Nova senha: ' ADMIN_PASSWORD; echo
printf '%s\n' "$ADMIN_PASSWORD" | kubectl -n braid exec -i deployment/auth -- \
  node scripts/onepassword/exec.mjs node apps/auth/dist/cli/update-password.cli.js \
  --email "$ADMIN_EMAIL"
unset ADMIN_EMAIL ADMIN_PASSWORD
```

Entre com a senha nova e confirme que a anterior falha. Crie um evento,
recarregue a página e confirme que ele persiste. Abra Grafana, RabbitMQ e o
endpoint `https://auth.SEUDOMINIO/health/ready` em uma janela sem sessão:
Cloudflare Access deve pedir autenticação antes de qualquer resposta
administrativa. O Grafana usa `admin` e `GRAFANA_PASSWORD`; RabbitMQ usa
`braid` e `RABBIT_PASSWORD`, guardados no passo 3.

## 8. Atualizar, recuperar e rotacionar

Para cada atualização: revise migrations, abra PR, aguarde CI, faça merge em
`main`, confira o SHA no job `Deploy production` e aprove. O job executa o
backup antes de alterar a release; só aprova o rollout se migração, pods e
smoke tests passarem. A versão publicada está em `/opt/braid/release.env`.
Não repita manualmente as migrations se o job já as executou.

**VPS:** consulte o estado quando o workflow falhar:

```bash
source /opt/braid/env.sh
kubectl -n braid get pods
kubectl -n braid describe deployment api
kubectl -n braid describe deployment auth
kubectl -n braid describe deployment web
kubectl -n braid logs deployment/api --tail=100
kubectl -n braid logs deployment/auth --tail=100
kubectl -n braid logs deployment/web --tail=100
kubectl -n edge logs deployment/cloudflared --tail=100
df -h /
```

O script não reverte banco automaticamente. Faça rollback de imagem **somente**
quando o schema novo for compatível com a versão anterior. Confirme primeiro
`/opt/braid/previous-release.env`, a tag das imagens ainda importadas e o
efeito da migration. Um erro no backup, build ou migration deve ser corrigido
antes de repetir o job. Um re-run de workflow antigo pode implantar um SHA
antigo; confira sempre qual commit está sendo aprovado.

O backup automático fica em `/opt/braid/backups/TIMESTAMP/`. Copie
`bundle.tar.gz.enc` e `.sha256` para fora da VPS após o primeiro deploy e
antes de mudanças críticas, compare SHA-256 e guarde a passphrase em local
separado. Para a primeira cópia, anote o timestamp impresso como `Backup para
copiar` no log do deploy. Na **VPS**, libere temporariamente só os dois
arquivos cifrados para seu usuário operador SSH; o diretório original continua
restrito a root:

```bash
read -rp 'Timestamp do backup, ex. 20260920T120000Z: ' BACKUP_STAMP
[[ "$BACKUP_STAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || exit 1
OPERATOR_USER=${SUDO_USER:?Abra o shell com sudo -i a partir do usuário SSH operador}
OPERATOR_GROUP=$(id -gn "$OPERATOR_USER")
install -m 0600 -o "$OPERATOR_USER" -g "$OPERATOR_GROUP" \
  "/opt/braid/backups/$BACKUP_STAMP/bundle.tar.gz.enc" \
  "/var/tmp/braid-$BACKUP_STAMP.tar.gz.enc"
install -m 0600 -o "$OPERATOR_USER" -g "$OPERATOR_GROUP" \
  "/opt/braid/backups/$BACKUP_STAMP/bundle.tar.gz.enc.sha256" \
  "/var/tmp/braid-$BACKUP_STAMP.tar.gz.enc.sha256"
```

No **computador** com Bash/WSL, use sua chave **pessoal** de SSH (a chave do
Actions só aceita o comando de deploy):

```bash
read -rp 'Usuário operador SSH da VPS: ' OPERATOR_USER
read -rp 'Caminho da chave SSH pessoal: ' PERSONAL_SSH_KEY
read -rp 'Host ou IP da VPS: ' PROD_HOST
read -rp 'Porta SSH [22]: ' PROD_PORT
PROD_PORT=${PROD_PORT:-22}
read -rp 'Timestamp do backup: ' BACKUP_STAMP
[[ "$BACKUP_STAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || exit 1
mkdir -p "./braid-backup-$BACKUP_STAMP"
scp -P "$PROD_PORT" -i "$PERSONAL_SSH_KEY" \
  "$OPERATOR_USER@$PROD_HOST:/var/tmp/braid-$BACKUP_STAMP.tar.gz.enc" \
  "./braid-backup-$BACKUP_STAMP/"
scp -P "$PROD_PORT" -i "$PERSONAL_SSH_KEY" \
  "$OPERATOR_USER@$PROD_HOST:/var/tmp/braid-$BACKUP_STAMP.tar.gz.enc.sha256" \
  "./braid-backup-$BACKUP_STAMP/"
EXPECTED_SHA=$(cut -d ' ' -f 1 "./braid-backup-$BACKUP_STAMP/braid-$BACKUP_STAMP.tar.gz.enc.sha256")
ACTUAL_SHA=$(sha256sum "./braid-backup-$BACKUP_STAMP/braid-$BACKUP_STAMP.tar.gz.enc" | cut -d ' ' -f 1)
test "$EXPECTED_SHA" = "$ACTUAL_SHA" && echo 'Backup copiado e checksum conferido'
```

Depois de confirmar a cópia, remova **somente** os dois arquivos temporários
de `/var/tmp` na VPS. O backup original continua em `/opt/braid/backups`:

```bash
[[ "$BACKUP_STAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || exit 1
rm -f "/var/tmp/braid-$BACKUP_STAMP.tar.gz.enc" \
  "/var/tmp/braid-$BACKUP_STAMP.tar.gz.enc.sha256"
```

Os dumps originais permanecem na VPS com permissão root. O backup não cobre
mensagens do RabbitMQ nem volumes do Grafana/Prometheus; faça um ensaio de
restauração antes de confiar nele. Uma única VPS não oferece alta
disponibilidade.

Se mudar uma variável no Environment do 1Password, reinicie o serviço
afetado (`kubectl -n braid rollout restart deployment/api` ou `auth`). Se
mudar `BACKEND_URL` ou `AUTH_SERVICE_URL` do Web, faça **novo build/deploy**:
essas URLs são gravadas durante `next build`. Para rotacionar o token da Service
Account, atualize `/opt/braid/private/onepassword-token`, recrie o Secret
`onepassword-loader` e reinicie API/Auth; não envie o token para o GitHub.

O token do 1Password nunca é armazenado no GitHub, mas código aprovado em
`main` pode executá-lo durante o build na VPS. Restrinja quem pode fazer merge
e aprovar deploys, revise alterações em Dockerfiles e scripts de produção, e
trate a aprovação do Environment como aprovação de código que terá acesso à
VPS e aos segredos de produção.
