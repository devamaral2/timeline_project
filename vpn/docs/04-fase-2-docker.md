# Fase 2 — Docker: instalação, rede e limites

## Objetivo

Ao final desta fase, o Docker está instalado pelo repositório oficial, com rotação de
logs configurada, as três redes criadas, e — o ponto central — você entendeu e neutralizou
o fato de que **o Docker ignora o firewall que você acabou de configurar**.

---

## Por que isso existe

Esta é a fase mais importante da spec do ponto de vista de segurança, e a que mais gente
pula.

Você configurou o UFW com `default deny incoming`. Parece que só 22, 80 e 443 estão
abertas. Agora suponha que você suba um Postgres com esta linha, que aparece em
praticamente todo tutorial:

```yaml
services:
  postgres:
    ports:
      - "5432:5432"
```

**Seu Postgres está exposto à internet inteira.** O `ufw status` continua dizendo
`deny (incoming)`. O firewall não está quebrado, e você não errou a configuração dele.

O motivo é arquitetural: quando você publica uma porta, o Docker insere regras de NAT
diretamente na tabela `nat`, na chain `PREROUTING`, e regras de filtro numa chain própria
chamada `DOCKER`. O tráfego destinado a containers é processado nesse caminho **antes** de
chegar à chain `ufw-input` onde ficam suas regras. O UFW nunca é consultado.

O resultado é uma das configurações mais perigosas que existem, porque ela é
*silenciosa*: nada dá erro, nada aparece no log, e `ufw status` te dá confiança falsa.
Um Postgres exposto com senha fraca é encontrado por scanners automatizados em questão de
horas — existem botnets inteiras dedicadas a isso.

🔒 Este item é o nº 1 do [checklist de segurança](11-seguranca-checklist.md).

---

## Passo a passo

### 2.1 — Instalar o Docker pelo repositório oficial

```bash
# 🖥️ servidor
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
```

```bash
# 🖥️ servidor
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io \
                    docker-buildx-plugin docker-compose-plugin
```

**Se seu VPS roda Debian**, troque `ubuntu` por `debian` nas duas URLs.

**Por que não `apt install docker.io`?** Esse pacote vem dos repositórios da distribuição
e costuma estar várias versões atrás. Você perde recursos recentes do Compose e demora
mais para receber correções de segurança.

**Por que não o script `get.docker.com`?** Ele funciona, e é o que a maioria usa. Mas é
um script que você executa como root sem ler, vindo da internet. O caminho manual acima
é o mesmo processo, explícito, com a chave GPG verificada. É bom hábito.

Adicione seu usuário ao grupo `docker`:

```bash
# 🖥️ servidor
sudo usermod -aG docker deploy
```

⚠️ **Entenda o que isso significa:** o grupo `docker` é equivalente a root. Quem pode
falar com o socket do Docker pode montar `/` dentro de um container e virar root no host
em um comando. Não é uma falha — é o design. Adicione ao grupo apenas usuários em quem
você confiaria com root.

Saia e entre novamente no SSH para o grupo passar a valer.

### 2.2 — Configurar o daemon

🔒 Este arquivo resolve dois problemas que derrubam VPS pequenos.

```bash
# 🖥️ servidor
sudo nano /etc/docker/daemon.json
```

```json
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "live-restore": true,
  "userland-proxy": false,
  "no-new-privileges": true
}
```

O que cada opção faz e por que importa:

**`log-opts`** — por padrão, o Docker guarda logs em JSON **sem limite de tamanho**. Uma
app com log verboso ou em loop de erro escreve gigabytes em horas. Quando o disco enche,
o Postgres não consegue escrever, o Traefik não consegue logar, e tudo cai junto — com a
agravante de que o sistema fica difícil até de diagnosticar, porque nada consegue
escrever. **Esta é a causa nº 1 de queda em VPS pequeno**, e é uma linha de configuração.
10MB × 3 arquivos × N containers é um teto previsível.

**`live-restore`** — permite reiniciar o daemon do Docker sem matar os containers. Útil
ao atualizar o Docker sem derrubar a produção.

**`userland-proxy: false`** — desativa o processo `docker-proxy`, que consome ~2MB de RAM
por porta publicada e adiciona um salto desnecessário. Com `false`, o encaminhamento é
feito só por iptables, que é mais rápido.

**`no-new-privileges`** — impede que processos dentro de containers ganhem privilégios
via binários setuid. Definido aqui, vale como padrão para todos os containers.

