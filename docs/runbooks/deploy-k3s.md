# Deploy na VPS: k3s, Traefik e Cloudflare, desde a preparação inicial

Este roteiro parte **somente** do que você informou ter feito: inspeção da VPS,
usuário com sudo e SSH por chave exclusivo, UFW, swap, fail2ban, atualizações
automáticas conforme o roteiro colado e timezone. Não exige VPN nem usa
arquivos de `vpn/docs/`. Não execute os comandos da versão anterior junto destes.

A escolha deste roteiro é **Cloudflare Tunnel sem VPN**. O navegador acessa
HTTPS na porta **443 da Cloudflare**. O túnel leva a requisição até a porta
**80 interna do Traefik**, que escolhe o aplicativo pelo nome do endereço.
As portas 80/443 da **VPS** ficam fechadas. Portanto, “tudo pelo Traefik” não
significa abrir uma porta pública para cada aplicação.

```text
Navegador → HTTPS :443 Cloudflare → túnel cifrado → Traefik :80 interno
                                                       ├─ web :3000 → API → Postgres
                                                       ├─ API :3001
                                                       ├─ auth :3002
                                                       ├─ Grafana :80
                                                       └─ painel RabbitMQ :15672
```

SSH continua pela porta 22, como você já configurou. PostgreSQL :5432 e
RabbitMQ AMQP :5672 ficam internos: são protocolos de banco e fila, não páginas
HTTP. O painel web do RabbitMQ é outra porta. Não publicaremos a administração
do Kubernetes, o dashboard do Traefik ou o Prometheus.

Escolhemos imagens construídas na própria VPS e importadas no k3s. Isso dispensa
registry e credenciais GHCR neste primeiro nó. O Docker constrói as imagens;
o containerd que acompanha o k3s executa os apps. Não são dois servidores
PostgreSQL. As migrations também executarão em containers.

**Limite do resultado:** uma VPS só não tem alta disponibilidade. Reiniciar a VPS
interrompe todos os serviços. O mobile é um app instalado no celular, não um
servidor a subir no k3s; este roteiro publica a API que ele poderá consumir.

> **Impedimento encontrado no código em 07/09/2026:** antes de iniciar este
> deploy completo, é preciso reconciliar as migrations e a implementação do
> `auth`. `apps/auth/src/db/readiness.ts` declara `AUTH_SCHEMA_VERSION = 3`,
> mas `0003`/`0004` elevam o schema a 4/5. A `0004_email_otp_mfa.sql` remove
> campos de telefone/MFA que `schema.ts` e os repositórios ainda utilizam.
> Com essa revisão, o auth não passa na readiness após aplicar todas as
> migrations. Não basta trocar o número para 5. A correção é trabalho de código,
> não uma configuração da VPS. O passo 7 detecta a divergência e impede
> prosseguir. Este documento não contorna o problema pulando migrations.

## Como executar este documento

- **Servidor / Bash:** terminal aberto por SSH na VPS, com o usuário autorizado.
Os comandos abaixo são Bash, não PowerShell.
- **Computador / PowerShell:** somente os blocos explicitamente marcados assim.
- **Navegador:** ações nos painéis indicados, no seu computador.
- Copie cada bloco completo, inclusive `EOF` quando existir. `EOF` encerra a
escrita de um arquivo; não é um comando para adaptar.
- Ao retomar a sessão, `set -eo pipefail` faz Bash parar quando um comando
falha, inclusive em pipelines. A sessão pode encerrar: reconecte e retome
a etapa que falhou depois de entender o erro.
- Execute em ordem. Confira o resultado esperado antes de avançar. Se um comando
falhar, pare nesse passo e use o diagnóstico do final.
- Valores pedidos por `read` são digitados quando o terminal perguntar. Não cole
exemplos de domínio ou credenciais como se fossem valores reais.
- `sudo` executa uma operação administrativa. `export` disponibiliza uma variável
aos comandos seguintes. Ela some ao encerrar o terminal; vamos salvar as que
precisam ser recuperadas.
- `kubectl apply` entrega ao Kubernetes a configuração desejada. O retorno
`created/configured` não significa que o app já iniciou; os comandos de
`rollout status` e `wait` verificam isso depois.

## 1. Confirmar o ponto de partida

**Servidor / Bash, na sua sessão SSH atual:**

```bash
whoami
sudo -v
cat /etc/os-release
uname -m
nproc
free -h
df -h /
ip -brief addr
sudo ufw status verbose
sudo grep '^IPV6=' /etc/default/ufw
swapon --show
sudo fail2ban-client status sshd
timedatectl status
command -v docker || true
command -v k3s || true
sudo ss -lntup
```

Por quê: antes de instalar precisamos confirmar sistema, espaço, memória,
interfaces e serviços já presentes. Este roteiro usa **Ubuntu 24.04 ou 22.04**,
com arquitetura `x86_64` ou `aarch64`. Reserve preferencialmente **8 GB de RAM,
4 vCPU e 80 GB de disco** para apps, banco, métricas e builds. Swap não substitui
RAM suficiente para os pods.

No resultado que você enviou, `eth0` tem `179.199.138.185` e também IPv6.
`docker0` é uma interface do Docker; sua presença sozinha não prova que há
containers executando. `IPV6=yes` é necessário no UFW. Se estiver `no`,
execute `sudo nano /etc/default/ufw`, altere para `IPV6=yes` e execute
`sudo ufw reload`. No nano: Ctrl+O, Enter salva; Ctrl+X sai.

Se `k3s` já existir, ou houver outro serviço usando os recursos que serão
configurados aqui, pare para avaliar essa instalação. Não desinstale nem apague
dados para “começar limpo”. Se o Docker existir, examine:

```bash
if command -v docker >/dev/null; then
  sudo docker ps -a
  sudo docker volume ls
  sudo docker version
fi
```

É esperado que SSH continue funcionando e que o relógio esteja sincronizado.
Não recrie usuário, swap, fail2ban ou configuração SSH. Não altere `AllowUsers`.

## 2. Registrar o domínio e preparar a conta Cloudflare

**Navegador.** Um domínio é o nome que você registra e renova anualmente.
Criar um registro DNS não compra esse nome. Você pagará o registro/renovação;
veja os valores apresentados antes de confirmar a compra.

