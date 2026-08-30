# Fase 4 — Imagens Docker do monorepo

## Objetivo

Ao final desta fase você tem um `Dockerfile` multi-stage que constrói a imagem da
`hello-api` a partir do monorepo, resultando em uma imagem de ~150MB rodando como usuário
não-root, e você consegue subi-la localmente com `docker compose`.

---

## Por que isso existe

Containerizar um monorepo pnpm é o passo que mais quebra na prática, e por um motivo
específico: **o pnpm não copia dependências, ele cria symlinks.**

Num projeto normal, `node_modules` é um diretório com os pacotes dentro. Copie o
diretório e funciona. No pnpm, `node_modules/fastify` é um link simbólico para
`node_modules/.pnpm/fastify@5.0.0/node_modules/fastify`, e num monorepo há ainda links
apontando para fora do diretório da app, para `packages/`.

Quando você faz `COPY apps/hello-api /app` no Dockerfile, os symlinks ou não são copiados
ou apontam para caminhos que não existem na imagem. O erro que aparece é
`Cannot find module 'fastify'` — e a pessoa perde horas achando que é problema de
instalação.

A solução oficial é **`pnpm deploy`**: um comando que resolve todos os workspaces e
symlinks, produzindo um diretório autocontido e copiável.

O segundo motivo desta fase é tamanho e segurança. Uma imagem ingênua com todo o monorepo
e `devDependencies` passa de 1GB. A multi-stage entrega ~150MB — o que importa porque
cada deploy baixa essa imagem, e no seu VPS o disco é finito.

---

## Passo a passo

### 4.1 — `.dockerignore` na raiz

Crie **antes** do Dockerfile:

```
node_modules
**/node_modules
**/dist
**/.turbo
.git
.github
docs
infra
*.md
.env
.env.*
**/coverage
```

🔒 O `.dockerignore` tem valor de segurança, não só de performance. Sem ele, o `.git`
inteiro vai para o contexto de build — incluindo qualquer segredo que já esteve no
histórico. E o `.env` acabaria dentro da imagem, onde qualquer um com acesso ao registry
pode lê-lo com `docker history`.

Sem o `.dockerignore`, o contexto de build também inclui todos os `node_modules` locais:
centenas de MB enviados ao daemon a cada build, deixando tudo lento sem motivo.

### 4.2 — O Dockerfile

`apps/hello-api/Dockerfile` — mas atenção: o **contexto de build é a raiz do monorepo**,
não a pasta da app. Ele precisa enxergar `pnpm-workspace.yaml` e `packages/`.

```dockerfile
# syntax=docker/dockerfile:1

# ---------- Estagio 1: dependencias e build ----------
FROM node:20-alpine AS builder

RUN corepack enable
WORKDIR /repo

# Copia so os manifestos primeiro: se o codigo mudar mas as dependencias
# nao, o Docker reaproveita a camada de install do cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/hello-api/package.json ./apps/hello-api/
COPY packages/tsconfig/package.json ./packages/tsconfig/

RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# Agora sim o codigo-fonte
COPY . .

RUN pnpm --filter hello-api build

# ---------- Estagio 2: extrair o deployable ----------
FROM builder AS pruner

# pnpm deploy resolve todos os symlinks de workspace e produz
# um diretorio autocontido em /out
RUN pnpm --filter hello-api --prod deploy /out

# ---------- Estagio 3: imagem final ----------
FROM node:20-alpine AS runner

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=144

WORKDIR /app

# node:alpine ja traz o usuario "node" (uid 1000)
COPY --from=pruner --chown=node:node /out/node_modules ./node_modules
COPY --from=pruner --chown=node:node /out/package.json ./package.json
COPY --from=builder --chown=node:node /repo/apps/hello-api/dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
```

Vale destrinchar as decisões:

**Ordem de `COPY`.** Copiar os `package.json` antes do código-fonte não é capricho: as
camadas do Docker são cacheadas em ordem, e qualquer mudança invalida tudo abaixo. Como
o código muda a cada commit e as dependências raramente mudam, essa ordem faz o
`pnpm install` — o passo lento — ser reaproveitado quase sempre. Inverter a ordem
significa reinstalar dependências a cada build.

**`--mount=type=cache`** — BuildKit mantém o store do pnpm entre builds sem colocá-lo na
imagem. Corta minutos em builds repetidos.

**`--frozen-lockfile`** — falha se o lockfile não corresponder ao `package.json`, em vez
de "consertar" silenciosamente. Em CI isso é obrigatório: você quer build reprodutível,
não build criativo.

**`pnpm deploy --prod`** — o comando central. Ele monta em `/out` um diretório com
`node_modules` real (sem symlinks para fora), contendo apenas dependências de produção.
É o que torna o `COPY` para o estágio final possível.

**`NODE_OPTIONS=--max-old-space-size=144`** com `mem_limit: 192m` no compose. A conta:
o V8 precisa de espaço além do heap (stack, buffers, código nativo), então o heap deve
ficar em ~75% do limite do container. Sem isso, o container é morto pelo OOM killer sem
que o Node tenha chance de rodar o garbage collector — e você recebe um `exit 137`
misterioso, sem stack trace. Com o limite alinhado, o GC fica agressivo e a app sobrevive.