```bash
# 🖥️ servidor
sudo systemctl restart docker
sudo systemctl enable docker
```

### 2.3 — 🔒 Fechar o furo do Docker no firewall

Duas defesas, em camadas. Use **as duas**.

#### Defesa 1: nunca publique portas desnecessárias (a principal)

A regra estrutural da arquitetura: **apenas o Traefik declara `ports:`**. Todo o resto
usa `expose:`, que abre a porta apenas para outros containers da mesma rede Docker, nunca
para o host nem para a internet.

```yaml
# ERRADO - expoe a internet inteira, furando o UFW
services:
  postgres:
    ports:
      - "5432:5432"

# CERTO - so containers da mesma rede alcancam
services:
  postgres:
    expose:
      - "5432"

# ACEITAVEL - se voce realmente precisa acessar do proprio host
services:
  postgres:
    ports:
      - "127.0.0.1:5432:5432"
```

A terceira forma vincula ao *loopback*: acessível de dentro do servidor, invisível de
fora. Mas prefira o túnel SSH (mostrado na [Fase 6](08-fase-6-postgres-e-redis.md)) — dá
o mesmo resultado sem abrir nada.

#### Defesa 2: rede de proteção no iptables

Se um dia você (ou um `docker run` apressado, ou um exemplo copiado) publicar uma porta
por engano, esta regra impede que ela seja alcançada de fora. O Docker deixa
deliberadamente uma chain vazia chamada `DOCKER-USER`, processada **antes** das regras
dele, exatamente para isso.

```bash
# 🖥️ servidor
sudo apt install -y iptables-persistent
```

```bash
# 🖥️ servidor — bloqueia trafego externo para containers,
# permitindo apenas conexoes ja estabelecidas e a rede interna do Docker
sudo iptables -I DOCKER-USER -i eth0 -m conntrack --ctstate RELATED,ESTABLISHED -j RETURN
sudo iptables -I DOCKER-USER -i eth0 -s 172.16.0.0/12 -j RETURN
sudo iptables -A DOCKER-USER -i eth0 -j DROP
```

⚠️ Confirme o nome da sua interface de rede antes — nem sempre é `eth0`:

```bash
# 🖥️ servidor
ip route get 1.1.1.1 | awk '{print $5; exit}'
```

Use o nome retornado no lugar de `eth0`. Em VPS modernos costuma ser `ens3`, `enp1s0`
ou similar.

Torne as regras persistentes (sem isso, somem no reboot):

```bash
# 🖥️ servidor
sudo netfilter-persistent save
```

⚠️ Depois dessa regra, o Traefik continua funcionando? **Sim** — a chain `DOCKER-USER`
só afeta tráfego *roteado para containers*. As portas 80/443 do Traefik chegam por
DNAT e... na verdade, também passam por ali. Por isso o teste da seção de verificação é
obrigatório: se o Traefik parar de responder depois desta regra, adicione exceções
explícitas para 80 e 443:

```bash
# 🖥️ servidor — apenas se necessario apos o teste
sudo iptables -I DOCKER-USER -i eth0 -p tcp --dport 80 -j RETURN
sudo iptables -I DOCKER-USER -i eth0 -p tcp --dport 443 -j RETURN
sudo netfilter-persistent save
```

### 2.4 — Criar as redes

```bash
# 🖥️ servidor
docker network create edge
docker network create --internal data
docker network create --internal observability
```

A flag `--internal` remove a rota padrão para fora: containers ali não alcançam a
internet. É a barreira que impede exfiltração de dados e download de ferramentas caso um
container seja comprometido.

⚠️ Uma consequência prática: um container ligado **somente** a `data` ou
`observability` não consegue baixar nada. A API e o Alloy também participam de `edge`
para o egresso HTTPS; PostgreSQL e Redis ficam apenas em `data`.

### 2.5 — Estrutura de diretórios no servidor

```bash
# 🖥️ servidor
sudo mkdir -p /opt/stack/{traefik,apps,data,observability,backups}
sudo chown -R deploy:deploy /opt/stack
chmod 750 /opt/stack
```

`/opt` é o lugar convencional para software não gerenciado pelo gerenciador de pacotes.
Manter tudo sob um diretório facilita backup e deixa óbvio o que é seu versus o que é
do sistema.

### 2.6 — Padrão de limites para todo serviço

