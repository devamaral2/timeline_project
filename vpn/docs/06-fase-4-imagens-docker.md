# Fase 4 — Imagens Docker de web e API

## Objetivo

Gerar duas imagens reproduzíveis a partir do monorepo:

- `timeline-web`, com o servidor standalone do Next.js;
- `timeline-api`, com o build NestJS e apenas dependências de produção.

As imagens rodam como usuário não-root, não contêm segredos e funcionam juntas num
Compose local em que somente o web publica uma porta no loopback.

## Pré-requisitos

A fase 3 precisa estar concluída: os endpoints operacionais existem, o web gera
`.next/standalone` e a comunicação em container usa `api:3001`.

O contexto de build é sempre a raiz do monorepo. Cada Dockerfile precisa enxergar o
lockfile e os packages compartilhados.

## 4.1 — `.dockerignore`

Criar na raiz antes dos builds:

```dockerignore
node_modules
**/node_modules
**/dist
**/.next
**/.turbo
**/coverage
.git
.github
.idea
.worktrees
vpn
*.md
.env
.env.*
*.pem
*.key
```

O arquivo reduz o contexto e impede que histórico Git ou `.env` virem camadas da imagem.

## 4.2 — Imagem da API

`apps/api/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/entities/package.json packages/entities/package.json
COPY packages/persistence/package.json packages/persistence/package.json

RUN --mount=type=cache,id=pnpm-api,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @repo/api build
RUN pnpm --filter @repo/api --prod deploy --legacy /out

FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=160
WORKDIR /app

COPY --from=builder --chown=node:node /out/node_modules ./node_modules
COPY --from=builder --chown=node:node /out/package.json ./package.json
COPY --from=builder --chown=node:node /repo/apps/api/dist ./dist

USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3001/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/main.js"]
```

`pnpm deploy --legacy` é intencional neste repositório: produz `node_modules` portátil
sem ativar globalmente `injectWorkspacePackages`, que poderia mudar o comportamento do
Metro com os packages TypeScript. Reavalie quando a configuração do workspace mudar.

## 4.3 — Imagem do web

O `next build` de um monorepo gera normalmente o servidor em
`.next/standalone/apps/web/server.js`. Confirme o caminho no primeiro build; não presuma
que será `.next/standalone/server.js`.

`apps/web/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1.7
FROM node:24-alpine AS builder
RUN corepack enable
WORKDIR /repo

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/entities/package.json packages/entities/package.json
COPY packages/timeline/package.json packages/timeline/package.json
COPY packages/theme/package.json packages/theme/package.json

RUN --mount=type=cache,id=pnpm-web,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG BACKEND_URL=http://api:3001

ENV NEXT_PUBLIC_FIREBASE_API_KEY=$NEXT_PUBLIC_FIREBASE_API_KEY
ENV NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=$NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ENV NEXT_PUBLIC_FIREBASE_PROJECT_ID=$NEXT_PUBLIC_FIREBASE_PROJECT_ID
ENV NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=$NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ENV NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=$NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ENV NEXT_PUBLIC_FIREBASE_APP_ID=$NEXT_PUBLIC_FIREBASE_APP_ID
ENV BACKEND_URL=$BACKEND_URL

RUN pnpm --filter @repo/web build

FROM node:24-alpine AS runner
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app

COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]
```

Valores `NEXT_PUBLIC_*` entram no bundle e não são segredos. Credenciais Firebase Admin,
OpenRouter, PostgreSQL e Redis nunca são `ARG` nem `ENV` no Dockerfile.

## 4.4 — Compose local

`infra/docker-compose.local.yml`:

```yaml
services:
  api:
    build:
      context: ..
      dockerfile: apps/api/Dockerfile
    environment:
      NODE_ENV: production
      API_HOST: 0.0.0.0
      PORT: 3001
    env_file:
      - ../.env
    expose:
      - "3001"
    mem_limit: 256m
    memswap_limit: 256m
    read_only: true
    tmpfs:
      - /tmp
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    networks: [edge, data]

  web:
    build:
      context: ..
      dockerfile: apps/web/Dockerfile
      args:
        BACKEND_URL: http://api:3001
        NEXT_PUBLIC_FIREBASE_API_KEY: ${NEXT_PUBLIC_FIREBASE_API_KEY}
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: ${NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET}
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID}
        NEXT_PUBLIC_FIREBASE_APP_ID: ${NEXT_PUBLIC_FIREBASE_APP_ID}
    environment:
      BACKEND_URL: http://api:3001
      HOSTNAME: 0.0.0.0
      PORT: 3000
    ports:
      - "127.0.0.1:3000:3000"
    depends_on:
      api:
        condition: service_healthy
    mem_limit: 384m
    memswap_limit: 384m
    read_only: true
    tmpfs:
      - /tmp
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    networks: [edge]

networks:
  edge: {}
  data:
    internal: true
```

Executar da raiz para que a interpolação leia o `.env` correto:

```powershell
docker compose --env-file .env -f infra/docker-compose.local.yml up --build -d
```

## Como garantir que está certo

```powershell
curl.exe http://127.0.0.1:3000/health
docker compose -f infra/docker-compose.local.yml ps
docker compose -f infra/docker-compose.local.yml exec web node -e "fetch('http://api:3001/health').then(async r => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1) })"
docker compose -f infra/docker-compose.local.yml exec api id
docker compose -f infra/docker-compose.local.yml exec web id
```

Confirme também:

```powershell
# A porta interna existe, mas não pode ter binding no host
$apiContainer = docker compose -f infra/docker-compose.local.yml ps -q api
docker inspect $apiContainer --format '{{json .NetworkSettings.Ports}}'

# Não pode haver fonte, TypeScript ou arquivos de ambiente
docker run --rm --entrypoint sh timeline-api -c "test ! -e src && test ! -e .env"
docker history timeline-web --no-trunc
docker history timeline-api --no-trunc
```

Critérios de saída:

- os dois containers ficam `healthy`;
- somente `127.0.0.1:3000` aparece no host;
- o proxy web→API funciona;
- ambos executam com UID não zero;
- segredos privados não aparecem em `docker history` ou `docker inspect`;
- os limites são 384 MiB para web e 256 MiB para API.

## Armadilhas comuns

**Standalone sem assets.** Sem copiar `public` e `.next/static`, páginas abrem sem CSS ou
imagens.

**Comando do web no caminho errado.** Em monorepo, inspecione `.next/standalone` após o
build e ajuste o `CMD` somente ao caminho observado.

**API inacessível mesmo saudável.** Dentro do container ela deve ouvir em `0.0.0.0`.
Loopback continua sendo apenas o padrão fora de containers.

**Segredos em build args.** `ARG` fica observável no histórico/metadados. Somente valores
Firebase `NEXT_PUBLIC_*` e a URL interna não secreta podem entrar ali.
