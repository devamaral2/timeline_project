# syntax=docker/dockerfile:1.7

# Imagem da API (NestJS).
#
# O contexto de build e a raiz do monorepo, nao apps/api: o Nest importa
# @repo/contracts e @repo/timeline, que sao workspaces irmaos.
#
#   docker build -f apps/api/Dockerfile -t timeline-api .
#
# Nenhum segredo entra na imagem. loadRootEnv() procura .env na raiz, nao
# encontra dentro do container e segue em frente — DATABASE_URL e o endereço
# do serviço de autenticação chegam pelo environment do container.

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="/pnpm:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# --- pruner ----------------------------------------------------------------
# turbo prune reduz o monorepo ao subgrafo de @repo/api. out/json tem so os
# package.json e o lockfile podado; out/full tem o codigo. A separacao existe
# para que editar src nao invalide a camada de instalacao.
FROM base AS pruner
RUN npm install --global turbo@^2.5.0
COPY . .
RUN turbo prune @repo/api --docker

# --- deps ------------------------------------------------------------------
FROM base AS deps
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- builder ---------------------------------------------------------------
# turbo respeita o dependsOn ["^build"] do turbo.json, entao contracts e
# timeline compilam antes da API — o mesmo motivo pelo qual `dev` depende
# de `^build` fora do container.
FROM base AS builder
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ ./

# turbo prune NAO copia o que esta em globalDependencies do turbo.json, e todo
# tsconfig do repo faz extends de ../../tsconfig.base.json. Sem esse arquivo o
# extends falha, o skipLibCheck: true da base se perde e o tsc passa a checar
# os .d.ts das dependencias — o build morre dentro do ulid, num erro que nao
# tem nada a ver com o codigo daqui.
COPY --from=pruner /app/tsconfig.base.json ./
RUN pnpm turbo run build --filter=@repo/api

# --- runner ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=pruner /app/out/json/ ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

# Os dist entram depois do install: mudar codigo nao refaz a instalacao.
# A arvore apps/api/dist/... precisa ficar nesse lugar - load-env.ts resolve a
# raiz do monorepo por caminho relativo a __dirname.
COPY --from=builder /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /app/packages/timeline/dist ./packages/timeline/dist
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=pruner /app/scripts/onepassword ./scripts/onepassword
COPY --from=pruner /app/.env.example ./.env.example

# 127.0.0.1 dentro do container nao e alcancavel de fora dele, entao o bind
# padrao da API nao serve aqui. Trocar para 0.0.0.0 liga o enableCors() do
# main.ts: quem passa a limitar a exposicao e a rede do compose, nao o bind.
ENV API_HOST=0.0.0.0
ENV API_PORT=3001
EXPOSE 3001
USER node
CMD ["node", "scripts/onepassword/exec.mjs", "node", "apps/api/dist/main.js"]
