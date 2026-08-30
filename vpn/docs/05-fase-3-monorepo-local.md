# Fase 3 — Monorepo local: pnpm workspaces + Turborepo

## Objetivo

Ao final desta fase você tem, **na sua máquina Windows**, um monorepo funcionando com
pnpm workspaces e Turborepo, contendo uma app Fastify em TypeScript que responde
`Hello World`, expõe `/health`, `/ready` e `/metrics`, e conversa com Postgres e Redis.
Nada é tocado no servidor nesta fase.

---

## Por que isso existe

A ordem importa: você valida a aplicação localmente antes de envolver Docker, CI e
servidor. Se você juntar tudo de uma vez e o "Hello World" não responder, a causa pode
estar em seis camadas diferentes. Isolando, cada camada é validada uma vez.

**Por que monorepo?** Porque você vai ter mais de uma app, elas vão compartilhar tipos,
configuração de ESLint/TypeScript e provavelmente o cliente do banco. Com repositórios
separados, cada mudança compartilhada vira publicar pacote no npm, atualizar versão em
três lugares e torcer. No monorepo, é um import.

**Por que Turborepo e não só pnpm?** O pnpm resolve dependências e links. Ele não sabe
que `build` de `apps/hello-api` depende de `build` de `packages/config`, nem consegue
pular tarefas cujo resultado já existe. Turborepo faz as duas coisas: grafo de
dependências entre tarefas e cache por hash de conteúdo. Num monorepo pequeno o ganho é
modesto; a partir de 4–5 pacotes ele transforma builds de minutos em segundos — e é o
que torna o CI da [Fase 7](09-fase-7-cicd-github-actions.md) rápido.

Os três endpoints não são enfeite:

- **`/health`** (liveness) — "o processo está vivo?". Se falhar, reinicie o container.
- **`/ready`** (readiness) — "posso receber tráfego?". Verifica dependências: se o
  Postgres caiu, a app está viva mas não está pronta. Separar os dois evita o pior
  cenário — reiniciar em loop uma app saudável porque o banco está fora.
- **`/metrics`** — formato Prometheus, é daqui que a [Fase 8](10-fase-8-observabilidade.md)
  extrai tudo. Sem esse endpoint, o VictoriaMetrics não tem o que coletar.

---

## Passo a passo

### 3.1 — Pré-requisitos locais

```bash
# 💻 local
node --version    # precisa ser >= 20
```