**`USER node`** 🔒 — sem essa linha, o processo roda como root **dentro** do container.
Combinado com um escape de container (raro, mas existente) ou com um volume montado,
root no container vira root no host. A imagem `node:alpine` já traz o usuário `node`
pronto, então o custo é uma linha.

**`HEALTHCHECK` usando `fetch`** — o Node 20 tem `fetch` nativo, então não é preciso
instalar `curl` ou `wget` só para isso. Menos pacotes, menos superfície, imagem menor.

### 4.3 — Escolha da imagem base

| Base | Tamanho | Prós | Contras |
|---|---|---|---|
| `node:20` | ~1.1 GB | Tudo incluso | Enorme, muitos CVEs |
| `node:20-slim` | ~250 MB | Debian, boa compatibilidade | Médio |
| **`node:20-alpine`** | **~180 MB** | Pequena, poucos CVEs | musl libc |
| `gcr.io/distroless/nodejs20` | ~170 MB | Sem shell — superfície mínima | Difícil de debugar |

Usamos **alpine** por equilibrar tamanho, superfície de ataque e possibilidade de debug.

⚠️ **A ressalva do Alpine:** ele usa `musl` em vez de `glibc`. Pacotes npm com binários
nativos compilados (`bcrypt`, `sharp`, `canvas`) podem falhar ou ter desempenho pior. Se
você adicionar uma dependência assim e ela quebrar, `node:20-slim` é o plano B — 70MB a
mais, compatibilidade total.

**Distroless** é o próximo degrau de segurança: sem shell, sem gerenciador de pacotes,
sem nada além do runtime. Um atacante que consiga executar código não tem nem `sh` para
usar. O custo é que você também não tem — `docker exec` para investigar deixa de existir.
Boa escolha depois que a app estiver estável.

⚠️ Fixe a versão maior (`node:20-alpine`), nunca use `node:latest`. `latest` significa
que sua build pode mudar de versão de Node entre dois deploys sem você saber.

### 4.4 — Compose local para testar

`infra/docker-compose.local.yml`:

```yaml
services:
  hello-api:
    build:
      context: ../
      dockerfile: apps/hello-api/Dockerfile
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      NODE_ENV: production
      PORT: 3000
    mem_limit: 192m
    memswap_limit: 192m
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    read_only: true
    tmpfs:
      - /tmp
    restart: unless-stopped
```

Note o `127.0.0.1:3000:3000` mesmo localmente — é bom hábito, e evita expor a porta na
sua rede Wi-Fi.

```bash
# 💻 local
docker compose -f infra/docker-compose.local.yml up --build
```

### 4.5 — Verificar o tamanho e o conteúdo

```bash
# 💻 local
docker images | grep hello-api
docker history hello-api --no-trunc | head -20
```

`docker history` mostra cada camada e seu tamanho — útil para descobrir o que inchou a
imagem.

---

## Por que não fazer diferente

**"Por que não `COPY . .` e `pnpm install` direto, sem multi-stage?"** — Funciona, e
produz uma imagem de ~1.2GB contendo o monorepo inteiro, todas as `devDependencies`, o
TypeScript, o cache do Turbo e o histórico do git (se faltar `.dockerignore`). Além do
tamanho, isso é um problema de segurança: código-fonte e ferramentas de build dentro da
imagem de produção dão a um invasor um ambiente completo para trabalhar.

**"Por que não `pnpm install --prod` no estágio final em vez de `pnpm deploy`?"** — Porque
isso exige que o `pnpm-workspace.yaml` e todos os `packages/` estejam presentes, e refaz
uma instalação que você já fez. `pnpm deploy` é o comando desenhado exatamente para este
caso — está na documentação oficial do pnpm sob "Docker".

**"Por que não usar `turbo prune`?"** — É a alternativa oficial do Turborepo:
`turbo prune --scope=hello-api --docker` gera um subconjunto do monorepo com só o
necessário. Funciona bem, e é a recomendação da documentação do **Turborepo**. Usamos
`pnpm deploy` porque resolve o problema de symlinks de forma mais direta e produz um
resultado menor. **As duas abordagens são válidas** — se você tiver muitos pacotes
internos compartilhados, `turbo prune` tende a lidar melhor com o grafo. Vale conhecer
as duas.

**"Por que não buildar direto no servidor com `docker compose build`?"** — Este é o erro
que derruba VPS de 4GB. `tsc` num monorepo consome 2–4GB de heap; somado ao Postgres e ao
resto, o OOM killer entra em ação e ele não escolhe a vítima com sabedoria. Ver
[ADR-003](adr/003-build-no-ci.md). Regra: o servidor só faz `pull`.

**"Por que não uma imagem única para todas as apps?"** — Tentador (uma imagem, várias
apps, escolhe pelo `CMD`), mas acopla os ciclos de vida: atualizar uma app obriga a
redeployar todas, e o tamanho é a soma de tudo. Uma imagem por app é o padrão certo.

---

## Como garantir que está certo

**A imagem tem tamanho razoável:**

