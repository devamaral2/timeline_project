# Fase 5 — Traefik e TLS

## Objetivo

Ao final desta fase, o Traefik está no ar como única porta de entrada do servidor,
roteando para a `hello-api`, com headers de segurança e rate limit aplicados. O TLS é
feito em **duas etapas**: primeiro validando tudo sem domínio, depois ativando Let's
Encrypt quando você registrar um.

---

## Por que isso existe

Sem reverse proxy, cada app precisaria de uma porta pública própria, seu próprio
certificado TLS e sua própria renovação. Com dez apps, isso é dez portas abertas e dez
processos de certificado para manter — insustentável.

O Traefik centraliza: uma porta 443 para tudo, um lugar só onde TLS é terminado, e
roteamento por domínio ou caminho. Além disso, ele é o ponto natural para aplicar
políticas transversais — rate limit, headers de segurança, autenticação — sem tocar no
código de nenhuma app.

O diferencial do Traefik é a **descoberta automática via labels do Docker**: você declara
o roteamento no próprio serviço, no `docker-compose.yml`, e o Traefik reconfigura sozinho
quando o container sobe. Não há arquivo central para editar a cada nova app, e não há
`reload` para lembrar de executar.

**Sobre a ordem em duas etapas:** você ainda não tem domínio. A tentação é esperar para
fazer tudo de uma vez, mas isso significa validar Traefik, roteamento, TLS, DNS e ACME
simultaneamente — e quando não funcionar, você não sabe qual dos cinco falhou. Pior: o
Let's Encrypt tem rate limits agressivos (**5 falhas por hora** por conta/domínio, e
50 certificados por domínio registrado por semana). Errar a configuração cinco vezes te
bloqueia por uma hora; errar com o domínio de produção repetidamente pode te bloquear por
uma semana. Validar tudo antes é o que evita isso.

---

## Passo a passo — Etapa A: sem domínio

### 5.1 — Configuração estática do Traefik

A configuração do Traefik se divide em duas: **estática** (lida uma vez na inicialização
— entrypoints, providers, resolvers de certificado) e **dinâmica** (recarregada a quente
— rotas, middlewares, serviços). Confundir as duas é a maior fonte de frustração com a
ferramenta: colocar uma rota na estática significa reiniciar o Traefik a cada mudança;
colocar um entrypoint na dinâmica simplesmente não funciona.

```bash
# 🖥️ servidor
mkdir -p /opt/stack/traefik/dynamic
mkdir -p /opt/stack/traefik/certs
touch /opt/stack/traefik/certs/acme.json
chmod 600 /opt/stack/traefik/certs/acme.json
```

🔒 O `chmod 600` no `acme.json` é obrigatório — o Traefik **se recusa a iniciar** se o
arquivo estiver com permissão frouxa, porque ele contém a chave privada da sua conta ACME
e as chaves privadas dos certificados.

`/opt/stack/traefik/traefik.yml`:

```yaml
global:
  checkNewVersion: false
  sendAnonymousUsage: false

entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
          permanent: true
  websecure:
    address: ":443"
    http:
      middlewares:
        - security-headers@file
    transport:
      respondingTimeouts:
        readTimeout: 60s
        writeTimeout: 60s
        idleTimeout: 180s

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
    network: edge
  file:
    directory: /etc/traefik/dynamic
    watch: true

api:
  dashboard: true
  insecure: false

log:
  level: INFO

accessLog:
  filePath: "/var/log/traefik/access.log"
  bufferingSize: 100
  filters:
    statusCodes:
      - "400-599"
```

Pontos que merecem atenção:

🔒 **`exposedByDefault: false`** — sem isso, **todo** container que subir vira uma rota
pública automaticamente. Um container de teste, um banco de dados, qualquer coisa. Com
`false`, só é exposto quem tem `traefik.enable=true` explícito. Este é o item de segurança
mais importante da configuração.

