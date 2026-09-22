# syntax=docker/dockerfile:1.7

# Imagem do frontend (Next.js).
#
#   docker build -f apps/web/Dockerfile -t timeline-web .
#
# O web e o unico dos tres que precisa de segredo em BUILD time, e nao em
# runtime. Dois motivos, os dois estruturais do Next:
#
# 1. NEXT_PUBLIC_* e inlined no bundle pelo next build. Passar essas variaveis
#    no `docker run` nao tem efeito nenhum: o valor ja foi congelado.
# 2. rewrites() e avaliado durante o build e serializado no routes-manifest,
#    entao BACKEND_URL tambem e decidido aqui. Em compose isso quer dizer o
#    nome do servico (http://api:3001), nao 127.0.0.1.
#
# Por isso o .env entra como secret do BuildKit, montado so durante o RUN do
# build: ele nao vira camada e nao aparece em `docker history`. Nunca use ARG
# nem ENV para isso — ARG fica gravado no metadado da imagem.
#
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="/pnpm:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- pruner ----------------------------------------------------------------
FROM base AS pruner
RUN npm install --global turbo@^2.5.0
COPY . .
RUN turbo prune @repo/web --docker

# --- deps ------------------------------------------------------------------
FROM base AS deps
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- builder ---------------------------------------------------------------
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ ./

# turbo prune NAO copia o que esta em globalDependencies do turbo.json, e todo
# tsconfig do repo faz extends de ../../tsconfig.base.json. Sem esse arquivo o
# extends falha, o skipLibCheck: true da base se perde e o tsc passa a checar
# os .d.ts das dependencias — o build morre dentro do ulid, num erro que nao
# tem nada a ver com o codigo daqui.
COPY --from=pruner /app/tsconfig.base.json ./
COPY --from=pruner /app/scripts/onepassword ./scripts/onepassword
COPY --from=pruner /app/.env.example ./.env.example
ARG OP_ENVIRONMENT_ID

# O token e montado como secret temporario do BuildKit. O carregador resolve as
# variaveis antes do next build, sem gravar um .env na imagem.
RUN --mount=type=secret,id=onepassword-token,target=/run/secrets/onepassword-token \
    OP_SERVICE_ACCOUNT_TOKEN="$(cat /run/secrets/onepassword-token)" \
    OP_ENVIRONMENT_ID="${OP_ENVIRONMENT_ID:?OP_ENVIRONMENT_ID must be supplied as a build argument}" \
    ONEPASSWORD_SCOPE=web-build \
    node scripts/onepassword/exec.mjs /app/node_modules/.bin/turbo run build --filter=@repo/web

# --- runner ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# O output standalone ja carrega o node_modules que o tracing do Next provou
# necessario — este estagio nao roda pnpm install nenhum. O .next/static fica
# de fora do standalone por design e precisa ser copiado a parte.
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# server.js do standalone le HOSTNAME e PORT.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
EXPOSE 3000
USER node
CMD ["node", "apps/web/server.js"]
