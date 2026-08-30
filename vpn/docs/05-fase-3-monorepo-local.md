# Fase 3 — Preparar o monorepo existente para containers

## Objetivo

Ao final desta fase, o monorepo atual está pronto para gerar as imagens de `apps/web` e
`apps/api` na fase 4. Esta fase não cria repositório, aplicação demonstrativa, banco,
migração, `auth-api` nem `jobs-api`.

Tudo acontece na máquina Windows; o servidor não é alterado.

## Estado já existente

Antes de editar, confirme em vez de recriar:

```text
apps/web          Next.js 16
apps/mobile       Expo 57, não será containerizado no VPS
apps/api          NestJS 11
packages/entities domínio, portas e DTOs
packages/persistence persistência Firestore atual
packages/timeline regras compartilhadas de data
packages/theme    tokens visuais
```

Também já existem `package.json` privado, pnpm workspace, lockfile, Turborepo,
TypeScript estrito, build ordenado por `^build` e validação de ambiente com Zod.

Registre as versões reais:

```powershell
node --version       # esperado: 24+
pnpm --version       # deve respeitar packageManager
pnpm list --depth -1 -r
```

Não copie versões ou manifestos desta spec por cima do repositório.

## Adições necessárias

### 3.1 — Contrato operacional da API

Adicionar ao Nest:

| Endpoint | Semântica | Dependências no primeiro deploy |
|---|---|---|
| `GET /health` | liveness do processo | nenhuma |
| `GET /ready` | aplicação terminou o bootstrap | nenhuma chamada faturável |
| `GET /metrics` | métricas Prometheus | processo e HTTP |

`/ready` não lê documentos do Firestore a cada sondagem. Inicializar o SDK e validar a
configuração não prova disponibilidade externa, mas evita gerar custo e tráfego apenas
para healthcheck. PostgreSQL e Redis também não aparecem em readiness antes de a API
realmente depender deles. Após a migração, um `SELECT 1` com deadline curto será incluído.

Métricas HTTP usam método, rota normalizada e status. Nunca use URL completa, `userId`,
event ID, token ou corpo como label: isso cria alta cardinalidade e pode vazar dados.

Habilitar shutdown hooks do Nest para que `SIGTERM` pare de aceitar conexões e feche os
providers antes do timeout do Docker.

### 3.2 — Contrato operacional do web

Adicionar `GET /health` próprio do Next, que responde sem consultar API ou Firebase.
Ele prova que o processo web está vivo; a verificação ponta a ponta será separada.

Em `apps/web/next.config.ts`, habilitar:

```typescript
output: "standalone"
```

Como o web importa packages fora de `apps/web`, configurar o tracing com a raiz do
monorepo. A fase 4 deverá copiar `public` e `.next/static`, que não entram automaticamente
na pasta standalone.

### 3.3 — Comunicação web→API em container

Localmente, o backend continua em `http://127.0.0.1:3001`. Em Compose, processos estão em
containers diferentes e loopback aponta para o próprio container. Portanto:

```dotenv
BACKEND_URL=http://api:3001
API_HOST=0.0.0.0
```

`API_HOST=0.0.0.0` não torna a API pública: isso apenas permite que outros containers a
alcancem. A proteção vem de não declarar `ports:` nem router Traefik para `api`.

O rewrite em `next.config.ts` é materializado durante `next build`. Assim,
`BACKEND_URL=http://api:3001` deve existir no build da imagem e novamente no runtime.
As chamadas server-side também leem a variável no runtime.

### 3.4 — Segredos e arquivos ignorados

Manter o `.env.example` versionado e assegurar no `.gitignore`:

```gitignore
.env
.env.local
.env*.local
*.pem
*.key
```

As variáveis `NEXT_PUBLIC_FIREBASE_*` são públicas e serão fornecidas no build do web.
Firebase Admin e OpenRouter são segredos de runtime exclusivos da API.

### 3.5 — Limites desta fase

Não fazer agora:

- instalar driver ou ORM PostgreSQL;
- criar schema ou migrations;
- trocar repositories Firestore;
- entregar `DATABASE_URL` ou `REDIS_URL` à API;
- criar workspaces vazios para auth ou filas;
- expor a API para o mobile;
- criar Dockerfiles — isso pertence à fase 4.

## Como garantir que está certo

Execute a suíte definida pelo repositório:

```powershell
npm run --silent test:ai
pnpm turbo run typecheck
pnpm turbo run build
pnpm turbo run build
```

A segunda build deve reutilizar o cache do Turbo. Em seguida, com web e API locais:

```powershell
curl.exe http://127.0.0.1:3001/health
curl.exe http://127.0.0.1:3001/ready
curl.exe http://127.0.0.1:3001/metrics
curl.exe http://localhost:3000/health
```

Critérios de saída:

- `/health` dos dois processos responde 200;
- `/ready` não faz leitura no Firestore e não menciona PostgreSQL/Redis;
- `/metrics` usa content type Prometheus e não contém identificadores de usuário;
- a API continua em loopback por padrão no desenvolvimento;
- `output: "standalone"` gera `.next/standalone`;
- nenhuma aplicação, package ou configuração existente foi recriada.

## Armadilhas comuns

**Usar `127.0.0.1` entre containers.** O web tentará chamar a si mesmo. Use o nome do
serviço Docker: `api`.

**Definir `BACKEND_URL` apenas no Compose.** O rewrite do Next já terá sido construído
com outro destino. Forneça a variável também no build.

**Readiness depender de infraestrutura ociosa.** PostgreSQL estar fora do ar ainda não
torna a API Firestore indisponível. Só cheque dependências que atendem requisições atuais.

**Labels com caminhos reais.** `/api/events/01ABC...` cria uma série por evento. Exporte
o template `/api/events/:eventId`.

## Para estudar

- NestJS lifecycle events e shutdown hooks.
- Formato de exposição do `prom-client` e cardinalidade de labels.
- Next.js standalone output e output file tracing em monorepos.
- Variáveis de ambiente de build e runtime no Next.js.