🔒 **`api.insecure: false`** — com `true`, o dashboard fica disponível na porta 8080 sem
autenticação nenhuma. Ele mostra todas as suas rotas, serviços, middlewares e a topologia
inteira da sua infraestrutura. É um mapa pronto para quem quiser atacar. Praticamente todo
tutorial usa `insecure: true` "para facilitar" — não copie.

**`redirections` no entrypoint `web`** — todo HTTP vira HTTPS automaticamente, com 301
permanente. A porta 80 continua aberta porque o desafio HTTP-01 do Let's Encrypt precisa
dela.

**`accessLog` filtrado por status 400–599** — logar toda requisição bem-sucedida enche o
disco rápido. Só erros já dá o essencial para diagnóstico, e o volume cai
drasticamente.

**`network: edge`** — diz ao Traefik por qual rede alcançar os containers, quando eles
estão em várias.

### 5.2 — Configuração dinâmica: middlewares

`/opt/stack/traefik/dynamic/middlewares.yml`:

```yaml
http:
  middlewares:
    security-headers:
      headers:
        frameDeny: true
        contentTypeNosniff: true
        browserXssFilter: true
        referrerPolicy: "strict-origin-when-cross-origin"
        stsSeconds: 31536000
        stsIncludeSubdomains: true
        stsPreload: true
        forceSTSHeader: true
        customResponseHeaders:
          X-Powered-By: ""
          Server: ""

    rate-limit:
      rateLimit:
        average: 50
        burst: 100
        period: 1s

    rate-limit-strict:
      rateLimit:
        average: 5
        burst: 10
        period: 1s

    compress:
      compress: {}

    # Usado nas rotas internas (Grafana, dashboard).
    # Gere o hash com: htpasswd -nbB admin 'SENHA'
    internal-auth:
      basicAuth:
        users:
          - "admin:$2y$05$COLOQUE_O_HASH_AQUI"
```

O que cada header faz:

| Header | Proteção |
|---|---|
| `frameDeny` | Impede que seu site seja embutido em iframe — bloqueia clickjacking |
| `contentTypeNosniff` | Impede o navegador de "adivinhar" o tipo do conteúdo |
| `stsSeconds` (HSTS) | Força o navegador a só usar HTTPS naquele domínio por 1 ano |
| `referrerPolicy` | Limita o que vaza no header `Referer` ao sair do site |
| `X-Powered-By: ""` | Remove a pista de qual stack você usa |

⚠️ **Cuidado com HSTS.** Depois que um navegador recebe `stsSeconds: 31536000`, ele
**recusa** conexões HTTP naquele domínio por um ano — e não há como cancelar do lado do
servidor. Se você ativar isso antes de ter HTTPS estável, o domínio fica inacessível para
quem já visitou. Ative o HSTS **somente na Etapa B**, com o certificado funcionando. Na
Etapa A, comente as linhas `sts*`.

`stsPreload` vai além: submete o domínio a uma lista embutida nos navegadores. Sair dessa
lista leva meses. Não ative até ter certeza absoluta.

**Dois níveis de rate limit:** o normal (50 req/s) para tráfego geral, e o estrito
(5 req/s) para rotas sensíveis como login. Isso é a defesa de camada 7 que complementa o
fail2ban da [Fase 1](03-fase-1-hardening-do-so.md) — o fail2ban protege o SSH, o rate
limit protege as aplicações.

### 5.3 — TLS interno para a Etapa A

`/opt/stack/traefik/dynamic/tls-local.yml`:

```yaml
tls:
  stores:
    default:
      defaultGeneratedCert:
        resolver: ""
        domain:
          main: "localhost"
```

Sem resolver configurado, o Traefik gera um certificado autoassinado. O navegador vai
reclamar — é esperado e correto. O objetivo aqui é validar roteamento, middlewares e
conectividade, não confiança.

### 5.4 — O compose do Traefik

`/opt/stack/traefik/docker-compose.yml`:

