# Fase 1 — k3s instalado e endurecido

## 1. Objetivo

Um cluster k3s de um nó rodando ao lado do Compose, sem porta pública nova, com
`kubectl` acessível da sua máquina por túnel SSH e com o datastore incluído no backup.

## 2. Por que isso existe

Esta é a fase que a [ADR-001](../docs/adr/001-docker-compose-vs-k3s.md) do v1 recusou, e
recusou com razão: 600–800 MiB de control plane em 4 GiB é 20% da máquina antes de
qualquer aplicação. Com 16 GiB o mesmo custo é 4%, e o que ele compra passa a valer —
está listado em [`adr/101-k3s-plataforma.md`](adr/101-k3s-plataforma.md).

O que esta fase **não** faz é migrar nada. O cluster sobe vazio, ao lado do Compose que
continua servindo produção. Isso é deliberado: instalar Kubernetes e migrar carga no mesmo
dia junta dois conjuntos de problemas que você quer poder distinguir.

O ponto sensível é a superfície nova. O k3s abre a API do Kubernetes na `6443` e escreve
um kubeconfig com credencial de administrador do cluster em
`/etc/rancher/k3s/k3s.yaml`. Nenhuma das duas coisas pode ficar solta.

## 3. Passo a passo

### 3.1 — Confirmar o firewall antes

⚠️ Faça isto **antes** de instalar. Depois, a porta já está aberta no processo, e você vai
estar verificando o que já é fato consumado.

```bash
# 🖥️ servidor
ufw status verbose
```

Esperado: `22`, `80` e `443` permitidas, política padrão de entrada `deny`. O instalador
do k3s não mexe no UFW — mas ele também não pede permissão, então a política padrão `deny`
é o que mantém a `6443` fechada.

### 3.2 — Decidir sobre o swap

O v1 mantinha 4 GiB de swap com `vm.swappiness=10`. O kubelet, por padrão, se recusa a
subir com swap ativo, porque a contabilidade de memória dele pressupõe que não há.

Com 16 GiB e `PriorityClass` configurada, o swap deixa de ser necessário: o mecanismo de
absorver pressão passa a ser o despejo ordenado, que é melhor que swap porque é previsível
e observável.

```bash
# 🖥️ servidor
swapoff -a
sed -i.bak '/swap/s/^/#/' /etc/fstab
free -h
```

Se preferir manter o swap — decisão legítima se você quiser um amortecedor extra durante a
migração — acrescente `--kubelet-arg=fail-swap-on=false` na instalação e aceite que
`kubectl top` e o despejo por pressão ficam menos precisos. Registre a escolha.

### 3.3 — Instalar o k3s

```bash
# 🖥️ servidor — como root
curl -sfL https://get.k3s.io | INSTALL_K3S_VERSION="vFIXE_UMA_VERSAO" sh -s - server \
  --disable=traefik \
  --disable=servicelb \
  --secrets-encryption \
  --write-kubeconfig-mode=600 \
  --node-name=vps-1
```

Cada flag tem motivo:

| Flag | Motivo |
|---|---|
| `INSTALL_K3S_VERSION` | versão fixa. `latest` num servidor de produção significa que uma reinstalação daqui a seis meses te dá outra coisa |
| `--disable=traefik` | o k3s traz um Traefik gerenciado por um CRD próprio dele. A Fase 3 instala o nosso, pelo Flux — ver [ADR-102](adr/102-traefik-via-helm.md) |
| `--disable=servicelb` | o load balancer embutido resolve um problema de nuvem que não existe aqui; o Traefik usa `hostPort` direto |
| `--secrets-encryption` | Secrets do Kubernetes são **base64, não criptografia**. Sem esta flag, quem lê o datastore lê todo segredo em claro |
| `--write-kubeconfig-mode=600` | o padrão `644` deixa a credencial de admin do cluster legível por qualquer usuário do servidor |

### 3.4 — Verificar que a 6443 não vazou

⚠️ Passo obrigatório, não opcional.

```bash
# 🖥️ servidor
ss -tulpn | grep 6443
ufw status | grep 6443
```

Esperado: o `ss` mostra o k3s escutando em `*:6443`; o `ufw status` **não** mostra
nenhuma regra para 6443. O processo escuta, o firewall bloqueia.

```bash
# 💻 local
nmap -Pn -p 6443 SEU_IP
```

Esperado: `filtered`. Se vier `open`, pare e corrija o firewall antes de qualquer outra
coisa.

### 3.5 — kubectl da máquina Windows, por túnel

Copie `/etc/rancher/k3s/k3s.yaml` do servidor para `~/.kube/config-vps` na sua máquina.
O arquivo já aponta para `https://127.0.0.1:6443`, que é o endereço certo — porque o
acesso vai ser por túnel.

```bash
# 💻 local — deixe rodando num terminal
ssh -N -L 6443:127.0.0.1:6443 SEU_USUARIO@SEU_IP
```

```bash
# 💻 local — noutro terminal
export KUBECONFIG=~/.kube/config-vps
kubectl get nodes
```

O kubeconfig contém uma credencial de administrador do cluster. Trate o arquivo como
chave privada: modo `600`, fora de qualquer diretório sincronizado com nuvem, e nunca no
git.

### 3.6 — Namespaces, PriorityClass e quota

```bash
# ☸️ cluster
kubectl create namespace prod
kubectl create namespace ingress
kubectl create namespace observability
kubectl create namespace staging
```

```yaml
# priorityclasses.yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata: {name: prod-critical}
value: 1000
globalDefault: false
description: "Postgres, Redis e Traefik. Ultimos a serem despejados."
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata: {name: prod-default}
value: 500
globalDefault: true
description: "web, api, litellm e observabilidade."
---
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata: {name: low}
value: 100
globalDefault: false
description: "Staging. Primeiro a ser despejado sob pressao de memoria."
```

