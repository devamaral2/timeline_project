# syntax=docker/dockerfile:1.7

# Imagem do servico de autenticacao (NestJS).
#
#   docker build -f apps/auth/Dockerfile -t timeline-auth .
#
# O auth nao depende de nenhum @repo/*: o turbo prune aqui poda o monorepo a
# um workspace so. O contexto continua sendo a raiz porque o lockfile e o
# pnpm-workspace.yaml vivem la.
#
# Duas particularidades deste servico, as duas verificadas no codigo:
#
# 1. findMonorepoRoot() sobe os diretorios ate achar pnpm-workspace.yaml e
#    LANCA se nao achar. O arquivo vem junto do out/json e precisa continuar
#    na raiz da imagem, senao o processo morre no bootstrap.
# 2. bootstrap() chama SigningKeyService.ensureActive() ANTES do listen, o que
#    toca o banco. O container so sobe com AUTH_DATABASE_URL valido e o
#    Postgres ja de pe — use depends_on com condition: service_healthy.
#
# As migrations nao rodam daqui: `db:migrate` usa tsx, que e devDependency, e
# AUTH_DATABASE_MIGRATION_URL e credencial separada de proposito.

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
RUN turbo prune @repo/auth --docker

# --- deps ------------------------------------------------------------------
FROM base AS deps
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# --- builder ---------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ ./

# turbo prune NAO copia o que esta em globalDependencies do turbo.json, e todo
# tsconfig do repo faz extends de ../../tsconfig.base.json. Sem esse arquivo o
# extends falha, o skipLibCheck: true da base se perde e o tsc passa a checar
# os .d.ts das dependencias — o build morre dentro do ulid, num erro que nao
# tem nada a ver com o codigo daqui.
COPY --from=pruner /app/tsconfig.base.json ./
RUN pnpm turbo run build --filter=@repo/auth

# --- runner ----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/auth/dist ./apps/auth/dist
COPY --from=pruner /app/scripts/onepassword ./scripts/onepassword
COPY --from=pruner /app/.env.example ./.env.example

# Mesmo motivo do bind da API: loopback dentro do container nao e alcancavel.
ENV AUTH_HOST=0.0.0.0
ENV AUTH_PORT=3002
EXPOSE 3002

# O auth tem /health/live e /health/ready. O live basta para o orquestrador
# saber que o processo esta de pe; o ready toca o banco. Sem curl na imagem
# slim, o fetch do proprio Node resolve.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.AUTH_PORT||3002)+'/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

USER node
CMD ["node", "scripts/onepassword/exec.mjs", "node", "apps/auth/dist/main.js"]