```yaml
services:
  traefik:
    image: traefik:v3.2
    container_name: traefik
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
      - ./dynamic:/etc/traefik/dynamic:ro
      - ./certs:/certs
      - traefik-logs:/var/log/traefik
    networks:
      - edge
      - observability
    mem_limit: 96m
    memswap_limit: 96m
    security_opt:
      - no-new-privileges:true
    labels:
      - "traefik.enable=true"
      # Dashboard protegido por basic auth - NUNCA sem auth
      - "traefik.http.routers.dashboard.rule=Host(`traefik.localhost`)"
      - "traefik.http.routers.dashboard.entrypoints=websecure"
      - "traefik.http.routers.dashboard.service=api@internal"
      - "traefik.http.routers.dashboard.tls=true"
      - "traefik.http.routers.dashboard.middlewares=internal-auth@file"

volumes:
  traefik-logs:

networks:
  edge:
    external: true
  observability:
    external: true
```

⚠️ 🔒 **Sobre montar `/var/run/docker.sock`:** este é o ponto de maior risco de toda a
arquitetura. Quem tem acesso ao socket do Docker pode criar um container privilegiado
montando `/` do host — ou seja, **root no servidor**. O Traefik precisa dele para
descobrir containers automaticamente.

Três mitigações aplicadas e a definitiva:

1. **`:ro`** (read-only) — ajuda pouco na prática, porque a API do Docker aceita comandos
   por escrita no socket independentemente da flag de montagem do arquivo. Mantenha, mas
   não conte com isso.
2. **O Traefik não expõe nenhuma rota que execute código arbitrário** — a superfície é o
   próprio Traefik, que é um projeto maduro.
3. **Manter o Traefik atualizado** é essencial, justamente por causa desse privilégio.
4. **A solução definitiva** é um *socket proxy* (`tecnativa/docker-socket-proxy`), um
   container mínimo que fica entre o Traefik e o socket e só permite as chamadas de
   leitura que ele precisa (`CONTAINERS=1`, todo o resto negado). Custa ~10MB de RAM.
   Fortemente recomendado depois que a stack estiver estável — está no
   [checklist de segurança](11-seguranca-checklist.md) como melhoria.

### 5.5 — Conectar a hello-api

No compose da aplicação, as labels declaram o roteamento:

```yaml
services:
  hello-api:
    image: ghcr.io/SEU_USUARIO/hello-api:latest
    restart: unless-stopped
    expose:
      - "3000"
    environment:
      NODE_ENV: production
      PORT: 3000
    mem_limit: 192m
    memswap_limit: 192m
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    networks:
      - edge
      - internal
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.hello.rule=Host(`hello.localhost`)"
      - "traefik.http.routers.hello.entrypoints=websecure"
      - "traefik.http.routers.hello.tls=true"
      - "traefik.http.services.hello.loadbalancer.server.port=3000"
      - "traefik.http.routers.hello.middlewares=rate-limit@file,compress@file"
```

⚠️ 🔒 **Nunca exponha `/metrics` publicamente.** Métricas revelam volume de tráfego,
rotas internas, versões e padrões de uso — informação valiosa para quem está mapeando seu
sistema. O coletor da [Fase 8](10-fase-8-observabilidade.md) acessa pela rede interna,
sem passar pelo Traefik. Se por algum motivo precisar expor, adicione um router
específico com `internal-auth@file`.

### 5.6 — Subir e testar via túnel SSH

```bash
# 🖥️ servidor
cd /opt/stack/traefik
docker compose up -d
docker compose logs -f
```

Como não há domínio, acesse pela sua máquina através de um túnel:

```bash
# 💻 local
ssh -L 8443:localhost:443 -i ~/.ssh/vps_hostgator deploy@SEU_IP
```

Com o túnel aberto, no navegador: `https://hello.localhost:8443`

Você verá um aviso de certificado — esperado. Aceite e confirme que o Hello World
aparece.