1. Acesse [Cloudflare](https://dash.cloudflare.com/), crie a conta e confirme o
-mail. Ative autenticação de dois fatores e guarde os códigos de recuperação.
2. Abra **Domain Registration / Register Domains**. Pesquise o nome desejado.
ara seguir um caminho único, escolha um domínio disponível para compra
*nesse próprio painel**; nem toda extensão é oferecida.
3. Confira a grafia, preço de renovação, dados do titular e forma de pagamento.
onclua a compra e eventuais confirmações de e-mail solicitadas.
4. Abra o domínio na conta. Aguarde a zona aparecer como **Active**.
omo o registro foi na Cloudflare, ela administra os nameservers.
5. Em **SSL/TLS → Edge Certificates**, aguarde o certificado Universal SSL ficar
tivo. Ative **Always Use HTTPS**, que redireciona visitas HTTP para HTTPS.

Não crie registros A/AAAA apontando os subdomínios deste roteiro para o IP da VPS.
Os registros serão criados pelas rotas do Tunnel. Não é necessário comprar um
certificado, gerar Origin Certificate ou instalar cert-manager neste desenho.

O domínio raiz não receberá site neste roteiro; usaremos subdomínios:


| Nome                 | Destino                        | Acesso                                   |
| -------------------- | ------------------------------ | ---------------------------------------- |
| `web.SEUDOMINIO`     | Frontend web                   | Público, login Firebase dentro do app    |
| `api.SEUDOMINIO`     | API                            | Público, endpoints exigem token Firebase |
| `auth.SEUDOMINIO`    | Serviço de identidade separado | Protegido por Access nesta fase          |
| `grafana.SEUDOMINIO` | Painel de métricas             | Access + senha Grafana                   |
| `rabbit.SEUDOMINIO`  | Painel da fila                 | Access + senha RabbitMQ                  |


`SEUDOMINIO` significa o nome comprado, sem `https://` nem barras.
O auth fica protegido nesta fase porque o web ainda usa Firebase. Transformá-lo
no provedor de login do produto é uma mudança de integração, não de DNS.

Referência: [registro de domínio na Cloudflare](https://developers.cloudflare.com/registrar/get-started/register-domain/).

## 3. Instalar utilitários e salvar os dados desta instalação

**Servidor / Bash:**

```bash
sudo apt update
sudo apt install -y ca-certificates curl git jq openssl nano dnsutils
umask 077
sudo install -d -m 0750 -o "$(id -un)" -g "$(id -gn)" /opt/braid
mkdir -p /opt/braid/k8s /opt/braid/private /opt/braid/bin /opt/braid/backups
chmod 700 /opt/braid/private /opt/braid/backups

read -rp "Domínio comprado, sem https://: " DOMAIN
read -rp "Interface pública [eth0]: " PUB_IFACE
PUB_IFACE=${PUB_IFACE:-eth0}
read -rp "IP público IPv4 [179.199.138.185]: " PUBLIC_IP
PUBLIC_IP=${PUBLIC_IP:-179.199.138.185}

[[ "$DOMAIN" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$ ]] || { echo "Domínio inválido"; exit 1; }
ip link show "$PUB_IFACE"
ip -4 addr show "$PUB_IFACE" | grep -F "$PUBLIC_IP"

printf 'export DOMAIN=%q\nexport PUB_IFACE=%q\nexport PUBLIC_IP=%q\nexport KUBECONFIG=%q\n' \
  "$DOMAIN" "$PUB_IFACE" "$PUBLIC_IP" /etc/rancher/k3s/k3s.yaml \
  > /opt/braid/env.sh
source /opt/braid/env.sh
printf 'Web: https://timeline.%s\n' "$DOMAIN"
```

Confira se o IP foi encontrado na interface e se o endereço web está correto.
`curl` consulta URLs e baixa instaladores; `git` baixa o repositório; `openssl`
gera senhas; `dnsutils` fornece `dig` para conferir DNS. `jq` extrai campos de
JSON: usaremos isso na chave Firebase e na validação das chaves públicas do auth.

**Não instalamos `postgresql-client`.** As migrations Node usam o driver do
banco, e o `psql` já está na imagem PostgreSQL para aplicar permissões.
A afirmação anterior de que Drizzle dependeria de `psql` não se aplica aqui.

Sempre que abrir outra sessão SSH para continuar:

```bash
source /opt/braid/env.sh
set -eo pipefail
umask 077
```

## 4. Preparar o UFW para um cluster sem entrada pública HTTP

Você já liberou 80/443 no roteiro anterior. Com Tunnel, vamos retirar essas
permissões. **Mantenha a sessão SSH aberta** e teste outra sessão depois.

**Servidor / Bash:**

```bash
source /opt/braid/env.sh
sudo ufw status numbered
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw delete allow 80/tcp || echo "Confira abaixo se a permissão HTTP já estava ausente"
sudo ufw delete allow 443/tcp || echo "Confira abaixo se a permissão HTTPS já estava ausente"
sudo ufw allow in on cni0 from 10.42.0.0/16
sudo ufw allow from 10.43.0.0/16
sudo ufw default allow routed
sudo ufw route insert 1 deny in on "$PUB_IFACE"
sudo ufw insert 1 deny in on "$PUB_IFACE" to any port 6443 proto tcp
sudo ufw insert 1 deny in on "$PUB_IFACE" to any port 10250 proto tcp
sudo ufw insert 1 deny in on "$PUB_IFACE" to any port 8472 proto udp
sudo ufw reload
sudo ufw status verbose
```

Se uma remoção disser que a regra não existe, confira `ufw status numbered`:
o objetivo é não haver permissão pública para 80/443, inclusive regras “Nginx”,
“Apache” ou permissões gerais criadas fora do roteiro colado. Remova somente
essas permissões pelo número exibido, com `sudo ufw delete NUMERO`, consultando
a lista de novo após cada remoção. Não remova a regra SSH.

Por quê: `cni0` será a interface dos pods; `10.42.0.0/16` é sua rede.
`10.43.0.0/16` é a rede dos Services. O encaminhamento permite os pods saírem
para a internet. A regra `route deny` na interface pública bloqueia conexões
novas encaminhadas da internet para containers; respostas a conexões iniciadas
de dentro continuam permitidas pelo acompanhamento de conexões.

6443 administra Kubernetes, 10250 é o kubelet e 8472 é a rede VXLAN do k3s.
Um nó único não precisa receber essas conexões da internet. O Tunnel inicia
conexões de saída; não depende de liberar essas portas nem 80/443 na VPS.
O painel da hospedagem, caso tenha firewall adicional, deve permitir SSH e
saídas, incluindo TCP/UDP 7844 para o túnel.

**Computador:** abra uma segunda sessão SSH com o mesmo comando que você já usa.
Só continue depois de confirmar que ela conecta e que `sudo -v` funciona.

Base: [rede e requisitos do k3s](https://docs.k3s.io/installation/requirements).

## 5. Instalar Docker para construir as imagens

Se `sudo docker version` no passo 1 já mostrou cliente e servidor funcionando,
pule a instalação e execute apenas a configuração do grupo abaixo.
Se houver instalação parcial/quebrada, não sobreponha pacotes sem diagnosticá-la.

**Servidor / Bash — somente quando Docker ainda não está instalado:**

```bash
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
. /etc/os-release
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $VERSION_CODENAME
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

O Docker pode mudar a política de encaminhamento e impedir os pods do k3s
de chegarem à rede. Vamos preservar as opções já existentes e acrescentar a
opção oficial `ip-forward-no-drop`. Se o Docker encontrado no passo 1 estiver
executando containers importantes, pare antes deste restart e avalie-os.

**Servidor / Bash — tanto para instalação nova quanto existente:**

```bash
sudo install -d -m 0755 /etc/docker
if sudo test -f /etc/docker/daemon.json; then
  sudo cp /etc/docker/daemon.json /opt/braid/private/docker-daemon.before.json
  sudo cat /etc/docker/daemon.json | jq '. + {"ip-forward-no-drop":true}' > /opt/braid/private/docker-daemon.new.json
else
  printf '%s\n' '{"ip-forward-no-drop":true}' > /opt/braid/private/docker-daemon.new.json
fi
sudo dockerd --validate --config-file=/opt/braid/private/docker-daemon.new.json
sudo install -m 0600 /opt/braid/private/docker-daemon.new.json /etc/docker/daemon.json
sudo systemctl restart docker
sudo ufw reload
```

Se a validação disser “unknown option”, a instalação Docker existente é antiga
para essa opção; atualize-a antes de seguir. Não desative iptables do Docker.
Fonte: [Docker e encaminhamento de pacotes](https://docs.docker.com/engine/network/packet-filtering-firewalls/).

Agora conceda ao operador acesso aos comandos Docker:

```bash
sudo usermod -aG docker "$(id -un)"
```

Saia dessa sessão com `exit` e conecte novamente por SSH. Isso atualiza os grupos
do usuário. Na nova sessão:

```bash
source /opt/braid/env.sh
umask 077
docker version
docker buildx version
docker run --rm hello-world
```

Esperado: mensagem `Hello from Docker!`. O container de teste é removido por
`--rm`. O grupo Docker dá poder administrativo sobre a máquina: somente o
usuário operador deve integrá-lo neste roteiro. Não execute `docker run -p`
nem `docker compose up` para os apps: quem os executará será o k3s.

Referência: [instalação oficial do Docker no Ubuntu](https://docs.docker.com/engine/install/ubuntu/).

## 6. Instalar k3s e deixar o Traefik somente na rede interna

Vamos manter a swap para processos do host, incluindo builds, e configurar o
kubelet para aceitar sua presença. Os pods permanecerão com o comportamento
padrão `NoSwap`. Isso evita desfazer a preparação que você já fez.

**Servidor / Bash:**

```bash
sudo groupadd -f k3s-admin
sudo usermod -aG k3s-admin "$(id -un)"
sudo install -d -m 0755 /etc/rancher/k3s
sudo tee /etc/rancher/k3s/config.yaml >/dev/null <<EOF
write-kubeconfig-mode: "0640"
write-kubeconfig-group: k3s-admin
secrets-encryption: true
node-ip: "$PUBLIC_IP"
flannel-iface: "$PUB_IFACE"
disable:
  - servicelb
kubelet-arg:
  - "fail-swap-on=false"
EOF

sudo install -d -m 0755 /var/lib/rancher/k3s/server/manifests
sudo tee /var/lib/rancher/k3s/server/manifests/traefik-config.yaml >/dev/null <<'EOF'
apiVersion: helm.cattle.io/v1
kind: HelmChartConfig
metadata:
  name: traefik
  namespace: kube-system
spec:
  valuesContent: |-
    service:
      type: ClusterIP
EOF

curl -fsSL https://get.k3s.io -o /opt/braid/install-k3s.sh
sudo env INSTALL_K3S_CHANNEL=stable sh /opt/braid/install-k3s.sh
sudo k3s kubectl wait --for=condition=Ready nodes --all --timeout=300s
for attempt in $(seq 1 60); do
  if sudo k3s kubectl -n kube-system get deployment traefik >/dev/null 2>&1; then
    break
  fi
  sleep 5
done
sudo k3s kubectl -n kube-system rollout status deployment/traefik --timeout=300s
```

Por quê: k3s instala Kubernetes, DNS interno, storage local, métricas e Traefik.
Desativar `servicelb` evita os pods que normalmente publicariam 80/443 no host.
`ClusterIP` dá ao Traefik apenas um endereço interno. O arquivo de configuração
do Traefik é criado antes do primeiro start para essa intenção estar presente
desde a instalação.

O kubeconfig contém credencial de administrador. `0640` deixa apenas root e
`k3s-admin` lerem; não usamos `0644`. `secrets-encryption` cifra Secrets no
armazenamento do cluster, mas um administrador ainda consegue lê-los.

Saia e reconecte mais uma vez para receber o grupo `k3s-admin`. Depois:

```bash
source /opt/braid/env.sh
umask 077
kubectl get nodes -o wide
kubectl -n kube-system get svc traefik
kubectl get svc -A
kubectl -n kube-system get pods
k3s --version | tee /opt/braid/k3s-version.txt
swapon --show
```

Esperado: nó `Ready`, Traefik `ClusterIP` sem EXTERNAL-IP e nenhum pod
`svclb-traefik`. Aguarde todos os componentes ficarem prontos antes de continuar.
Não copie kubeconfig para a internet: todos os comandos administrativos deste
documento rodam na VPS, pela sua sessão SSH.

Referências: [opções do servidor k3s](https://docs.k3s.io/cli/server),
[Traefik e ServiceLB](https://docs.k3s.io/networking/networking-services),
[swap no Kubernetes](https://kubernetes.io/docs/concepts/cluster-administration/swap-memory-management/).

## 7. Baixar o código privado da aplicação

O SSH de entrada da VPS e o acesso de saída ao GitHub são coisas diferentes.
Vamos gerar uma chave **nova e somente de leitura** para o repositório.

**Servidor / Bash:**

```bash
ssh-keygen -t ed25519 -f /opt/braid/private/github-deploy -N "" -C "timeline-vps-readonly"
cat /opt/braid/private/github-deploy.pub
```

**Navegador:** abra `devamaral2/timeline_project` no GitHub, vá em
**Settings → Deploy keys → Add deploy key**. Nomeie `timeline-vps-readonly`,
cole a saída pública e **deixe Allow write access desmarcado**. Salve.

**Servidor / Bash:**

```bash
export GIT_SSH_COMMAND="ssh -i /opt/braid/private/github-deploy -o IdentitiesOnly=yes"
git clone git@github.com:devamaral2/timeline_project.git /opt/braid/src
cd /opt/braid/src
git status --short
git rev-parse HEAD
```

Na primeira conexão, SSH pode pedir confirmação da chave do host GitHub.
Compare a impressão exibida com
[as impressões oficiais do GitHub](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints)
antes de responder `yes`. Não desative a verificação de host.

Esperado: clone concluído, `git status --short` sem alterações. É esse commit
publicado no GitHub que será construído; alterações só no seu computador
precisam ser commitadas/enviadas para fazerem parte do deploy.

### Verificação obrigatória do auth antes de continuar

**Servidor / Bash:**

```bash
cat > /opt/braid/bin/check-auth-schema.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
cd /opt/braid/src
CODE_VERSION=$(sed -nE 's/^export const AUTH_SCHEMA_VERSION = ([0-9]+);/\1/p' apps/auth/src/db/readiness.ts)
SQL_VERSION=$(sed -nE 's/.*SET version *= *([0-9]+).*/\1/p' apps/auth/drizzle/[0-9]*.sql | sort -n | tail -1)
printf 'Auth: código espera %s; migrations deixam %s\n' "$CODE_VERSION" "$SQL_VERSION"
if [ -z "$CODE_VERSION" ] || [ -z "$SQL_VERSION" ] || [ "$CODE_VERSION" != "$SQL_VERSION" ]; then
  echo "PARE: schema e código do auth incompatíveis. Corrija no repositório antes de migrar."
  exit 1
fi
EOF
chmod 700 /opt/braid/bin/check-auth-schema.sh
/opt/braid/bin/check-auth-schema.sh
```

Na revisão inspecionada, este bloco **falha intencionalmente com 3 versus 5**.
Não avance ao passo 8 até a correção do auth estar publicada e baixada.
Números iguais são uma condição necessária, não prova suficiente: a correção
precisa alinhar também os campos e fluxos e validar a integração com Postgres.
Não edite uma migration já aplicada nem suprima arquivos para passar na checagem.

## 8. Obter a configuração Firebase e as credenciais externas

O site atual faz login Google pelo **Firebase**, mesmo com o serviço `auth`
rodando. Para funcionar, frontend e API precisam apontar para o mesmo projeto.

**Navegador:**

1. Abra [Firebase Console](https://console.firebase.google.com/). Entre no
rojeto usado pela aplicação; se não existir, crie um projeto.
2. Em **Project settings → General**, registre um app web pelo ícone `</>` se
inda não houver. Não é necessário configurar Firebase Hosting.
3. Copie os seis valores de `firebaseConfig`: `apiKey`, `authDomain`,
projectId`,` storageBucket`,` messagingSenderId`e`appId`.
4. Em **Authentication**, inicie a configuração se necessário. Em
*Sign-in method**, habilite **Google**, escolha o e-mail de suporte e salve.
5. Em **Authentication → Settings → Authorized domains**, adicione exatamente
timeline.SEUDOMINIO`, sem protocolo. Mantenha o` authDomain`fornecido pelo irebase, normalmente terminado em`firebaseapp.com`.
6. Em **Project settings → Service accounts → Firebase Admin SDK**, gere uma
have privada e baixe o JSON. Esse arquivo é segredo, ao contrário da
onfiguração pública do app web.

Fonte: [login Google no Firebase](https://firebase.google.com/docs/auth/web/google-signin).

**Servidor / Bash:** crie o arquivo de build:

```bash
nano /opt/braid/private/web-build.env
```

Cole e substitua os seis valores à direita pelos valores copiados:

```dotenv
NEXT_PUBLIC_FIREBASE_API_KEY=COLE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=COLE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID=COLE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=COLE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=COLE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID=COLE_APP_ID
BACKEND_URL=http://api.braid.svc.cluster.local:3001
```

Não altere `BACKEND_URL`: é o nome interno do Service da API. O Next incorpora
esse destino e os `NEXT_PUBLIC_*` no build. Alterar só o ambiente do pod depois
não muda o bundle; será preciso reconstruir a imagem web.

Crie o arquivo privado do Admin SDK:

```bash
nano /opt/braid/private/firebase-admin.json
```

Abra o JSON baixado no seu computador e cole **seu conteúdo inteiro** no nano.
Salve. Valide sem exibir a chave:

```bash
chmod 600 /opt/braid/private/web-build.env /opt/braid/private/firebase-admin.json
jq -e '.project_id and .client_email and .private_key' \
  /opt/braid/private/firebase-admin.json >/dev/null
if grep -q 'COLE_' /opt/braid/private/web-build.env; then
  echo "Faltam valores Firebase; volte ao nano"
else
  echo "Arquivo web preenchido"
fi
```

**Twilio:** para OTP real, crie/acesse a conta no
[console Twilio](https://console.twilio.com/), anote Account SID/Auth Token,
abra Verify, crie um Service e anote seu Service SID. Habilite SMS e observe as
restrições de destinatários da conta trial. Guarde os três valores.

O próximo passo permite deixar Twilio em modo **ainda não configurado**, com
valores explícitos `PENDENTE`. Nesse caso o processo auth sobe, mas envio de OTP
não funciona. Isso não impede o login Firebase do web. Não confunda
`/health/ready` saudável com teste de envio de SMS.

**OpenRouter:** se usará geração por IA, obtenha uma chave em
[OpenRouter Keys](https://openrouter.ai/keys), configure os créditos necessários
e escolha os IDs de modelos disponíveis na sua conta; o modelo do agente deve
suportar ferramentas. Sem chave, deixaremos essas variáveis ausentes: o app
pode subir, mas os recursos de IA não estarão operacionais.

## 9. Criar namespaces e Secrets

Namespace agrupa recursos. Secret guarda credenciais para que não precisem
ficar dentro de imagens ou manifests de aplicação.

**Servidor / Bash — esta geração é só para o primeiro deploy:**

```bash
kubectl create namespace braid
kubectl create namespace observability
kubectl create namespace edge

test ! -e /opt/braid/private/generated.env || { echo "Senhas já existem; não regenere"; exit 1; }
umask 077
PG_ADMIN_PASSWORD=$(openssl rand -hex 24)
PG_APP_PASSWORD=$(openssl rand -hex 24)
AUTH_OWNER_PASSWORD=$(openssl rand -hex 24)
AUTH_RUNTIME_PASSWORD=$(openssl rand -hex 24)
RABBIT_PASSWORD=$(openssl rand -hex 24)
GRAFANA_PASSWORD=$(openssl rand -hex 24)
AUTH_KEY_ENCRYPTION_KEY=$(openssl rand -base64 32 | tr '+/' '-_' | tr -d '=')

printf '%s\n' \
  "PG_ADMIN_PASSWORD=$PG_ADMIN_PASSWORD" \
  "PG_APP_PASSWORD=$PG_APP_PASSWORD" \
  "AUTH_OWNER_PASSWORD=$AUTH_OWNER_PASSWORD" \
  "AUTH_RUNTIME_PASSWORD=$AUTH_RUNTIME_PASSWORD" \
  "RABBIT_PASSWORD=$RABBIT_PASSWORD" \
  "GRAFANA_PASSWORD=$GRAFANA_PASSWORD" \
  "AUTH_KEY_ENCRYPTION_KEY=$AUTH_KEY_ENCRYPTION_KEY" \
  > /opt/braid/private/generated.env
chmod 600 /opt/braid/private/generated.env
```

Abra `nano /opt/braid/private/generated.env`, copie os valores para seu
gerenciador de senhas e saia sem alterar. **Não gere outras senhas se a conexão
cair.** Para retomar, carregue o arquivo:

```bash
source /opt/braid/env.sh
source /opt/braid/private/generated.env

kubectl -n braid create secret generic postgres-env \
  --from-literal=POSTGRES_USER=postgres \
  --from-literal=POSTGRES_PASSWORD="$PG_ADMIN_PASSWORD" \
  --from-literal=POSTGRES_DB=postgres \
  --from-literal=PG_APP_PASSWORD="$PG_APP_PASSWORD" \
  --from-literal=AUTH_OWNER_PASSWORD="$AUTH_OWNER_PASSWORD" \
  --from-literal=AUTH_RUNTIME_PASSWORD="$AUTH_RUNTIME_PASSWORD"

jq -jr '.private_key' /opt/braid/private/firebase-admin.json > /opt/braid/private/firebase-key.pem

kubectl -n braid create secret generic api-env \
  --from-literal=DATABASE_URL="postgres://braid:${PG_APP_PASSWORD}@postgres.braid.svc.cluster.local:5432/braid" \
  --from-literal=FIREBASE_PROJECT_ID="$(jq -r .project_id /opt/braid/private/firebase-admin.json)" \
  --from-literal=FIREBASE_CLIENT_EMAIL="$(jq -r .client_email /opt/braid/private/firebase-admin.json)" \
  --from-file=FIREBASE_PRIVATE_KEY=/opt/braid/private/firebase-key.pem \
  --from-literal=RABBITMQ_URL="amqp://braid:${RABBIT_PASSWORD}@rabbitmq.braid.svc.cluster.local:5672"

read -rsp "Twilio Account SID (Enter se ainda não configurou): " TWILIO_ACCOUNT_SID; echo
read -rsp "Twilio Auth Token (Enter se ainda não configurou): " TWILIO_AUTH_TOKEN; echo
read -rsp "Twilio Verify Service SID (Enter se ainda não configurou): " TWILIO_VERIFY_SERVICE_SID; echo

kubectl -n braid create secret generic auth-env \
  --from-literal=NODE_ENV=production \
  --from-literal=AUTH_DATABASE_URL="postgres://auth_runtime:${AUTH_RUNTIME_PASSWORD}@postgres.braid.svc.cluster.local:5432/braid_auth" \
  --from-literal=AUTH_ISSUER="https://auth.$DOMAIN" \
  --from-literal=AUTH_AUDIENCE=braid-api \
  --from-literal=AUTH_PUBLIC_URL="https://auth.$DOMAIN" \
  --from-literal=AUTH_WEB_APP_URL="https://web.$DOMAIN" \
  --from-literal=AUTH_KEY_ENCRYPTION_KEY="$AUTH_KEY_ENCRYPTION_KEY" \
  --from-literal=AUTH_OTP_PROVIDER=twilio \
  --from-literal=TWILIO_ACCOUNT_SID="${TWILIO_ACCOUNT_SID:-PENDENTE}" \
  --from-literal=TWILIO_AUTH_TOKEN="${TWILIO_AUTH_TOKEN:-PENDENTE}" \
  --from-literal=TWILIO_VERIFY_SERVICE_SID="${TWILIO_VERIFY_SERVICE_SID:-PENDENTE}"

kubectl -n braid create secret generic rabbitmq-env \
  --from-literal=RABBITMQ_DEFAULT_USER=braid \
  --from-literal=RABBITMQ_DEFAULT_PASS="$RABBIT_PASSWORD"
kubectl -n observability create secret generic grafana-admin \
  --from-literal=admin-user=admin \
  --from-literal=admin-password="$GRAFANA_PASSWORD"
unset TWILIO_ACCOUNT_SID TWILIO_AUTH_TOKEN TWILIO_VERIFY_SERVICE_SID
kubectl -n braid get secrets
kubectl -n observability get secrets
```

A chave PEM é extraída pelo `jq` com quebras de linha reais. Isso evita copiar
aspas de um `.env` para dentro da chave. A API aceita esse formato.

Se optou por IA, execute este bloco; caso contrário, avance ao passo 10:

```bash
read -rsp "OpenRouter API key: " OPENROUTER_API_KEY; echo
read -rp "ID do modelo principal: " OPENROUTER_MODEL
read -rp "ID do modelo do agente, com ferramentas: " OPENROUTER_AGENT_MODEL
export OPENROUTER_API_KEY OPENROUTER_MODEL OPENROUTER_AGENT_MODEL
jq -n '{stringData:{
  OPENROUTER_API_KEY:env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL:env.OPENROUTER_MODEL,
  OPENROUTER_AGENT_MODEL:env.OPENROUTER_AGENT_MODEL
}}' > /opt/braid/private/api-ai-patch.json
kubectl -n braid patch secret api-env --type merge --patch-file /opt/braid/private/api-ai-patch.json
unset OPENROUTER_API_KEY OPENROUTER_MODEL OPENROUTER_AGENT_MODEL
```

Não copie `private/` para o Git. Base64 em um Secret não é proteção por si só.
O arquivo de senhas é necessário para recuperação: faça a cópia externa
indicada no passo de backup.

## 10. Subir PostgreSQL com disco persistente

Um **StatefulSet** mantém identidade estável para o banco. Um **PVC** reserva
disco que sobrevive à troca do pod. Esse disco continua na VPS: não é backup.

Teremos um administrador `postgres`, um usuário `braid` para a API,
um `auth_owner` para migrations e `auth_runtime` para uso diário do auth.
A API não receberá a senha do superusuário.

**Servidor / Bash:**

```bash
cat > /opt/braid/k8s/postgres.yaml <<'EOF'
apiVersion: v1
kind: ConfigMap
metadata:
  name: postgres-init
  namespace: braid
data:
  10-databases.sh: |
    #!/bin/sh
    set -eu
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
      CREATE ROLE braid LOGIN PASSWORD '$PG_APP_PASSWORD';
      CREATE DATABASE braid OWNER braid;
      CREATE ROLE auth_owner LOGIN PASSWORD '$AUTH_OWNER_PASSWORD';
      CREATE ROLE auth_runtime LOGIN PASSWORD '$AUTH_RUNTIME_PASSWORD';
      CREATE DATABASE braid_auth OWNER auth_owner;
    SQL
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: braid
spec:
  type: ClusterIP
  selector: {app: postgres}
  ports:
    - {name: postgres, port: 5432, targetPort: 5432}
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres
  namespace: braid
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
          configMap:
            name: postgres-init
            defaultMode: 493
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

Esperado: PVC `Bound`, pod pronto e bancos `braid` e `braid_auth`
na listagem. O `psql` acima executa **dentro do pod**, pelo `kubectl exec`.

O script inicial só executa com disco vazio. Alterar o Secret depois não troca
a senha de usuários existentes. Se a inicialização falhar, leia
`kubectl -n braid logs postgres-0`. Não apague o PVC para tentar corrigir:
isso pode apagar o banco.

## 11. Subir RabbitMQ

RabbitMQ armazena mensagens para processamento assíncrono. O código atual da
API ainda não contém produtor/consumidor AMQP; o serviço ficará preparado.
Criar `RABBITMQ_URL` não implementa essa integração.

**Servidor / Bash:**

```bash
cat > /opt/braid/k8s/rabbitmq.yaml <<'EOF'
apiVersion: v1
kind: Service
metadata:
  name: rabbitmq
  namespace: braid
spec:
  type: ClusterIP
  selector: {app: rabbitmq}
  ports:
    - {name: amqp, port: 5672, targetPort: 5672}
    - {name: management, port: 15672, targetPort: 15672}
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: rabbitmq
  namespace: braid
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
kubectl -n braid exec rabbitmq-0 -- rabbitmq-diagnostics -q ping
```

Esperado: diagnóstico bem-sucedido. O painel só ficará acessível externamente
depois de configurarmos Access, Ingress e Tunnel.

## 12. Construir as imagens e aplicar migrations

**Migration** é um arquivo versionado que cria/altera a estrutura do banco.
Não vamos gerar migrations no servidor: aplicaremos as que vieram no Git.

Os Dockerfiles têm estágios: `builder` contém ferramentas de compilação e
migrations; o estágio final contém o necessário para executar o app.
Vamos reutilizar esses estágios existentes, sem criar outro sistema de migrations.

**Servidor / Bash:**

```bash
cd /opt/braid/src
export SHA=$(git rev-parse HEAD)
printf 'export SHA=%q\n' "$SHA" > /opt/braid/release.env

docker build --target builder -f apps/api/Dockerfile -t "braid-api-migrate:$SHA" .
docker build --target builder -f apps/auth/Dockerfile -t "braid-auth-migrate:$SHA" .
docker build -f apps/api/Dockerfile -t "braid-api:$SHA" .
docker build -f apps/auth/Dockerfile -t "braid-auth:$SHA" .
docker build --no-cache \
  --secret id=web-env,src=/opt/braid/private/web-build.env \
  -f apps/web/Dockerfile -t "braid-web:$SHA" .
```

Cada comando precisa terminar com código de sucesso. O ponto final indica
que o contexto é a raiz do monorepo. Não execute de dentro de `apps/*`.
O web usa `--no-cache` para que alterações do arquivo montado como secret não
reutilizem um build com configuração antiga. Isso aumenta o tempo de build.

Agora crie um único comando repetível para migrations:

```bash
cat > /opt/braid/bin/migrate.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source /opt/braid/env.sh
source /opt/braid/release.env
cd /opt/braid/src
/opt/braid/bin/check-auth-schema.sh
PGHOST=$(kubectl -n braid get svc postgres -o jsonpath='{.spec.clusterIP}')
get_secret() {
  kubectl -n braid get secret postgres-env -o "jsonpath={.data.$1}" | base64 -d
}
APP_PW=$(get_secret PG_APP_PASSWORD)
OWNER_PW=$(get_secret AUTH_OWNER_PASSWORD)

export DATABASE_URL="postgres://braid:${APP_PW}@${PGHOST}:5432/braid"
docker run --rm --network host -e DATABASE_URL \
  "braid-api-migrate:$SHA" pnpm db:migrate

export AUTH_DATABASE_MIGRATION_URL="postgres://auth_owner:${OWNER_PW}@${PGHOST}:5432/braid_auth"
docker run --rm --network host -e AUTH_DATABASE_MIGRATION_URL \
  "braid-auth-migrate:$SHA" pnpm --filter @repo/auth run db:migrate

kubectl -n braid exec -i postgres-0 -- \
  psql -v ON_ERROR_STOP=1 --single-transaction -U auth_owner -d braid_auth \
  < apps/auth/ops/grant-runtime.sql
EOF
chmod 700 /opt/braid/bin/migrate.sh
/opt/braid/bin/migrate.sh
```

Por quê: os containers temporários usam a rede do host Linux para alcançar o
ClusterIP do banco; não publicam portas. A API usa Drizzle Kit. O auth usa seu
executor TypeScript, que aplica os arquivos de `apps/auth/drizzle/` e registra
os já aplicados. Ambos usam o driver `pg`, sem cliente `psql` no host.

O último comando aplica permissões, como `auth_owner`, usando o `psql` do próprio
Postgres via socket local. O arquivo vem pelo stdin (`-i`). É uma etapa separada
das tabelas: libera leitura/escrita ao runtime, mas mantém `audit_log` restrita
a inserção. Não retire essa etapa. Seria possível automatizar permissões no
executor Node em outra mudança; este roteiro preserva o mecanismo existente.

Confira a estrutura:

```bash
kubectl -n braid exec postgres-0 -- psql -U braid -d braid -c '\dt'
kubectl -n braid exec postgres-0 -- psql -U auth_owner -d braid_auth -c '\dt'
kubectl -n braid exec postgres-0 -- psql -U auth_owner -d braid_auth \
  -c "SELECT has_table_privilege('auth_runtime','audit_log','INSERT') AS pode_inserir, has_table_privilege('auth_runtime','audit_log','UPDATE') AS pode_alterar;"
```

Esperado: tabelas nas duas bases e `pode_inserir=t`, `pode_alterar=f`.
O sucesso do deploy não depende de rodar migrations no computador pessoal.

Importe as imagens finais no runtime do k3s:

```bash
source /opt/braid/release.env
docker save "braid-api:$SHA" "braid-auth:$SHA" "braid-web:$SHA" \
  -o /opt/braid/images.tar
sudo k3s ctr images import /opt/braid/images.tar
sudo k3s ctr images list | grep -F "$SHA"
```

Esperado: as três imagens aparecem. Docker e k3s têm armazenamentos de imagens
diferentes; construir com Docker sem importar causaria `ErrImageNeverPull`.

## 13. Subir web, API e auth

Um **Deployment** mantém o número desejado de cópias do app. Um **Service** dá
um nome estável para acessá-lo mesmo quando o pod é substituído. **Probes**
verificam se está pronto e se precisa reiniciar.

**Servidor / Bash:**

```bash
cat > /opt/braid/k8s/apps.template.yaml <<'EOF'
apiVersion: apps/v1
kind: Deployment
metadata: {name: api, namespace: braid}
spec:
  replicas: 1
  selector:
    matchLabels: {app: api}
  template:
    metadata:
      labels: {app: api}
    spec:
      containers:
        - name: api
          image: docker.io/library/timeline-api:REPLACE_SHA
          imagePullPolicy: Never
          envFrom:
            - secretRef: {name: api-env}
          ports:
            - {containerPort: 3001}
          startupProbe:
            tcpSocket: {port: 3001}
            periodSeconds: 5
            failureThreshold: 60
          readinessProbe:
            tcpSocket: {port: 3001}
            periodSeconds: 10
          livenessProbe:
            tcpSocket: {port: 3001}
            periodSeconds: 20
          resources:
            requests: {cpu: 100m, memory: 256Mi}
            limits: {cpu: "1", memory: 768Mi}
---
apiVersion: v1
kind: Service
metadata: {name: api, namespace: braid}
spec:
  type: ClusterIP
  selector: {app: api}
  ports:
    - {port: 3001, targetPort: 3001}
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: web, namespace: braid}
spec:
  replicas: 1
  selector:
    matchLabels: {app: web}
  template:
    metadata:
      labels: {app: web}
    spec:
      containers:
        - name: web
          image: docker.io/library/timeline-web:REPLACE_SHA
          imagePullPolicy: Never
          ports:
            - {containerPort: 3000}
          startupProbe:
            httpGet: {path: /, port: 3000}
            periodSeconds: 5
            failureThreshold: 60
          readinessProbe:
            httpGet: {path: /, port: 3000}
            periodSeconds: 10
          livenessProbe:
            httpGet: {path: /, port: 3000}
            periodSeconds: 20
          resources:
            requests: {cpu: 100m, memory: 256Mi}
            limits: {cpu: "1", memory: 768Mi}
---
apiVersion: v1
kind: Service
metadata: {name: web, namespace: braid}
spec:
  type: ClusterIP
  selector: {app: web}
  ports:
    - {port: 3000, targetPort: 3000}
---
apiVersion: apps/v1
kind: Deployment
metadata: {name: auth, namespace: braid}
spec:
  replicas: 1
  selector:
    matchLabels: {app: auth}
  template:
    metadata:
      labels: {app: auth}
    spec:
      containers:
        - name: auth
          image: docker.io/library/timeline-auth:REPLACE_SHA
          imagePullPolicy: Never
          envFrom:
            - secretRef: {name: auth-env}
          ports:
            - {containerPort: 3002}
          startupProbe:
            httpGet: {path: /health/live, port: 3002}
            periodSeconds: 5
            failureThreshold: 60
          readinessProbe:
            httpGet: {path: /health/ready, port: 3002}
            periodSeconds: 15
          livenessProbe:
            httpGet: {path: /health/live, port: 3002}
            periodSeconds: 20
          resources:
            requests: {cpu: 50m, memory: 192Mi}
            limits: {cpu: 500m, memory: 512Mi}
---
apiVersion: v1
kind: Service
metadata: {name: auth, namespace: braid}
spec:
  type: ClusterIP
  selector: {app: auth}
  ports:
    - {port: 3002, targetPort: 3002}
EOF

source /opt/braid/release.env
sed "s/REPLACE_SHA/$SHA/g" /opt/braid/k8s/apps.template.yaml > /opt/braid/k8s/apps.yaml
kubectl apply -f /opt/braid/k8s/apps.yaml
for app in api auth web; do
  kubectl -n braid rollout status "deployment/$app" --timeout=300s || exit 1
done
kubectl -n braid get pods
```

Esperado: os três Deployments prontos. A API ainda não tem health HTTP próprio;
a probe TCP só prova que a porta abriu. O teste real de login e acesso ao banco
será feito mais adiante. Auth cria a chave de assinatura no boot, por isso
precisa do banco migrado e das permissões **antes** de iniciar.

## 14. Instalar Prometheus e Grafana

Prometheus coleta métricas; Grafana desenha os painéis. Usaremos o chart
`kube-prometheus-stack`: um pacote Helm com esses componentes e integrações
Kubernetes. Helm instala recursos Kubernetes; não é outro runtime.

**Servidor / Bash:**

```bash
curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 \
  -o /opt/braid/install-helm.sh
bash /opt/braid/install-helm.sh
helm version
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update
helm show chart prometheus-community/kube-prometheus-stack > /opt/braid/monitoring-chart.yaml
CHART_VERSION=$(awk '$1 == "version:" {print $2}' /opt/braid/monitoring-chart.yaml)
test -n "$CHART_VERSION"
printf '%s\n' "$CHART_VERSION" > /opt/braid/monitoring-version.txt
```

Isso registra a versão escolhida para não atualizar o chart acidentalmente
numa reaplicação. Agora configure armazenamento e consumo:

```bash
cat > /opt/braid/k8s/monitoring-values.yaml <<EOF
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
    resources:
      requests: {cpu: 100m, memory: 512Mi}
      limits: {cpu: "1", memory: 1536Mi}
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
  resources:
    requests: {cpu: 50m, memory: 128Mi}
    limits: {cpu: 500m, memory: 512Mi}
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
  --namespace observability \
  --version "$(cat /opt/braid/monitoring-version.txt)" \
  -f /opt/braid/k8s/monitoring-values.yaml \
  --wait --timeout 15m
kubectl -n observability get pods,pvc,svc
```

Esperado: pods prontos e volumes `Bound`. Desabilitamos alvos que o k3s não
expõe como uma instalação Kubernetes convencional, evitando painéis cheios
de falhas de coleta esperadas. Alertmanager ficou desligado: **não há envio de
alertas configurado**. Também evitamos publicar node-exporter em uma porta do host.

Não haverá métricas de negócio nem logs dos apps no Grafana automaticamente.
Os painéis iniciais mostram recursos do cluster. Logs continuam em `kubectl logs`.

Referências: [instalação do Helm](https://helm.sh/docs/intro/install/),
[valores do chart](https://github.com/prometheus-community/helm-charts/blob/main/charts/kube-prometheus-stack/values.yaml).

## 15. Criar as rotas do Traefik

**Ingress** liga um hostname a um Service. Todos usarão a mesma porta interna
`web` do Traefik, que recebe o tráfego do túnel. O HTTPS termina na Cloudflare;
não configure redirecionamento HTTP→HTTPS no Traefik neste fluxo.

**Servidor / Bash:**

```bash
source /opt/braid/env.sh
for mapping in "timeline web 3000" "api api 3001" "auth auth 3002" "rabbit rabbitmq 15672"; do
  read -r sub service port <<< "$mapping"
  cat > "/opt/braid/k8s/ingress-$sub.yaml" <<EOF
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

O laço cria quatro arquivos. O Ingress do Grafana foi criado pelo Helm no passo
anterior. O campo ADDRESS pode ficar vazio com Traefik ClusterIP; isso não é erro.

Teste o roteamento **antes** de envolver a Cloudflare:

```bash
TRAEFIK_IP=$(kubectl -n kube-system get svc traefik -o jsonpath='{.spec.clusterIP}')
curl -fsS -o /dev/null -w 'web=%{http_code}\n' -H "Host: timeline.$DOMAIN" "http://$TRAEFIK_IP"
curl -fsS -H "Host: auth.$DOMAIN" "http://$TRAEFIK_IP/health/ready"
curl -fsS -H "Host: auth.$DOMAIN" "http://$TRAEFIK_IP/.well-known/jwks.json" | jq -e '.keys | length > 0'
curl -sS -o /dev/null -w 'api=%{http_code}\n' -H "Host: api.$DOMAIN" "http://$TRAEFIK_IP/api/events"
```

Esperado: web 200, readiness do auth saudável, `true` para existência de chave
pública e 401 na API sem token. `jq` aqui lê o array `keys` do JSON e verifica
se há pelo menos uma chave. Um 401 prova proteção da rota, não sucesso do banco.

## 16. Proteger os painéis no Cloudflare Access

Faça isto **antes** de publicar as rotas do Tunnel. Access é a tela de
autenticação da Cloudflare anterior ao app; evita deixar o painel administrativo
acessível só com sua senha interna.

**Navegador:**

1. Abra **Zero Trust / Cloudflare One** na conta Cloudflare.
2. Se for o primeiro acesso, crie o nome da equipe e conclua o onboarding.
scolha o plano adequado ao número de administradores; confira os termos
presentados. Isso não instala VPN nem WARP no computador.
3. Em **Settings → Authentication → Login methods** (ou **Integrations →
dentity providers**, conforme a interface), habilite **One-time PIN**.
le envia um código ao seu e-mail.
4. Em **Access → Applications → Add an application**, escolha **Self-hosted**.
5. Crie a aplicação `Grafana` com hostname público `grafana.SEUDOMINIO`,
em caminho restrito. Defina duração de sessão de uma hora.
6. Adicione uma policy `Allow`. Em **Include**, escolha **Emails** e coloque
omente seu e-mail completo. Não escolha `Everyone` nem `Bypass`.
elecione One-time PIN como método de login e salve.
7. Repita para `rabbit.SEUDOMINIO` e `auth.SEUDOMINIO`, sempre cobrindo todo
 hostname e permitindo só os administradores escolhidos.
8. Confira na lista que existem as três aplicações e suas policies.

Não coloque Access em `timeline` ou `api` neste roteiro: os clientes usam
autenticação Firebase. Uma tela de login Access no caminho quebraria requisições
de API e o cliente mobile.

Referências: [aplicação self-hosted no Access](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/),
[configurar One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/).

## 17. Criar o Tunnel e seu conector no k3s

**Navegador:** no painel Cloudflare, abra **Networking → Tunnels**.
Em interfaces anteriores, fica em **Zero Trust → Networks → Connectors →
Cloudflare Tunnels**. Clique **Create a tunnel**, escolha `cloudflared` se
perguntado, e nomeie `timeline-vps`.

Na etapa do conector, selecione Docker e copie **somente o token** mostrado
depois de `--token`. Não execute o comando Docker sugerido pelo painel:
vamos rodar o conector como Deployment no k3s.

**Servidor / Bash:**

```bash
read -rsp "Token do Tunnel: " TUNNEL_TOKEN; echo
kubectl -n edge create secret generic cloudflared-token --from-literal=token="$TUNNEL_TOKEN"
unset TUNNEL_TOKEN

cat > /opt/braid/k8s/cloudflared.yaml <<'EOF'
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
          args:
            - tunnel
            - --no-autoupdate
            - --metrics
            - 0.0.0.0:2000
            - run
          env:
            - name: TUNNEL_TOKEN
              valueFrom:
                secretKeyRef: {name: cloudflared-token, key: token}
          ports:
            - {name: metrics, containerPort: 2000}
          readinessProbe:
            httpGet: {path: /ready, port: metrics}
            periodSeconds: 10
          livenessProbe:
            httpGet: {path: /ready, port: metrics}
            initialDelaySeconds: 30
            periodSeconds: 20
            failureThreshold: 6
          resources:
            requests: {cpu: 50m, memory: 64Mi}
            limits: {cpu: 500m, memory: 256Mi}
EOF
kubectl apply -f /opt/braid/k8s/cloudflared.yaml
kubectl -n edge rollout status deployment/cloudflared --timeout=300s
kubectl -n edge logs deployment/cloudflared --tail=30
```

Esperado: conector `Healthy` no painel e registro de conexões estabelecidas.
O pod não recebe Service público. O token autoriza conectar à sua conta; guarde-o
como segredo. Para usar uma versão reprodutível nas próximas reaplicações,
fixe agora o digest da imagem que acabou de iniciar:

```bash
CLOUDFLARED_IMAGE=$(kubectl -n edge get pods -l app=cloudflared -o jsonpath='{.items[0].status.containerStatuses[0].imageID}')
CLOUDFLARED_IMAGE=${CLOUDFLARED_IMAGE#docker-pullable://}
[[ "$CLOUDFLARED_IMAGE" == *@sha256:* ]] || { echo "Digest não encontrado"; exit 1; }
sed -i "s|cloudflare/cloudflared:latest|$CLOUDFLARED_IMAGE|" /opt/braid/k8s/cloudflared.yaml
kubectl apply -f /opt/braid/k8s/cloudflared.yaml
kubectl -n edge rollout status deployment/cloudflared --timeout=300s
```

Referência: [cloudflared no Kubernetes](https://developers.cloudflare.com/tunnel/deployment-guides/kubernetes/).

## 18. Publicar os cinco endereços pelo Tunnel

**Navegador:** abra `timeline-vps`, **Routes → Add route → Published application**
(ou **Public Hostnames → Add a public hostname** na interface anterior).

Crie **uma rota por linha** desta tabela:


| Subdomain  | Domain      | Type | URL                                        | HTTP Host Header      |
| ---------- | ----------- | ---- | ------------------------------------------ | --------------------- |
| `timeline` | seu domínio | HTTP | `traefik.kube-system.svc.cluster.local:80` | `timeline.SEUDOMINIO` |
| `api`      | seu domínio | HTTP | `traefik.kube-system.svc.cluster.local:80` | `api.SEUDOMINIO`      |
| `auth`     | seu domínio | HTTP | `traefik.kube-system.svc.cluster.local:80` | `auth.SEUDOMINIO`     |
| `grafana`  | seu domínio | HTTP | `traefik.kube-system.svc.cluster.local:80` | `grafana.SEUDOMINIO`  |
| `rabbit`   | seu domínio | HTTP | `traefik.kube-system.svc.cluster.local:80` | `rabbit.SEUDOMINIO`   |


Deixe **Path vazio**. Em cada rota, abra **Additional application settings →
HTTP settings → HTTP Host Header** e preencha o hostname completo indicado.
Esse header é como o Traefik escolhe a aplicação. Não coloque `localhost` na
URL: dentro do conector isso apontaria para o próprio pod cloudflared.

Salve cada rota. A Cloudflare cria o registro DNS correspondente ao túnel.
Se houver conflito de hostname, confira em **DNS → Records** e remova somente
o registro anterior daquele subdomínio que você está substituindo.

Não crie rota curinga `*` nem encaminhe diretamente para Grafana/RabbitMQ:
a tabela garante que todas as aplicações passam pelo Traefik.

O navegador continua usando **HTTPS**; `HTTP` nessa tabela descreve apenas o
trecho interno do conector até o Traefik, dentro da VPS. Não marque opções
`No TLS Verify`: não são necessárias. A opção Full (strict) da zona não cria
um certificado interno nem transforma esta URL HTTP em HTTPS.

Referências: [rotas do Tunnel](https://developers.cloudflare.com/tunnel/routing/),
[HTTP Host Header](https://developers.cloudflare.com/tunnel/advanced/origin-parameters/).

## 19. Validar o resultado completo

**Servidor / Bash:**

```bash
source /opt/braid/env.sh
kubectl get pods -A
kubectl get pvc -A
kubectl get svc -A
kubectl get ingress -A
kubectl top nodes
kubectl top pods -A
dig +short "timeline.$DOMAIN"
curl -fsS -o /dev/null -w '%{http_code}\n' "https://timeline.$DOMAIN"
curl -sS -o /dev/null -w '%{http_code}\n' "https://api.$DOMAIN/api/events"
```

Esperado: pods prontos (Jobs de instalação podem aparecer `Completed`), volumes
`Bound`, serviços internos `ClusterIP`, web 200 e API 401 sem token.
O DNS público deve apontar para a borda Cloudflare, não diretamente para a VPS.

**Navegador:**

1. Abra `https://timeline.SEUDOMINIO`, faça login Google e crie um evento de
este. Recarregue a página: ele precisa continuar lá. Isso verifica
avegador → Cloudflare → Traefik → web → API → banco.
2. Em janela anônima, abra `https://grafana.SEUDOMINIO`. Deve pedir o código
o Access **antes** do login Grafana. Use `admin` e a `GRAFANA_PASSWORD`
uardada. Abra **Dashboards → Browse** e um painel Kubernetes.
3. Faça o mesmo com `https://rabbit.SEUDOMINIO`. Depois do Access, entre com
suário `timeline` e `RABBIT_PASSWORD`.
4. Em `https://auth.SEUDOMINIO/health/ready`, autentique no Access e confirme
 resposta saudável. O auth é uma API; não espere uma página de login em `/`.
5. Sem sessão Access, um pedido a esses três hosts deve receber o desafio,
edirecionamento para login ou recusa. Nunca o conteúdo administrativo.

**Computador / PowerShell**, fora da VPS: verifique as portas do IPv4 informado.

```powershell
$VpsAddress = "179.199.138.185"
22,80,443,6443,10250,5432,5672,15672,9090,9100 | ForEach-Object {
  [pscustomobject]@{
    Porta = $_
    Acessivel = Test-NetConnection -ComputerName $VpsAddress -Port $_ -InformationLevel Quiet -WarningAction SilentlyContinue
  }
}
```

Esperado: somente 22 acessível a partir do computador autorizado. As demais
devem retornar `False`. Se você restringiu SSH a outro IP, 22 pode falhar fora
desse IP. Testes de portas bloqueadas podem demorar.

Como a VPS também tem IPv6, repita de uma rede com IPv6 funcional:

```powershell
$VpsAddress = "2a02:4780:6e:2251::1"
22,80,443,6443,10250,5432,5672,15672,9090,9100 | ForEach-Object {
  [pscustomobject]@{
    Porta = $_
    Acessivel = Test-NetConnection -ComputerName $VpsAddress -Port $_ -InformationLevel Quiet -WarningAction SilentlyContinue
  }
}
```

Se seu computador não tem conectividade IPv6, esse teste inconclusivo não prova
bloqueio. Confira também regras IPv6 no UFW e no firewall da hospedagem.

Um timeout **ou conexão recusada** nas portas fechadas é aceitável. Uma resposta
HTTP do app pelo IP direto não é: revise os Services e os serviços antigos
do host antes de considerar a publicação protegida por Access.

### O que “tudo funcionando” significa aqui

Web, API, auth, banco, RabbitMQ, Prometheus, Grafana e Tunnel devem estar prontos.
O mobile usa `https://api.SEUDOMINIO` como `MOBILE_API_URL` em seu próprio build;
a geração/instalação nativa não faz parte de subir servidores na VPS.

Se deixou Twilio/OpenRouter pendentes, OTP/IA continuam pendentes. RabbitMQ ainda
não tem consumidor no código. O auth usa o endereço do socket como IP do cliente:
atrás do proxy isso pode agrupar clientes nos limites por IP. Por isso permanece
atrás do Access para uso administrativo até a integração do produto e a política
de proxies confiáveis serem tratadas no código.

## 20. Fazer backup e guardar fora da VPS

Execute agora, **antes de armazenar dados importantes**, e repita diariamente
enquanto estiver usando este deploy, além de antes de cada atualização.
Este procedimento é manual; não há backup automático nem alerta configurado.

Vamos guardar os dois bancos, papéis PostgreSQL, Secrets, manifests e configurações.
A cópia cifrada precisa sair da VPS para sobreviver à perda do servidor.
Os dois dumps são consistentes individualmente, mas não são uma transação
conjunta entre bases.

**Servidor / Bash:**

```bash
cat > /opt/braid/bin/backup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
source /opt/braid/env.sh
umask 077
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DEST="/opt/braid/backups/$STAMP"
mkdir -p "$DEST"

kubectl -n braid exec postgres-0 -- pg_dump -U postgres -d braid -Fc > "$DEST/braid.dump"
kubectl -n braid exec postgres-0 -- pg_dump -U postgres -d braid_auth -Fc > "$DEST/braid_auth.dump"
kubectl -n braid exec postgres-0 -- pg_dumpall -U postgres --globals-only > "$DEST/globals.sql"
kubectl -n braid get secrets -o yaml > "$DEST/timeline-secrets.yaml"
kubectl -n observability get secrets grafana-admin -o yaml > "$DEST/grafana-secret.yaml"
kubectl -n edge get secrets cloudflared-token -o yaml > "$DEST/tunnel-secret.yaml"

kubectl -n braid exec -i postgres-0 -- pg_restore --list < "$DEST/braid.dump" > "$DEST/braid-list.txt"
kubectl -n braid exec -i postgres-0 -- pg_restore --list < "$DEST/braid_auth.dump" > "$DEST/auth-list.txt"

tar -C /opt/braid -czf "$DEST/bundle.tar.gz" \
  "backups/$STAMP/braid.dump" "backups/$STAMP/braid_auth.dump" \
  "backups/$STAMP/globals.sql" "backups/$STAMP/timeline-secrets.yaml" \
  "backups/$STAMP/grafana-secret.yaml" "backups/$STAMP/tunnel-secret.yaml" \
  private k8s bin env.sh release.env k3s-version.txt monitoring-version.txt

openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
  -in "$DEST/bundle.tar.gz" -out "$DEST/bundle.tar.gz.enc"
sha256sum "$DEST/bundle.tar.gz.enc" > "$DEST/bundle.tar.gz.enc.sha256"
printf 'Backup para copiar: %s\n' "$DEST"
EOF
chmod 700 /opt/braid/bin/backup.sh
/opt/braid/bin/backup.sh
```

O OpenSSL pede uma senha e sua confirmação. Guarde-a no gerenciador de senhas:
sem ela não há recuperação. A listagem `pg_restore --list` detecta arquivos
inválidos, mas ainda não prova que uma restauração completa funciona.

O diretório também contém dumps **sem cifra**, protegidos pelas permissões do
usuário. Mantenha o acesso da VPS restrito. Não disponibilize esse diretório
por Ingress. O checksum serve para comparar a transferência.

**Computador / PowerShell:** informe o mesmo usuário e a chave privada que
você já usa no SSH. No último campo, cole o caminho que o script acabou de imprimir.

```powershell
$SshUser = Read-Host "Usuário SSH autorizado na VPS"
$SshKey = Read-Host "Caminho completo da sua chave SSH privada neste computador"
$RemoteBackup = Read-Host "Caminho completo impresso pelo backup, começando por /opt/braid/backups/"
$LocalBackup = Join-Path $env:USERPROFILE ("timeline-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $LocalBackup
scp -i $SshKey "${SshUser}@179.199.138.185:${RemoteBackup}/bundle.tar.gz.enc" $LocalBackup
scp -i $SshKey "${SshUser}@179.199.138.185:${RemoteBackup}/bundle.tar.gz.enc.sha256" $LocalBackup
Get-FileHash (Join-Path $LocalBackup "bundle.tar.gz.enc") -Algorithm SHA256
Get-Content (Join-Path $LocalBackup "bundle.tar.gz.enc.sha256")
```

Os hashes devem coincidir, desconsiderando maiúsculas/minúsculas. Guarde essa
pasta também em seu armazenamento externo habitual. Não apague a última cópia
verificada. Confira `df -h /` e `du -sh /opt/braid/backups` diariamente:
este roteiro não remove backups automaticamente.

### Ensaio de restauração sem substituir os bancos em uso

**Servidor / Bash:** use o timestamp exibido pelo backup.

```bash
read -rp "Timestamp do backup, ex. 20260907T150000Z: " BACKUP_STAMP
[[ "$BACKUP_STAMP" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || { echo "Timestamp inválido"; exit 1; }
RESTORE_DIR=$(mktemp -d /opt/braid/backups/restore-check.XXXXXX)
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -in "/opt/braid/backups/$BACKUP_STAMP/bundle.tar.gz.enc" \
  -out "$RESTORE_DIR/bundle.tar.gz"
tar -xzf "$RESTORE_DIR/bundle.tar.gz" -C "$RESTORE_DIR"

kubectl -n braid exec postgres-0 -- createdb -U postgres restore_check_api
kubectl -n braid exec -i postgres-0 -- pg_restore -U postgres \
  --exit-on-error --no-owner --no-privileges -d restore_check_api \
  < "$RESTORE_DIR/backups/$BACKUP_STAMP/braid.dump"
kubectl -n braid exec postgres-0 -- createdb -U postgres restore_check_auth
kubectl -n braid exec -i postgres-0 -- pg_restore -U postgres \
  --exit-on-error --no-owner --no-privileges -d restore_check_auth \
  < "$RESTORE_DIR/backups/$BACKUP_STAMP/braid_auth.dump"
kubectl -n braid exec postgres-0 -- psql -U postgres -d restore_check_api -c '\dt'
kubectl -n braid exec postgres-0 -- psql -U postgres -d restore_check_auth -c '\dt'
```

Esperado: restore sem erros e tabelas presentes. Os bancos reais não foram
substituídos. Se os nomes `restore_check_*` já existirem, inspecione o ensaio
anterior; não sobreponha. Depois do sucesso, remova **somente os bancos de ensaio**:

```bash
kubectl -n braid exec postgres-0 -- dropdb -U postgres restore_check_api
kubectl -n braid exec postgres-0 -- dropdb -U postgres restore_check_auth
```

Os dumps permanecem e permitem repetir o teste. Em recuperação de desastre,
recrie a infraestrutura, restaure papéis e bancos com os donos originais,
recupere os Secrets e use imagens correspondentes ao commit salvo. O ensaio
acima deliberadamente ignora donos/permissões para verificar os dados em bases
temporárias; não é um comando para substituir produção.

Este backup não inclui mensagens RabbitMQ nem os volumes de Prometheus/Grafana.
É proteção dos dados da aplicação e de sua configuração. Antes de a fila
armazenar trabalho importante, será necessário acrescentar sua estratégia
de recuperação. Exporte dashboards personalizados do Grafana se criar algum.

## 21. Atualizar o código e voltar à imagem anterior

O deploy deste roteiro é **manual**: um `git push` sozinho não altera a VPS.
Isso evita exigir um runner GitHub Actions antes de você validar o primeiro
deploy. CI pode automatizar a mesma sequência depois, mas não está instalado
por estes passos e não requer abrir outro usuário no SSH.

Antes de atualizar, execute o backup do passo 20, copie-o para fora e confira
as migrations do commit novo. **Não aplique migrations que removem/renomeiam
campos enquanto o código em uso ainda depende deles.** A versão inspecionada
deste repositório contém essa incompatibilidade no auth, descrita no início;
não é correto afirmar que todas as migrations atuais são aditivas.

**Servidor / Bash — depois de o commit estar compatível e publicado:**

```bash
source /opt/braid/env.sh
cd /opt/braid/src
test -z "$(git status --porcelain)" || { echo "Há alterações locais; pare para preservá-las"; exit 1; }
export GIT_SSH_COMMAND="ssh -i /opt/braid/private/github-deploy -o IdentitiesOnly=yes"
git pull --ff-only
cp /opt/braid/release.env /opt/braid/previous-release.env
export SHA=$(git rev-parse HEAD)
printf 'export SHA=%q\n' "$SHA" > /opt/braid/release.env
```

Repita os comandos de build, migrations e importação do **passo 12**, incluindo
a checagem de compatibilidade do auth. Só se todos terminarem com sucesso:

```bash
source /opt/braid/release.env
sed "s/REPLACE_SHA/$SHA/g" /opt/braid/k8s/apps.template.yaml > /opt/braid/k8s/apps.yaml
kubectl apply -f /opt/braid/k8s/apps.yaml
for app in api auth web; do
  kubectl -n braid rollout status "deployment/$app" --timeout=300s || exit 1
done
```

Repita o teste de login/criação/recarregamento do passo 19. Não execute
`kubectl apply -f /opt/braid/k8s/` indiscriminadamente: a pasta também contém
um template ainda sem SHA e valores Helm, que não são recursos prontos.

Se uma nova imagem falhar **e o banco continuar compatível com a imagem antiga**:

```bash
source /opt/braid/previous-release.env
sudo k3s ctr images list | grep -F "$SHA"
sed "s/REPLACE_SHA/$SHA/g" /opt/braid/k8s/apps.template.yaml > /opt/braid/k8s/apps.yaml
kubectl apply -f /opt/braid/k8s/apps.yaml
for app in api auth web; do
  kubectl -n braid rollout status "deployment/$app" --timeout=300s || exit 1
done
cp /opt/braid/previous-release.env /opt/braid/release.env
```

Rollback de imagem não desfaz migrations. Não aplique arquivos `down.sql`
automaticamente: podem perder dados escritos após o deploy. Conserve imagens
anteriores no nó e não execute limpezas amplas de Docker/containerd enquanto
forem sua possibilidade de retorno. Para vários nós, será necessário distribuir
as imagens, normalmente usando registry.

Troca só de credencial: atualize o Secret e execute
`kubectl -n braid rollout restart deployment/NOME` no app afetado.
Senha PostgreSQL/RabbitMQ já inicializada exige também alterar a credencial
no próprio serviço; editar apenas Secret não basta.
Se alterar Firebase público ou `BACKEND_URL`, refaça o build web do passo 12.

## 22. Diagnóstico: onde olhar quando um passo não passa

**Servidor / Bash:**

```bash
source /opt/braid/env.sh
kubectl get pods -A
kubectl -n braid get events --sort-by=.lastTimestamp
kubectl -n braid logs deployment/api --tail=80
kubectl -n braid logs deployment/auth --tail=80
kubectl -n braid logs deployment/web --tail=80
kubectl -n edge logs deployment/cloudflared --tail=80
kubectl -n kube-system logs deployment/traefik --tail=80
sudo journalctl -u k3s -n 80 --no-pager
df -h /
free -h
```


| Resultado                      | O que significa / próxima verificação                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `Pending`                      | Pod sem recurso ou volume; `kubectl -n braid describe pod NOME` mostra o motivo     |
| `ErrImageNeverPull`            | A imagem/SHA não está no containerd; repita a importação do passo 12                   |
| `ImagePullBackOff` em infra    | Falha ao baixar imagem pública; examine Events do pod e conectividade                  |
| `CrashLoopBackOff`             | Processo encerra; leia `kubectl -n braid logs POD --previous`                       |
| Auth ready 503                 | Compare versão esperada no código com `auth_schema_meta`, confira grants e chave ativa |
| API responde 401               | Sem token isso é esperado; valide pelo login real no web                               |
| Web 502 em `/api/*`            | Confira API pronta e `BACKEND_URL` incorporada no build                                |
| Firebase `unauthorized-domain` | Adicione `timeline.SEUDOMINIO` nos domínios autorizados                                |
| Cloudflare 1033                | Tunnel sem conector saudável; confira deployment/logs cloudflared                      |
| Cloudflare 502                 | Tunnel conectado, mas origem inacessível; confira Service Traefik e URL interna        |
| Traefik 404                    | Não encontrou rota; confira hostname, HTTP Host Header e Ingress                       |
| Painel acessível sem Access    | Policy/hostname errado ou acesso direto à origem; feche a publicação até corrigir      |
| Redirect infinito              | Confira Always Use HTTPS na borda e ausência de redirect no Traefik interno            |
| `OOMKilled`                    | Processo excedeu memória; veja consumo/limites, não conte swap como RAM disponível     |
| DNS/timeouts nos pods          | Confira UFW, forwarding do Docker, CoreDNS e interface `cni0`                          |
| PVC `Pending`                  | Confira local-path-provisioner e espaço em disco                                       |
| OTP falha com auth saudável    | Twilio pendente/restrição de conta ou incompatibilidade do código MFA                  |
| Grafana sem logs dos apps      | Este roteiro instala métricas, não um coletor de logs                                  |


Não resolva falha de readiness removendo a probe, nem erro do banco apagando PVC.
A prova final é o fluxo do usuário funcionando, persistindo dados e respeitando
a proteção dos painéis. Os comandos e manifests deste documento foram revisados
localmente; a instalação real e os testes de rede dependem da execução na VPS.