```bash
# 💻 local
docker images hello-api --format "{{.Size}}"
```
→ Esperado: entre 130MB e 200MB. Se passar de 400MB, algo do estágio de build vazou para
o final — investigue com `docker history`.

**Roda como usuário não-root:** 🔒

```bash
# 💻 local
docker run --rm hello-api id
```
→ Esperado: `uid=1000(node) gid=1000(node)`. Se aparecer `uid=0(root)`, o `USER node`
não foi aplicado. Este teste é o mais importante da fase.

**Não há código-fonte nem devDependencies na imagem:**

```bash
# 💻 local
docker run --rm hello-api sh -c "ls node_modules | grep -c typescript || echo 'typescript ausente - OK'"
docker run --rm hello-api sh -c "ls src 2>/dev/null || echo 'src ausente - OK'"
```
→ Esperado: ambas as mensagens "OK".

**Nenhum segredo embutido:** 🔒

```bash
# 💻 local
docker history hello-api --no-trunc | grep -iE 'password|secret|token|key' || echo "OK - nada suspeito"
```

**A app responde dentro do container:**

```bash
# 💻 local
docker run -d --name teste -p 127.0.0.1:3000:3000 hello-api
sleep 3
curl -s http://localhost:3000/health
docker rm -f teste
```
→ Esperado: `{"status":"ok",...}`

**O healthcheck do Docker funciona:**

```bash
# 💻 local
docker run -d --name teste hello-api
sleep 30
docker inspect --format='{{.State.Health.Status}}' teste
docker rm -f teste
```
→ Esperado: `healthy`. Se ficar `starting` para sempre, o comando do healthcheck está
errado; se ficar `unhealthy`, a app não está respondendo em `/health`.

**O cache de camadas funciona** — mude só uma linha de código e rebuilde:

```bash
# 💻 local
docker build -f apps/hello-api/Dockerfile -t hello-api ..
```
→ Esperado: linhas `CACHED` nos passos de `pnpm install`. Se ele reinstalar dependências
a cada mudança de código, a ordem dos `COPY` está errada.

**Escanear vulnerabilidades:** 🔒

```bash
# 💻 local
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image --severity HIGH,CRITICAL hello-api
```
→ Esperado: poucas ou nenhuma vulnerabilidade HIGH/CRITICAL. Este comando vai para o CI
na [Fase 7](09-fase-7-cicd-github-actions.md).

---

## Armadilhas comuns

**`Cannot find module 'fastify'`** — o problema clássico de symlinks. Você copiou
`node_modules` do estágio errado, ou não usou `pnpm deploy`. Confira que o `COPY` do
estágio final vem de `/out`, não de `/repo`.

**`exit code 137` sem nenhum log.** É OOM: o container foi morto pelo kernel. Confirme
com `docker inspect --format='{{.State.OOMKilled}}' CONTAINER`. Solução: alinhar
`NODE_OPTIONS` com `mem_limit`, ou aumentar o limite.

**`read_only: true` quebra a app.** Alguma biblioteca escreve em disco. Descubra onde com
`docker logs` (vai aparecer `EROFS: read-only file system`) e adicione um `tmpfs` para
aquele caminho específico. Não desative o `read_only` — é uma defesa relevante.

**Contexto de build errado.** Se você rodar `docker build` de dentro de `apps/hello-api`,
o Docker não enxerga `pnpm-workspace.yaml` e o build falha. O contexto é sempre a raiz do
monorepo; só o `-f` aponta para o Dockerfile.

**Alpine e pacotes nativos.** `bcrypt` falhando na compilação é o caso mais comum. Troque
por `@node-rs/bcrypt` (binário pré-compilado) ou mude para `node:20-slim`.

**`pnpm deploy` reclamando de `--legacy`.** Em algumas versões do pnpm 9+, `deploy` fora
de um workspace exige a flag `--legacy`. Se der erro, confira a versão com
`pnpm --version` e consulte a documentação daquela versão específica.

---

## Para estudar

- 🆓 **Docs do pnpm: seção "Docker"** — mostra `pnpm deploy` e explica o problema dos
  symlinks. É a fonte primária desta fase.
- 🆓 **Turborepo docs: "Deploying with Docker"** — a abordagem alternativa com
  `turbo prune`. Vale ler para conhecer as duas.
- 🆓 **Docker docs: "Multi-stage builds"** e **"Best practices for writing Dockerfiles"** —
  as duas páginas cobrem ordenação de camadas e cache, que é 80% do que importa.
- 🆓 **Snyk: "10 best practices to build Node.js Docker images"** — artigo focado
  especificamente em Node, com ênfase em segurança e usuário não-root.
- 🆓 **Trivy** (aquasecurity.github.io/trivy) — a documentação de uso é curta e você vai
  precisar na fase 7.
- 🆓 **`dive`** (github.com/wagoodman/dive) — ferramenta de terminal para explorar camadas
  de imagem interativamente. Excelente para entender o que está ocupando espaço.
- 💰 **"Docker Deep Dive"** (Nigel Poulton) — capítulos 6 e 8, sobre imagens e
  containerização de apps.