**Por que o túnel SSH e não abrir uma porta temporária?** Porque toda porta aberta
"temporariamente" tem a chance de continuar aberta. O túnel usa a conexão SSH que já
existe, é criptografado, autenticado por chave, e desaparece quando você fecha o
terminal. É a forma correta de acessar qualquer serviço interno — e é a mesma técnica
usada na [Fase 6](08-fase-6-postgres-e-redis.md) para o Postgres.

---

## Passo a passo — Etapa B: com domínio

Execute quando você registrar um domínio.

### 5.7 — Registrar e apontar o DNS

Onde registrar (ordem de custo-benefício): **Cloudflare Registrar** (preço de custo, sem
markup), **Namecheap**, **Registro.br** (para `.com.br`, exige CPF/CNPJ).

Crie um registro A:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `@` | SEU_IP | 300 |
| A | `hello` | SEU_IP | 300 |
| A | `grafana` | SEU_IP | 300 |
| A | `traefik` | SEU_IP | 300 |

Use TTL baixo (300s) enquanto configura — assim, corrigir um erro leva 5 minutos em vez
de horas. Aumente depois.

⚠️ Espere a propagação **antes** de pedir certificado:

```bash
# 💻 local
nslookup hello.SEUDOMINIO.com
```
→ Precisa retornar o IP do seu VPS. Se não retornar, o ACME vai falhar e consumir uma das
suas cinco tentativas por hora.

### 5.8 — 🔒 Cloudflare na frente (recomendado)

Se você apontar o domínio para o Cloudflare (plano gratuito) com o proxy ativado (nuvem
laranja), ganha de graça:

- **O IP real do VPS deixa de ser público.** Sem isso, qualquer um descobre seu IP e pode
  atacar diretamente, ignorando qualquer proteção que esteja na frente do domínio.
- **Mitigação de DDoS volumétrico.** Um VPS de 4GB cai com um ataque modesto; a rede do
  Cloudflare absorve.
- **WAF básico** e bloqueio por país/reputação.
- **Cache de estáticos**, tirando carga do servidor.

⚠️ Com o proxy do Cloudflare ativado, o desafio HTTP-01 do Let's Encrypt pode falhar,
porque o tráfego passa pelo Cloudflare. Duas saídas: use o modo "DNS only" (nuvem cinza)
durante a emissão e ative o proxy depois; ou configure o desafio **DNS-01** com o token
de API do Cloudflare, que é a solução definitiva e também permite certificados wildcard.

⚠️ Com o Cloudflare na frente, **todos os IPs de origem que o Traefik enxerga são do
Cloudflare**. Isso quebra o rate limit por IP — ele passaria a limitar o Cloudflare
inteiro. Configure `forwardedHeaders.trustedIPs` no entrypoint com as faixas do
Cloudflare para que o IP real seja lido do header `CF-Connecting-IP`.

Se você fizer isso e ainda deixar as portas 80/443 abertas para o mundo, um atacante que
descubra seu IP pode ir direto ao servidor. O fechamento completo é restringir 80/443 no
UFW apenas às faixas do Cloudflare.

### 5.9 — Let's Encrypt: staging primeiro

Adicione ao `traefik.yml`:

```yaml
certificatesResolvers:
  letsencrypt-staging:
    acme:
      email: SEU_EMAIL@exemplo.com
      storage: /certs/acme-staging.json
      caServer: https://acme-staging-v02.api.letsencrypt.org/directory
      httpChallenge:
        entryPoint: web

  letsencrypt:
    acme:
      email: SEU_EMAIL@exemplo.com
      storage: /certs/acme.json
      httpChallenge:
        entryPoint: web
```

⚠️ **Comece pelo staging.** O ambiente de produção do Let's Encrypt limita a 5 falhas de
validação por hora e 50 certificados por domínio por semana. Testar em staging é
ilimitado na prática, e o único custo é que o certificado não é confiável pelo navegador
— exatamente o que você já tem na Etapa A.

Nas labels da app, use o resolver de staging:

```yaml
      - "traefik.http.routers.hello.rule=Host(`hello.SEUDOMINIO.com`)"
      - "traefik.http.routers.hello.tls.certresolver=letsencrypt-staging"
```

```bash
# 🖥️ servidor
docker compose up -d
docker compose logs -f traefik | grep -i acme
```

Procure por `Certificate obtained`. Se aparecer, o fluxo inteiro funciona.

### 5.10 — Trocar para produção

Só depois do staging funcionar:

```yaml
      - "traefik.http.routers.hello.tls.certresolver=letsencrypt"
```

Descomente as linhas de HSTS nos middlewares e reinicie:

```bash
# 🖥️ servidor
docker compose up -d --force-recreate traefik
```

---

## Por que não fazer diferente

**"Por que não Caddy?"** — Caddy é genuinamente mais simples: três linhas de Caddyfile e
você tem HTTPS automático. Para um caso simples, é a melhor escolha e eu recomendaria sem
hesitar. Escolhemos Traefik por dois motivos: a descoberta automática por labels do
Docker significa que adicionar uma app não requer editar arquivo nenhum do proxy — o que
casa exatamente com o fluxo de CI/CD da fase 7; e o Traefik é o que você encontra em
ambientes profissionais, então o aprendizado transfere. **Se em algum momento a
complexidade do Traefik te atrapalhar mais do que ajuda, migrar para Caddy é legítimo** —
o Caddy também tem provider de Docker via plugin.

**"Por que não Nginx Proxy Manager?"** — Tem interface web bonita e é fácil de começar. O
problema é que a configuração vive num banco SQLite dentro do container: não é
versionável, não é reproduzível, e recriar do zero significa reconfigurar tudo pela
interface. Configuração como código é preferível.

**"Por que não Nginx puro?"** — Máximo controle e desempenho, com custo de escrever
manualmente cada `server` block e integrar o `certbot`. Vale aprender Nginx em algum
momento — é onipresente — mas como primeira camada de um projeto pessoal, o custo de
manutenção não compensa.

**"Por que não Cloudflare Tunnel, dispensando abrir portas?"** — É uma opção
tecnicamente elegante: um agente no servidor abre conexão de saída para o Cloudflare, e
você não abre porta nenhuma. Segurança de rede excelente. Os contras: dependência total
de um terceiro para seu site existir, e o agente também consome recursos. Vale considerar
seriamente se você tiver IP dinâmico ou o provedor bloquear portas.

**"Por que não terminar TLS na aplicação?"** — Cada app precisaria do certificado, da
renovação e da configuração de cifras. Centralizar no proxy é o padrão por bons motivos.

---

## Como garantir que está certo

**Traefik subiu sem erro:**

```bash
# 🖥️ servidor
docker compose logs traefik | grep -iE 'error|fatal'
```
→ Esperado: nada. Erro comum aqui é permissão do `acme.json`.

🔒 **O dashboard NÃO está exposto sem autenticação** — teste crítico:

```bash
# 💻 local
curl -sI http://SEU_IP:8080/dashboard/
```
→ Esperado: falha de conexão. Se retornar `200 OK`, `api.insecure` está `true` e sua
infraestrutura inteira está sendo publicada. Corrija imediatamente.

🔒 **Containers sem `traefik.enable` não são expostos:**

```bash
# 🖥️ servidor
docker run -d --name nao-exposto --network edge nginx:alpine
curl -s http://localhost/ -H "Host: nao-exposto"
docker rm -f nao-exposto
```
→ Esperado: 404 do Traefik. Se o Nginx responder, `exposedByDefault` está `true`.

**Redirecionamento HTTP → HTTPS:**

```bash
# 🖥️ servidor
curl -sI http://localhost/ -H "Host: hello.localhost"
```
→ Esperado: `HTTP/1.1 301 Moved Permanently` e `Location: https://...`

**Headers de segurança presentes:**