Esta é a peça que substitui o swap como amortecedor: sob pressão, o kubelet despeja por
prioridade, e o staging vai antes do banco. É o comportamento que o OOM killer do v1 não
tinha como ter.

### 3.7 — Backup do datastore

O k3s de um nó usa SQLite, não etcd. `k3s etcd-snapshot` **não** se aplica.

Acrescente ao `/opt/stack/backup.sh` que já existe:

```bash
# 🖥️ servidor
systemctl stop k3s
tar czf "$backup_dir/k3s-datastore.tar.gz" \
  /var/lib/rancher/k3s/server/db \
  /var/lib/rancher/k3s/server/token \
  /var/lib/rancher/k3s/server/tls
systemctl start k3s
```

Sem o `token` e o diretório `tls`, o `db` restaurado não abre: as chaves de criptografia
dos Secrets e a CA do cluster vivem ali. Enquanto o backup for feito com o cluster ainda
vazio, a parada de serviço não custa nada — por isso este passo entra agora, e não depois.

## 4. Por que não fazer diferente

**Manter o Traefik embutido do k3s.** Ele funciona, e para um cluster de brinquedo é o
caminho mais curto. Aqui atrapalha: a configuração dele vive num objeto que o próprio k3s
reconcilia, o que cria um segundo dono para um recurso que a Fase 6 quer entregar pelo
Flux. Dois donos do mesmo objeto é a receita de um drift que ninguém explica. Se você não
fosse fazer GitOps, mantê-lo seria a escolha certa.

**k3d ou kind.** Ferramentas de cluster local em Docker, ótimas para desenvolvimento na
máquina Windows — e vale usá-las lá. No servidor, elas colocam Kubernetes dentro de Docker
dentro de um VPS, somando uma camada por nada.

**MicroK8s ou k0s.** Equivalentes defensáveis. O k3s foi escolhido pelo tamanho da
comunidade e do material disponível, que é o mesmo critério que descartou o Nomad na
ADR-001 do v1.

**Kubernetes completo (kubeadm).** Faz sentido quando o objetivo é aprender a operar
exatamente o que a empresa opera, ou quando algum componente exige um control plane
padrão. Custa mais RAM e muito mais manutenção para o mesmo resultado funcional aqui.

**Expor a 6443 com allowlist de IP.** Mais confortável no dia a dia que o túnel.
Descartado porque IP residencial muda, e a regra de ouro do v1 sobre a quarta porta
pública continua valendo. O túnel custa um terminal aberto.

## 5. Como garantir que está certo

```bash
# ☸️ cluster
kubectl get nodes -o wide
```

Esperado: um nó `vps-1` em `Ready`, com a versão que você fixou.

```bash
# ☸️ cluster
kubectl get pods -A
```

Esperado: apenas `coredns`, `local-path-provisioner` e `metrics-server` em `Running`.
**Nenhum pod do Traefik e nenhum começando com `svclb-`** — se aparecerem, os `--disable`
não pegaram.

```bash
# ☸️ cluster
kubectl get priorityclass
```

Esperado: `prod-critical`, `prod-default` (marcada como default global) e `low`.

```bash
# 🖥️ servidor
k3s secrets-encrypt status
```

Esperado: `Encryption Status: Enabled`.

```bash
# 🖥️ servidor
free -h
docker ps --format '{{.Names}}' | wc -l
```

Esperado: o consumo subiu entre 500 e 800 MiB em relação à Fase 0, e a contagem de
containers Docker é a mesma — a produção não foi tocada.

## 6. Armadilhas comuns

**`kubectl` da sua máquina responde `connection refused`.** O túnel SSH caiu. Ele não se
reconecta sozinho; use `ssh -N -L ... -o ServerAliveInterval=30` ou um `autossh`.

**`The connection to the server localhost:8080 was refused`.** O `KUBECONFIG` não está
exportado nesse terminal e o `kubectl` caiu no padrão. É o erro mais comum de todos.

**Pods presos em `Pending` com `Insufficient memory`.** A soma dos `requests` passou da
capacidade. Note que a mensagem fala de requests, não de uso real — o nó pode estar com
60% de RAM livre e ainda assim recusar o pod. Entender isso é metade de operar Kubernetes.

**`x509: certificate signed by unknown authority` depois de reinstalar.** O k3s gerou uma
CA nova; o kubeconfig antigo aponta para a CA velha. Copie o arquivo de novo.

**Rodar `k3s-uninstall.sh` para "recomeçar limpo".** ⚠️ Ele apaga o datastore, os Secrets e
todos os PVs de `local-path` sem confirmação. Depois da Fase 4 isso significa apagar o
banco. Nunca execute sem um restore testado na mão.

**Swap desligado sem ajustar o `/etc/fstab`.** O `swapoff -a` não sobrevive ao reboot, e o
kubelet vai se recusar a subir depois de uma reinicialização — falha que aparece semanas
depois, no pior momento.

## 7. Para estudar

- 🆓 [k3s — Server Configuration Reference](https://docs.k3s.io/cli/server) — o que cada flag faz.
- 🆓 [Kubernetes — Managing Resources for Containers](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/) — requests, limits e QoS. Leia antes da Fase 5.
- 🆓 [Kubernetes — Node-pressure Eviction](https://kubernetes.io/docs/concepts/scheduling-eviction/node-pressure-eviction/) — como o kubelet escolhe a vítima, que é o assunto que substitui o OOM killer do v1.
- 🆓 [Kubernetes — Encrypting Secret Data at Rest](https://kubernetes.io/docs/tasks/administer-cluster/encrypt-data/)
- 💰 *Kubernetes Up & Running*, Burns, Beda, Hightower — capítulos 1–5 e 11.
