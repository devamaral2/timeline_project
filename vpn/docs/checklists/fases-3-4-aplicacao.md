# Checklist — Fases 3 e 4 (aplicação)

Executadas na máquina Windows. O servidor não é tocado.

## Fase 3 — Monorepo local

- [ ] Node 20+ instalado
- [ ] Corepack habilitado, pnpm ativado
- [ ] Repositório criado e `git init` feito
- [ ] `pnpm-workspace.yaml` com `apps/*` e `packages/*`
- [ ] `package.json` da raiz com `"private": true` e `packageManager`
- [ ] `turbo.json` com `dependsOn: ["^build"]` e `outputs: ["dist/**"]`
- [ ] `@repo/tsconfig` criado e referenciado com `workspace:*`
- [ ] `hello-api` com Fastify + TypeScript
- [ ] Validação de ambiente com Zod (`env.ts`)
- [ ] Rota `/` respondendo Hello World
- [ ] Rota `/health` (liveness, sem checar dependências)
- [ ] Rota `/ready` (readiness, checa dependências)
- [ ] Rota `/metrics` em formato Prometheus
- [ ] `host: "0.0.0.0"` — não `127.0.0.1`
- [ ] Tratamento de `SIGTERM` para shutdown limpo
- [ ] 🔴 `.gitignore` cobrindo `.env`, `.env.*`, `*.pem`, `*.key`
- [ ] `pnpm-lock.yaml` commitado
- [ ] `pnpm typecheck` sem erros
- [ ] `pnpm build` duas vezes → segunda mostra `FULL TURBO`
- [ ] `PORT=abc pnpm dev` falha com mensagem clara do Zod

## Fase 4 — Imagem Docker

- [ ] 🔴 `.dockerignore` criado **antes** do Dockerfile
- [ ] `.dockerignore` cobre `node_modules`, `.git`, `.env`, `dist`
- [ ] Dockerfile multi-stage (builder → pruner → runner)
- [ ] `COPY` dos manifestos antes do código (cache de camadas)
- [ ] `--frozen-lockfile` no install
- [ ] 🔴 `pnpm deploy --filter ... --prod /out` no estágio pruner
- [ ] Estágio final copia de `/out`, não de `/repo`
- [ ] 🔴 `USER node` presente
- [ ] `NODE_OPTIONS=--max-old-space-size` alinhado ao `mem_limit` (~75%)
- [ ] `HEALTHCHECK` definido
- [ ] Imagem base fixada (`node:20-alpine`, nunca `latest`)
- [ ] Tamanho da imagem entre 130MB e 200MB — real: ________
- [ ] 🔴 `docker run --rm hello-api id` → `uid=1000(node)`
- [ ] Sem `typescript` nem `src/` na imagem final
- [ ] `docker history` sem nada parecido com segredo
- [ ] Container sobe e `/health` responde
- [ ] `docker inspect ... .State.Health.Status` → `healthy`
- [ ] Rebuild após mudança de código mostra `CACHED` no install
- [ ] Trivy rodado localmente — HIGH/CRITICAL: ________