Todo serviço no compose segue este esqueleto. 🔒 A ausência de `mem_limit` é um risco
real: um vazamento de memória em qualquer container aciona o OOM killer, que escolhe a
vítima por heurística — frequentemente o Postgres, que é o processo com maior consumo.

```yaml
services:
  exemplo:
    image: ghcr.io/usuario/exemplo:sha
    restart: unless-stopped
    mem_limit: 192m
    memswap_limit: 192m          # sem isso, o container usa swap sem limite
    cpus: 0.5
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true              # onde a app permitir
    tmpfs:
      - /tmp
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      retries: 3
      start_period: 20s
    networks:
      - edge
```

Notas sobre escolhas menos óbvias:

- **`memswap_limit` igual a `mem_limit`** — sem isso, o container pode usar swap
  ilimitado. Ele não morre, mas degrada tudo. Igualar significa "sem swap para este
  container": ele morre e reinicia em vez de arrastar o servidor junto.
- **`restart: unless-stopped`** e não `always` — `always` reinicia até containers que
  você parou de propósito, inclusive após reboot. `unless-stopped` respeita sua decisão.
- **`cap_drop: ALL`** — remove todas as capabilities do Linux. A maioria das apps não
  precisa de nenhuma. Se algo quebrar, adicione de volta a específica com `cap_add`, não
  remova o `cap_drop`.
- **`healthcheck`** — sem ele, o Docker considera "rodando" um container cujo processo
  existe mas trava. O Traefik usa esse estado para decidir se manda tráfego.

---

## Por que não fazer diferente

**"Por que não desabilitar `iptables` no Docker (`"iptables": false`)?"** — Aí o Docker
para de criar as regras de NAT, e você passa a escrever tudo à mão. É a solução mais
"correta" conceitualmente e a mais fácil de errar: uma regra faltando e nenhum container
tem rede, ou pior, todos ficam expostos. A combinação `expose:` + `DOCKER-USER` dá
proteção equivalente com muito menos superfície de erro.

**"Por que não Podman, que é rootless por padrão?"** — Podman é tecnicamente superior no
quesito segurança: sem daemon privilegiado, containers rodam como usuário comum. O
problema é ecossistema: o `podman-compose` não tem paridade com o Docker Compose, muitas
imagens e tutoriais assumem Docker, e você encontraria diferenças sutis a cada passo.
Para aprender, o atrito não compensa. **Vale revisitar** quando você estiver confortável
— é o caminho de evolução natural.

**"Por que não Docker rootless?"** — Existe e funciona, mas complica bind de portas
privilegiadas (80/443 exigem truque), volumes e rede. Novamente: bom degrau posterior.

**"Por que não Docker Swarm, já que vem embutido?"** — Swarm traz secrets nativos e
rolling updates, o que é atraente. Mas está em manutenção mínima há anos, a comunidade
minguou, e você teria dificuldade de achar respostas. Compose tem futuro mais previsível.
Ver [ADR-001](adr/001-docker-compose-vs-k3s.md).

**"Por que não deixar o log padrão e limpar quando encher?"** — Porque quando encher você
descobre pelo sistema parado, e o momento de descobrir será às 3h de um sábado. Custo de
prevenir: cinco linhas de JSON.

---

## Como garantir que está certo

**Docker instalado e funcionando:**

```bash
# 🖥️ servidor
docker --version
docker compose version
docker run --rm hello-world
```
→ Esperado: versões recentes e a mensagem "Hello from Docker!".

**Configuração do daemon aplicada:**

```bash
# 🖥️ servidor
docker info --format '{{.LoggingDriver}}'
docker info | grep -A3 'Log'
```

**Redes criadas com o isolamento certo:**

```bash
# 🖥️ servidor
docker network ls
docker network inspect data --format '{{.Internal}}'
docker network inspect observability --format '{{.Internal}}'
docker network inspect edge --format '{{.Internal}}'
```
→ Esperado: `true` para `data` e `observability`, `false` para `edge`.

**A rede interna realmente não alcança a internet:**

```bash
# 🖥️ servidor
docker run --rm --network data alpine sh -c "wget -T3 -qO- https://example.com || echo BLOQUEADO"
```
→ Esperado: `BLOQUEADO`. Se baixar a página, a rede `data` não está interna — recrie.

**⚠️ O teste mais importante desta fase — o furo do firewall:**

