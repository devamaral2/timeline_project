# Fase 5 — Traefik e TLS para o web

## Objetivo

Publicar somente `web:3000` por HTTPS. A API permanece sem router e sem porta no host;
o Next a acessa por `http://api:3001` na rede `edge`.

## 5.1 — Configuração estática

`/opt/stack/traefik/traefik.yml`:

```yaml
entryPoints:
  web:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

providers:
  docker:
    exposedByDefault: false
    network: edge
  file:
    directory: /etc/traefik/dynamic
    watch: true

api:
  dashboard: true

log:
  level: INFO
  format: json

accessLog:
  format: json
  fields:
    headers:
      defaultMode: drop
```

`exposedByDefault: false` é a barreira que impede um container novo de ganhar rota por
acidente. Ainda assim, a API não deve ter nenhum label `traefik.http.routers.*`.

## 5.2 — Middlewares

`/opt/stack/traefik/dynamic/middlewares.yml`:

```yaml
http:
  middlewares:
    security-headers:
      headers:
        contentTypeNosniff: true
        frameDeny: true
        referrerPolicy: strict-origin-when-cross-origin
        permissionsPolicy: "camera=(), microphone=(), geolocation=()"
        stsSeconds: 31536000
        stsIncludeSubdomains: true

    rate-limit:
      rateLimit:
        average: 50
        burst: 100

    compress:
      compress: {}
```

Não habilite HSTS antes de HTTPS funcionar no domínio real.

## 5.3 — Container do Traefik

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
    networks: [edge]
    mem_limit: 96m
    memswap_limit: 96m
    security_opt: [no-new-privileges:true]

networks:
  edge:
    external: true
```

O socket Docker, mesmo montado read-only, equivale a uma capacidade muito privilegiada.
Mantenha Traefik atualizado e migre para um socket proxy restrito quando estabilizar a
stack.

## 5.4 — Labels do web

No serviço `web` do Compose de produção:

```yaml
networks:
  - edge
labels:
  - "traefik.enable=true"
  - "traefik.docker.network=edge"
  - "traefik.http.routers.web.rule=Host(`app.SEUDOMINIO.com`)"
  - "traefik.http.routers.web.entrypoints=websecure"
  - "traefik.http.routers.web.tls.certresolver=letsencrypt"
  - "traefik.http.routers.web.middlewares=security-headers@file,rate-limit@file,compress@file"
  - "traefik.http.services.web.loadbalancer.server.port=3000"
```

No serviço `api`, os únicos itens de rede são:

```yaml
expose:
  - "3001"
networks:
  - edge
  - data
```

Não adicione `ports`, `traefik.enable=true` ou domínio para a API. `/metrics`, `/ready`
e `/health` da API são internos.

## 5.5 — TLS em duas etapas

Sem domínio, use um certificado local e túnel SSH apenas para validar o roteamento. Com
domínio, aponte `app.SEUDOMINIO.com` ao VPS e configure primeiro o resolver staging:

```yaml
certificatesResolvers:
  letsencrypt-staging:
    acme:
      email: SEU_EMAIL
      storage: /certs/acme-staging.json
      caServer: https://acme-staging-v02.api.letsencrypt.org/directory
      httpChallenge:
        entryPoint: web
  letsencrypt:
    acme:
      email: SEU_EMAIL
      storage: /certs/acme.json
      httpChallenge:
        entryPoint: web
```

Troque o label para `letsencrypt` e habilite HSTS somente depois de o staging emitir
corretamente.

Se Cloudflare estiver na frente, use SSL/TLS `Full (strict)`, preserve o IP real e só
restrinja 80/443 às faixas Cloudflare depois de confirmar acesso e renovação ACME.

## Como garantir que está certo

```bash
docker compose -f /opt/stack/traefik/docker-compose.yml config
docker compose -f /opt/stack/traefik/docker-compose.yml up -d
ss -tulpn | grep -E ':80 |:443 '
docker network inspect edge
```

Externamente:

```bash
curl -I https://app.SEUDOMINIO.com/health
curl -I https://app.SEUDOMINIO.com/api/events/daily
curl -I https://api.SEUDOMINIO.com/health
```

Os dois primeiros chegam ao web; o terceiro não deve resolver nem ter router. Confirme
que 3000, 3001, 5432, 6379 e 12345 não aparecem em um scan externo.

## Etapa futura — mobile

Publicar a API não é apenas adicionar um label. A etapa deverá incluir:

1. host HTTPS dedicado, por exemplo `api.SEUDOMINIO.com`;
2. CORS allowlist explícita para qualquer cliente web aplicável;
3. rate limit próprio e limites de corpo/timeout;
4. autenticação e logs sem tokens;
5. `MOBILE_API_URL` apontando para HTTPS;
6. testes de abuso e verificação externa de portas.

Até essa etapa, o mobile não faz parte do primeiro deploy.

## Armadilhas comuns

**Traefik escolhe a rede errada.** Use `traefik.docker.network=edge` no web.

**Publicar a API para “facilitar debug”.** Use `docker exec` ou túnel SSH. Uma rota
temporária costuma virar permanente.

**HSTS antes do certificado válido.** O navegador pode bloquear o domínio durante o
diagnóstico. Ative só após o resolver de produção funcionar.
