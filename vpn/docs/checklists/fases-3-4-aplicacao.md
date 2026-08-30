# Checklist — Fases 3 e 4 (aplicações)

Executado na máquina Windows; o VPS não é alterado.

## Fase 3 — preparar o monorepo existente

Já existente, apenas confirmar:

- [ ] Node 24+ e pnpm do `packageManager`
- [ ] Workspaces `apps/*` e `packages/*`
- [ ] `apps/web`, `apps/mobile`, `apps/api` e quatro packages compartilhados
- [ ] Turborepo com build dependente de `^build`
- [ ] Lockfile versionado e TypeScript estrito

Adicionar:

- [ ] API com `/health`, `/ready` e `/metrics`
- [ ] `/ready` sem leitura faturável no Firestore e sem Postgres/Redis
- [ ] Métricas sem IDs, URLs concretas ou dados pessoais como labels
- [ ] Shutdown hooks no Nest
- [ ] Web com `/health` independente da API
- [ ] Next com `output: "standalone"` e tracing da raiz do monorepo
- [ ] `BACKEND_URL=http://api:3001` previsto no build e runtime
- [ ] API usa `0.0.0.0` somente no container; local permanece em loopback
- [ ] `.gitignore` cobre `*.pem` e `*.key`
- [ ] Nenhum driver PostgreSQL, migration, auth-api ou jobs-api adicionado
- [ ] `npm run --silent test:ai` passa
- [ ] typecheck e duas builds Turbo passam; a segunda usa cache

## Fase 4 — imagens

- [ ] `.dockerignore` exclui Git, envs, chaves, builds e dependências locais
- [ ] Dockerfiles separados para `web` e `api`, ambos em Node 24
- [ ] API usa deploy portátil dos workspaces
- [ ] Web usa standalone e inclui `public` + `.next/static`
- [ ] Firebase público entra apenas no build web
- [ ] Firebase Admin/OpenRouter não aparecem em build args ou camadas
- [ ] Web limitado a 384 MiB/heap 256 MiB
- [ ] API limitada a 256 MiB/heap 160 MiB
- [ ] Ambos rodam com UID não zero, filesystem read-only e capabilities removidas
- [ ] Compose local publica somente `127.0.0.1:3000`
- [ ] API não tem binding no host
- [ ] Web→API funciona por `api:3001`
- [ ] Os dois healthchecks ficam `healthy`
- [ ] Trivy executado nas duas imagens
