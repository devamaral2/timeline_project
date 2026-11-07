# syntax=docker/dockerfile:1.7

# Imagem do servidor MCP (apps/mcp). Mesmo molde da API: contexto de build na
# raiz do monorepo; nenhum segredo entra na imagem — o loader do 1Password
# (scope mcp-runtime) os le em runtime.
#
#   docker build -f apps/mcp/Dockerfile -t braid-mcp .

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="/pnpm:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

FROM base AS pruner
RUN npm install --global turbo@^2.5.0
COPY . .
RUN turbo prune @repo/mcp --docker

FROM base AS deps
COPY --from=pruner /app/out/json/ ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/ ./
COPY --from=pruner /app/out/full/ ./
COPY --from=pruner /app/tsconfig.base.json ./
RUN pnpm turbo run build --filter=@repo/mcp

FROM base AS runner
ENV NODE_ENV=production
ENV ONEPASSWORD_SCOPE=mcp-runtime
COPY --from=pruner /app/out/json/ ./

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

COPY --from=builder /app/apps/mcp/dist ./apps/mcp/dist
COPY --from=pruner /app/scripts/onepassword ./scripts/onepassword
COPY --from=pruner /app/.env.example ./.env.example

# Dentro do container o bind precisa ser 0.0.0.0; quem limita a exposicao e a
# NetworkPolicy do cluster (so o Hermes chega), alem do Bearer.
ENV MCP_HOST=0.0.0.0
ENV MCP_PORT=3003
EXPOSE 3003
USER node
CMD ["node", "scripts/onepassword/exec.mjs", "node", "apps/mcp/dist/main.js"]