Se não tiver Node 20+, instale via [Volta](https://volta.sh) ou fnm — evita o inferno de
versões globais no Windows.

Habilite o pnpm pelo Corepack, que já vem com o Node:

```bash
# 💻 local
corepack enable
corepack prepare pnpm@latest --activate
pnpm --version
```

Corepack fixa a versão do pnpm no `package.json`, garantindo que sua máquina e o CI usem
exatamente a mesma. Isso elimina uma classe inteira de "funciona na minha máquina".

### 3.2 — Estrutura do monorepo

```bash
# 💻 local
mkdir -p C:/Users/amara/Documents/projects/vps-stack
cd C:/Users/amara/Documents/projects/vps-stack
git init
```

A estrutura alvo:

```
vps-stack/
├── apps/
│   └── hello-api/          <- a aplicacao Node
├── packages/
│   ├── tsconfig/           <- config TypeScript compartilhada
│   └── eslint-config/      <- regras de lint compartilhadas
├── infra/                  <- docker-compose, Traefik, configs (Fases 5-8)
├── docs/                   <- esta spec (opcional: mover para ca)
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── .gitignore
```

**Por que `apps/` e `packages/` separados?** Convenção amplamente adotada e semanticamente
útil: `apps/` são coisas que rodam e são publicadas (cada uma vira uma imagem Docker);
`packages/` são bibliotecas consumidas por outros pacotes e nunca deployadas sozinhas.
A distinção facilita filtros no Turborepo e no CI.

### 3.3 — `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### 3.4 — `package.json` da raiz

```json
{
  "name": "vps-stack",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20" },
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test"
  },
  "devDependencies": {
    "turbo": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

**`"private": true`** é uma proteção real: impede publicar o repositório inteiro no npm
por acidente. Sempre presente na raiz de um monorepo.

**`packageManager`** é lido pelo Corepack e trava a versão exata do pnpm.

### 3.5 — `turbo.json`

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Este arquivo é o coração do Turborepo, e cada campo tem uma consequência prática:

**`dependsOn: ["^build"]`** — o `^` significa "nas dependências deste pacote". Ou seja:
antes de buildar `hello-api`, builde tudo que ela importa. Sem isso, você compila contra
código desatualizado e recebe erros de tipo que somem ao rodar de novo.

**`outputs`** — quais arquivos são o resultado da tarefa. É o que o Turborepo guarda e
restaura do cache. ⚠️ **Este campo errado é pior que não ter cache.** Se você esquecer
`dist/**`, o Turbo marca a tarefa como cacheada mas não restaura os arquivos — e o passo
seguinte falha com "arquivo não encontrado", de forma intermitente e confusa. Se você
listar demais, o cache incha.

**`outputs: []` no lint e typecheck** — essas tarefas não produzem arquivos, só um código
de saída. Lista vazia é o correto: o Turbo cacheia o sucesso, não artefatos.

**`cache: false` + `persistent: true` no dev** — servidor de desenvolvimento roda para
sempre e nunca deve ser cacheado. `persistent` avisa ao Turbo que a tarefa não termina,
para ele não esperar por ela.

### 3.6 — Config TypeScript compartilhada

`packages/tsconfig/package.json`:

```json
{
  "name": "@repo/tsconfig",
  "version": "0.0.0",
  "private": true,
  "files": ["base.json", "node.json"]
}
```

`packages/tsconfig/base.json`:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "resolveJsonModule": true
  }
}
```

`noUncheckedIndexedAccess` é a opção mais subestimada do TypeScript: faz `arr[0]` ter tipo
`T | undefined`, que é a verdade. Incômodo no começo, evita uma categoria inteira de erro
em runtime.

`packages/tsconfig/node.json`:

```json
{
  "extends": "./base.json",
  "compilerOptions": {
    "lib": ["ES2023"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "outDir": "dist",
    "sourceMap": true,
    "declaration": false
  }
}
```

### 3.7 — A aplicação

```bash
# 💻 local
mkdir -p apps/hello-api/src
```

`apps/hello-api/package.json`:

```json
{
  "name": "hello-api",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "pg": "^8.13.0",
    "ioredis": "^5.4.1",
    "prom-client": "^15.1.3",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@repo/tsconfig": "workspace:*",
    "@types/node": "^22.7.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

**`"@repo/tsconfig": "workspace:*"`** — o protocolo `workspace:` diz ao pnpm para linkar
o pacote local em vez de buscar no npm. Se você publicasse este pacote, o pnpm substitui
pela versão real automaticamente. É o mecanismo central dos workspaces.

`apps/hello-api/tsconfig.json`:

```json
{
  "extends": "@repo/tsconfig/node.json",
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`apps/hello-api/src/env.ts` — validação de configuração:

```typescript
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Configuracao invalida:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
```

🔒 Por que validar env com Zod: sem isso, uma variável faltando vira `undefined`, que
vira uma string `"undefined"` na connection string, que vira um erro obscuro três camadas
abaixo. Falhar imediatamente na inicialização, com mensagem clara, é infinitamente melhor
que degradar silenciosamente. Isso segue o princípio *fail fast* — e num container,
falhar rápido significa que o healthcheck detecta e o Docker reinicia.

`apps/hello-api/src/index.ts`:

```typescript
import Fastify from "fastify";
import { Registry, collectDefaultMetrics, Counter } from "prom-client";
import { env } from "./env.js";

const app = Fastify({
  logger: {
    level: env.NODE_ENV === "production" ? "info" : "debug",
  },
});

// --- Metricas ---
const registry = new Registry();
collectDefaultMetrics({ register: registry });

const httpRequests = new Counter({
  name: "http_requests_total",
  help: "Total de requisicoes HTTP",
  labelNames: ["method", "route", "status"],
  registers: [registry],
});

app.addHook("onResponse", (req, reply, done) => {
  httpRequests.inc({
    method: req.method,
    route: req.routeOptions.url ?? "unknown",
    status: reply.statusCode,
  });
  done();
});

// --- Rotas ---
app.get("/", async () => {
  return { message: "Hello World", env: env.NODE_ENV };
});

// Liveness: o processo esta vivo? Nao checa dependencias de proposito.
app.get("/health", async () => {
  return { status: "ok", uptime: process.uptime() };
});

// Readiness: posso receber trafego? Aqui sim checa dependencias.
app.get("/ready", async (_req, reply) => {
  const checks: Record<string, boolean> = {};

  // Preencher na Fase 6, quando Postgres e Redis existirem:
  // checks.postgres = await pingPostgres();
  // checks.redis = await pingRedis();

  const allOk = Object.values(checks).every(Boolean);
  if (!allOk) {
    return reply.code(503).send({ status: "not_ready", checks });
  }
  return { status: "ready", checks };
});

app.get("/metrics", async (_req, reply) => {
  reply.header("Content-Type", registry.contentType);
  return registry.metrics();
});

// --- Shutdown limpo ---
const shutdown = async (signal: string) => {
  app.log.info(`Recebido ${signal}, encerrando...`);
  await app.close();
  process.exit(0);
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

app.listen({ port: env.PORT, host: env.HOST }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
```

Dois detalhes que parecem menores e não são:

**`host: "0.0.0.0"`** — dentro de um container, escutar em `127.0.0.1` significa que
**nada de fora do container alcança a app**. É a causa mais comum de "meu container sobe
mas não responde".

**Tratamento de `SIGTERM`** — quando o Docker para um container, ele manda `SIGTERM` e
espera 10 segundos antes de `SIGKILL`. Sem esse handler, conexões em andamento são
cortadas no meio a cada deploy. Com ele, o Fastify termina as requisições ativas antes de
sair.

### 3.8 — Instalar e rodar

```bash
# 💻 local
pnpm install
pnpm dev
```

Em outro terminal:

```bash
# 💻 local
curl http://localhost:3000/
curl http://localhost:3000/health
curl http://localhost:3000/metrics
```

### 3.9 — `.gitignore`

```
node_modules/
dist/
.turbo/
*.log

# 🔒 Segredos nunca vao para o git
.env
.env.*
!.env.example
*.pem
*.key
```

🔒 O padrão `.env.*` com exceção para `.env.example` é o mesmo usado no seu repositório
`k8` para os `*.secret.yaml`. Mantenha a convenção: o `.example` documenta **quais**
variáveis existem, com valores placeholder, sem nunca conter um segredo real.

---

## Por que não fazer diferente

**"Por que pnpm e não npm ou yarn?"** — pnpm usa um armazenamento global com hard links:
uma dependência baixada uma vez é reusada por todos os projetos, economizando disco e
tempo. Mais importante, ele é *estrito* por padrão: seu pacote só importa o que declarou
como dependência. O npm achata tudo num `node_modules` plano, e você acaba importando
por acidente uma dependência transitiva — que some quando alguém atualiza outra coisa.
Ver [ADR-002](adr/002-pnpm-turborepo.md).

**"Por que Turborepo e não Nx?"** — Nx é mais poderoso: geradores de código, grafo de
dependências visual, plugins por framework. Também é mais opinativo e tem curva maior.
Turborepo faz uma coisa (orquestrar e cachear tarefas) e sai do caminho. Para 2–5
pacotes, o Nx é ferramenta demais. **Se você chegar a 20+ pacotes com times diferentes,
reconsidere.**

**"Por que Fastify e não Express?"** — Express é mais conhecido, mas está em manutenção
lenta, não tem tipos de primeira classe e não traz validação de schema. Fastify é ~2×
mais rápido, tem TypeScript nativo, logger estruturado (Pino) embutido — o que importa
muito para a fase 8, porque log em JSON é o que o Loki consulta bem — e um sistema de
plugins com escopo. Para uma API nova em 2026, Fastify é a escolha padrão. Hono é uma
alternativa moderna e ainda mais leve, boa se você quiser rodar também em edge runtimes.

**"Por que não usar Bun, que junta runtime e gerenciador de pacotes?"** — Bun é rápido e
agradável, mas em produção o ecossistema Node ainda é mais previsível: mais imagens
Docker maduras, mais bibliotecas testadas, comportamento conhecido sob carga. Como o
objetivo aqui inclui aprender fundamentos que transferem, Node é a base mais segura.

**"Por que TypeScript se é só um Hello World?"** — Porque não vai continuar sendo um
Hello World. Adicionar TS depois num projeto que cresceu é bem mais caro que começar com
ele.

---

## Como garantir que está certo

**Workspaces reconhecidos:**

```bash
# 💻 local
pnpm list --depth -1 -r
```
→ Esperado: a raiz, `hello-api` e `@repo/tsconfig` listados.

**A app responde:**

```bash
# 💻 local
curl -s http://localhost:3000/ | jq
```
→ Esperado: `{ "message": "Hello World", "env": "development" }`

```bash
curl -s http://localhost:3000/health | jq
```
→ Esperado: `{ "status": "ok", "uptime": <numero> }`

```bash
curl -s http://localhost:3000/metrics | head -20
```
→ Esperado: texto plano com linhas `# HELP` e `# TYPE`, seguidas de métricas como
`process_cpu_user_seconds_total`. Se vier JSON ou HTML, o Content-Type está errado e o
coletor não vai entender.

**O cache do Turborepo funciona** — este é o teste que ensina o valor da ferramenta:

```bash
# 💻 local
pnpm build              # primeira vez: compila de verdade
pnpm build              # segunda vez
```
→ Esperado na segunda execução: `>>> FULL TURBO` e tempo próximo de zero. Se recompilar
tudo de novo, o campo `outputs` no `turbo.json` provavelmente está errado.

**A validação de env falha como deve:**

```bash
# 💻 local
PORT=abc pnpm dev
```
→ Esperado: mensagem `Configuracao invalida:` mencionando `PORT`, e saída imediata com
código diferente de zero. Se a app subir mesmo assim, o Zod não está sendo consultado.

**Typecheck limpo:**

```bash
# 💻 local
pnpm typecheck
```
→ Esperado: nenhum erro.

**Nenhum segredo rastreado pelo git:**

```bash
# 💻 local
git status --porcelain | grep -E '\.env$|\.env\.' || echo "OK - nenhum .env rastreado"
```

---

## Armadilhas comuns

**`ERR_PNPM_OUTDATED_LOCKFILE` no CI.** Você instalou uma dependência sem commitar o
`pnpm-lock.yaml`. O lockfile é obrigatório no repositório — é ele que garante que o CI
instala exatamente as mesmas versões.

**`Cannot find module './env.js'` com TypeScript.** Com `"type": "module"` e
`moduleResolution: NodeNext`, os imports relativos precisam da extensão `.js` **mesmo no
arquivo `.ts`**. Isso confunde todo mundo na primeira vez: você escreve `.js` mas o
arquivo é `.ts`, porque o import se refere ao resultado da compilação.

**Turborepo cacheando algo que não deveria.** Se uma tarefa depende de um arquivo que o
Turbo não conhece (um `.env`, um arquivo fora do pacote), o hash não muda e você recebe
resultado velho. Declare em `inputs` ou marque `cache: false`.

**Symlinks do pnpm no Windows.** Sem modo de desenvolvedor ativado, o pnpm cai para
cópia — funciona, mas ocupa mais disco. Ative o Modo de Desenvolvedor nas configurações
do Windows.

**`workspace:*` publicado por engano.** Se um dia você publicar um pacote no npm com essa
referência intacta, ele quebra para quem instalar. Manter tudo `"private": true` previne.

---

## Para estudar

- 🆓 **Docs oficiais do Turborepo** — o guia "Core Concepts" explica caching e o grafo de
  tarefas melhor que qualquer tutorial. Curto e bem escrito.
- 🆓 **Docs do pnpm: "Workspace"** — em especial a página sobre o protocolo `workspace:`
  e sobre `--filter`, que é a base da Fase 4.
- 🆓 **Jack Herrington (YouTube)** — tem série específica sobre monorepos com Turborepo,
  com bom ritmo e exemplos reais.
- 🆓 **Fastify docs: "Getting Started" e "Plugins"** — o modelo de encapsulamento do
  Fastify é diferente do Express e vale entender antes de crescer a app.
- 🆓 **Zod docs** — a seção de `coerce` e `safeParse` é o que você usou aqui.
- 🆓 **"Why should I use pnpm?"** — artigo no blog oficial, explica a estrutura de
  `node_modules` com diagramas. Esclarece por que o pnpm quebra imports acidentais.
- 💰 **"Effective TypeScript"** (Dan Vanderkam) — 62 itens curtos; os capítulos sobre
  configuração de `tsconfig` e tipos estritos são diretamente aplicáveis aqui.