```bash
# 🖥️ servidor — sobe um container com porta publicada de proposito
docker run -d --name teste-exposicao -p 9999:80 nginx:alpine
sudo ufw status | grep 9999
```
→ Esperado: **nenhuma regra** para 9999 no UFW. Ou seja, o UFW não sabe que essa porta
existe.

Agora, da **sua máquina**, teste se o mundo enxerga:

```bash
# 💻 local (PowerShell)
Test-NetConnection SEU_IP -Port 9999
```

→ **Sem a regra `DOCKER-USER`:** `TcpTestSucceeded : True` — este é o furo, ao vivo.
→ **Com a regra `DOCKER-USER`:** `TcpTestSucceeded : False` — a proteção funcionou.

Faça este teste de verdade. Ver com os próprios olhos que o UFW dizia "deny" enquanto a
porta respondia é o que fixa a lição.

Limpe depois:

```bash
# 🖥️ servidor
docker rm -f teste-exposicao
```

**O Traefik ainda vai funcionar?** Valide que 80 continua alcançável:

```bash
# 🖥️ servidor
docker run -d --name teste-80 -p 80:80 nginx:alpine
```
```bash
# 💻 local
Test-NetConnection SEU_IP -Port 80
```
→ Esperado: `True`. Se der `False`, adicione as exceções de 80/443 mostradas no passo 2.3.

```bash
# 🖥️ servidor
docker rm -f teste-80
```

**Regras persistem após reboot** — o teste que quase ninguém faz:

```bash
# 🖥️ servidor
sudo reboot
```
Após voltar:
```bash
# 🖥️ servidor
sudo iptables -L DOCKER-USER -n
swapon --show
sudo ufw status
```
→ Esperado: tudo como antes do reboot. Se as regras do `DOCKER-USER` sumiram, o
`netfilter-persistent save` não foi executado.

---

## Armadilhas comuns

**`permission denied while trying to connect to the Docker daemon socket`** — você não
saiu e entrou de novo depois do `usermod -aG docker`. Grupos só valem em sessão nova.
`newgrp docker` resolve na sessão atual.

**Regras de iptables somem no reboot.** `iptables-persistent` precisa do
`netfilter-persistent save` explícito após cada mudança. É o erro mais comum aqui, e
silencioso: você fica protegido até o primeiro reboot.

**Interface não é `eth0`.** Se você aplicou as regras com o nome errado, elas não fazem
nada — e o teste da porta 9999 vai revelar isso. Sempre confirme com
`ip route get 1.1.1.1`.

**`no-new-privileges` no `daemon.json` quebra algum container.** Raro, mas acontece com
imagens que dependem de `sudo` interno. A solução é corrigir a imagem, não remover a
proteção global.

**Container ligado somente a uma rede interna não sobe porque tenta baixar algo.** É o
comportamento esperado. Mova a instalação para o Dockerfile ou, se o processo realmente
precisa de egresso em runtime, ligue apenas esse processo também à `edge`.

**Confundir `expose` com `ports`.** `expose` é praticamente documentação — a porta já é
acessível entre containers da mesma rede mesmo sem declarar. `ports` é que publica no
host. Declarar `expose` mesmo assim vale pela clareza de leitura.

---

## Para estudar

- 🆓 **Docker docs: "Packet filtering and firewalls"** — a página oficial que explica a
  chain `DOCKER-USER` e reconhece explicitamente o conflito com UFW. Leitura obrigatória
  desta fase.
- 🆓 **"Docker and iptables"** — vale complementar com qualquer artigo que mostre
  `iptables -t nat -L -n` antes e depois de subir um container com `-p`. Ver as regras
  aparecendo torna o mecanismo concreto.
- 🆓 **CIS Docker Benchmark** — checklist de hardening usado por auditoria profissional.
  Extenso; leia as seções 2 (daemon) e 5 (runtime).
- 🆓 **Docker Compose specification** (docs.docker.com/reference/compose-file) — a
  referência completa de todas as chaves. Consulte em vez de decorar.
- 💰 **"Docker Deep Dive"** (Nigel Poulton) — o melhor livro introdutório. Curto, direto,
  e os capítulos de rede e armazenamento cobrem exatamente as dúvidas desta fase.
- 🆓 **Canal TechWorld with Nana (YouTube)** — "Docker Tutorial for Beginners" é longo mas
  cobre o modelo mental inteiro de uma vez, com boa qualidade didática.