```bash
# 🖥️ servidor
curl -skI https://localhost/ -H "Host: hello.localhost" | grep -iE 'x-frame|x-content|strict-transport|server|x-powered'
```
→ Esperado: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, e **ausência** de
`Server` e `X-Powered-By`.

**Rate limit funciona:**

```bash
# 🖥️ servidor
for i in $(seq 1 200); do
  curl -sk -o /dev/null -w "%{http_code}\n" https://localhost/ -H "Host: hello.localhost"
done | sort | uniq -c
```
→ Esperado: mistura de `200` e `429`. Só `200` significa que o middleware não foi
aplicado — confira o nome com o sufixo `@file` na label.

**Etapa B — certificado válido:**

```bash
# 💻 local
curl -vI https://hello.SEUDOMINIO.com 2>&1 | grep -E 'issuer|subject|SSL'
```
→ Esperado: emissor `Let's Encrypt`. Se aparecer `(STAGING)`, você ainda está no resolver
de teste.

**Nota de qualidade TLS** — use o SSL Labs (ssllabs.com/ssltest). Esperado: **A ou A+**.
Nota menor indica cifra fraca ou HSTS ausente, e o relatório diz exatamente o quê.

**Nenhuma porta extra aberta:**

```bash
# 🖥️ servidor
ss -tulpn | grep -E '0.0.0.0|\[::\]'
```
→ Esperado: apenas 22, 80 e 443.

---

## Armadilhas comuns

**`unable to get issuer certificate` / ACME falhando.** Causas, em ordem de frequência:
DNS ainda não propagou; porta 80 bloqueada no UFW; Cloudflare com proxy ativo
interferindo no HTTP-01; relógio do servidor dessincronizado.

**Certificado do staging aparecendo em produção.** Os arquivos de armazenamento precisam
ser diferentes (`acme-staging.json` e `acme.json`). Se você reusar o mesmo, o Traefik
encontra o certificado de staging em cache e não pede o de produção. Apagar o arquivo
força nova emissão.

**HSTS ativado cedo demais.** O navegador guardou a instrução e recusa HTTP. Em
desenvolvimento, limpe em `chrome://net-internals/#hsts`. Em produção, você espera o
tempo do `max-age` — por isso a recomendação de só ativar no final.

**Nome de middleware sem `@file`.** Middlewares definidos em arquivo têm o sufixo
`@file`; os definidos por label do Docker têm `@docker`. Referenciar sem o sufixo certo
faz o Traefik ignorar silenciosamente — sem erro, sem aviso, sem proteção.

**App em rede diferente do Traefik.** Se a app não estiver na rede `edge`, o Traefik não a
alcança e você recebe `Bad Gateway`. Confira com `docker network inspect edge`.

**`Gateway Timeout` mesmo com tudo certo.** Frequentemente a app está escutando em
`127.0.0.1` dentro do container em vez de `0.0.0.0`.

---

## Para estudar

- 🆓 **Traefik docs — "Getting Started" e "Routing"** — a distinção entre configuração
  estática e dinâmica está bem explicada e é o que mais confunde iniciantes.
- 🆓 **Let's Encrypt: "Rate Limits"** — leia antes de começar a testar, não depois de ser
  bloqueado.
- 🆓 **Let's Encrypt: "How It Works"** — explica os desafios HTTP-01 e DNS-01. Entender o
  mecanismo torna o debug muito mais rápido.
- 🆓 **Mozilla SSL Configuration Generator** (ssl-config.mozilla.org) — gera configuração
  de cifras para vários servidores, com os perfis "modern/intermediate/old" explicados.
- 🆓 **OWASP Secure Headers Project** — a referência para cada header que você configurou,
  com o porquê e os riscos de cada um.
- 🆓 **Techno Tim (YouTube)** — série sobre Traefik v3 em homelab; cobre exatamente este
  cenário de VPS com Docker, incluindo o socket proxy.
- 🆓 **`tecnativa/docker-socket-proxy`** — leia o README; é curto e explica bem por que o
  socket é perigoso e como limitar.
