# Instruções para agentes — inventário consolidado

> Documento gerado em 2026-10-19 a partir das fontes canônicas do repositório.
> As fontes continuam sendo a verdade; este arquivo é um apanhado para leitura.
> Worktrees em `.worktrees/` são cópias e foram ignoradas.

## Sumário das fontes

| # | Arquivo | Papel |
|---|---|---|
| 1 | `AGENTS.md` | Guia raiz do monorepo (arquitetura, pnpm, worktrees, paridade web↔mobile) |
| 2 | `CLAUDE.md` | Shim que importa `AGENTS.md` |
| 3 | `apps/web/AGENTS.md` | Regra específica do Next.js da aplicação web |
| 4 | `apps/web/CLAUDE.md` | Shim que importa `apps/web/AGENTS.md` |
| 5 | `.agents/README.md` | Contrato da infraestrutura compartilhada de IA |
| 6 | `.agents/manifest.yaml` | Manifesto dos componentes de `.agents/` |
| 7 | `.agents/adapters/README.md` | Limites de adaptação por agente |
| 8 | `.agents/skills/*/SKILL.md` | 11 skills operacionais (listadas abaixo) |

Skills: `db-migrations`, `e2e-tests`, `frontend-design`, `grill-me`,
`grill-with-docs`, `install-dependencies`, `investigate-first`,
`kotlin-android`, `running-tests`, `typesafe-ai`, `worktree-app-testing`.

### Onde há (e onde não há) instrução por aplicação

- `apps/web`: `AGENTS.md` próprio (regras do Next.js) + `CLAUDE.md`.
- `apps/api`, `apps/auth`, `apps/mobile`: **não** têm `AGENTS.md` próprio.
  A orientação vem das skills (`db-migrations` para api/auth,
  `kotlin-android` para mobile) e do guia raiz.

---

## 1. Guia raiz — `AGENTS.md`

# Repository Guide

- `apps/web`: browser interface for the timeline and task management.
- `apps/mobile`: Android native app (Kotlin + Compose) that mirrors the web experience.
- `apps/api`: business use cases and the HTTP API for tasks, artifacts, recurrences, and AI requests.
- `apps/auth`: identity gateway handling sign-in, sessions, access, and roles.
- `packages/contracts`: shared data contracts and types.
- `packages/timeline`: shared date windows, grouping, and timeline calculations.
- `packages/theme`: shared visual tokens and colors.

Use `pnpm` from the repository root. Common commands: `pnpm install`, `pnpm dev`, `pnpm build`, and `pnpm test`.
Create an isolated worktree with `pnpm worktree:new <caminho> -b <branch>`.
Toda criação de worktree DEVE seguir esse comando e não pode pular nenhum passo
(`scripts/worktree/provision-env.sh`): alias `<worktree>.braid.local` (Caddy +
`/etc/hosts`), `node_modules` íntegros, bases `<worktree>` e `<worktree>_auth` no
Postgres compartilhado (porta 54391), migrations, usuário `admin@admin.com`
(senha `ADMIN_PASSWORD`) e servidores de dev no ar. Ao final, informe o link `https://<worktree>.braid.local:8443`.
Remova com `pnpm worktree:teardown <caminho>`. Pré-requisitos únicos por máquina:
`sudo bash scripts/worktree/hosts-install.sh` e `pnpm caddy:trust` (confia na CA local do
Caddy; o alias sai em HTTPS porque o navegador só libera geolocalização em origem segura).
Run development commands from the root, not from an individual app directory.

## Paridade web ↔ mobile

O app Android (`apps/mobile`) repercute a experiência mobile do web
(`apps/web`). Toda mudança visível ao usuário em `apps/web` — tela, fluxo,
campo, texto, cor ou comportamento — precisa da mudança equivalente em
`apps/mobile`, no mesmo PR ou num PR vinculado, e de uma linha atualizada em
`docs/mobile-parity.md`.

Mudanças em `packages/contracts` ou `packages/theme` exigem rodar os testes de
contrato do mobile (`pnpm --filter @repo/mobile run test`).

Para qualquer mudança em `apps/mobile`, carregue `.agents/skills/kotlin-android/SKILL.md`;
ela documenta as camadas, o procedimento de paridade e a validação Android.

---

## 2. Shim — `CLAUDE.md` (raiz)

Conteúdo integral:

```text
@AGENTS.md
```

---

## 3. Aplicação web — `apps/web/AGENTS.md`

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

---

## 4. Shim — `apps/web/CLAUDE.md`

Conteúdo integral:

```text
@AGENTS.md
```

---

## 5. Contrato da infraestrutura de IA — `.agents/README.md`

# Infraestrutura compartilhada de IA

`.agents/` é a fonte canônica versionada para os artefatos que podem ser
compartilhados entre agentes, o checkout local e a VPS.

## O que entra aqui

- contratos e skills próprios do repositório;
- hooks portáveis, sem caminhos absolutos ou segredos;
- exemplos sanitizados de MCPs e plugins;
- scripts de validação e diagnóstico;
- o runner de navegador headless usado em smoke tests.

A documentação do projeto — inclusive a desta camada — fica em
[`docs/`](../docs/), com os runbooks em [`docs/runbook/`](../docs/runbook/).

## O que não entra aqui

Tokens, cookies, perfis de navegador, chaves SSH, arquivos `.env`, bancos,
volumes, caches, logs, worktrees ativas e artefatos de execução ficam fora do
Git. O `.gitignore` reserva `.agents/local/`, `.agents/runtime/` e afins para
esses dados, mas eles não devem ser usados como armazenamento permanente.

## Descoberta e precedência

1. Leia [`manifest.yaml`](./manifest.yaml) para saber quais componentes fazem
   parte do contrato.
2. O Codex e o Claude descobrem as skills diretamente em `skills/`; os demais
   componentes são carregados explicitamente ou servem só como documentação.
3. Valores locais são injetados por ambiente ou pelo 1Password.
4. Uma definição local não substitui silenciosamente um componente canônico.

## Convenções

- nomes de componentes e arquivos em `kebab-case`;
- exemplos terminam em `.example.*` e nunca contêm valores reais;
- mudanças incompatíveis incrementam `schemaVersion` no manifesto;
- valide tudo com `pnpm agents:validate`.

## Componentes

- [`skills/`](./skills/) — skills próprias deste repositório;
- [`hooks/`](./hooks/) — eventos e wrappers de ciclo de vida;
- [`mcp/`](./mcp/) — contratos e exemplos de servidores MCP;
- [`plugins/`](./plugins/) — integrações e permissões mínimas;
- [`browser/`](./browser/) — runner Playwright efêmero para smoke tests;
- [`environments/`](./environments/) — ambientes locais de apoio;
- [`adapters/`](./adapters/) — como cada agente consome este contrato;
- [`scripts/`](./scripts/) — automação segura e idempotente.

---

## 6. Manifesto — `.agents/manifest.yaml`

```yaml
schemaVersion: 2
name: timeline-project-ai-infrastructure
description: Contrato compartilhado de infraestrutura de IA deste repositório.
sourceOfTruth: .agents

# Componentes declarativos. O Codex descobre as skills diretamente em
# `.agents/skills/`; este manifesto descreve o contrato, mas não executa nada.
components:
  skills:
    path: skills
    loading: explicit
  hooks:
    path: hooks
    loading: explicit
  mcp:
    path: mcp
    loading: explicit
  plugins:
    path: plugins
    loading: explicit
  browser:
    path: browser
    loading: explicit
  environments:
    path: environments
    loading: explicit
  adapters:
    path: adapters
    loading: documentation-only
  # As worktrees são criadas pelos scripts da raiz (`pnpm worktree:new`).
  worktrees:
    path: ../scripts/worktree
    loading: explicit
  scripts:
    path: scripts
    loading: explicit
  # A documentação vive em `docs/` na raiz do repositório (runbooks em `docs/runbook/`).
  docs:
    path: ../docs
    loading: documentation-only

security:
  secrets: external-only
  localStateDirectories:
    - .agents/local
    - .agents/state
    - .agents/runtime
    - .agents/secrets
  requireSanitizedExamples: true
```

---

## 7. Adaptadores — `.agents/adapters/README.md`

# Adaptadores

O Codex não precisa de adaptador para estas skills: a fonte canônica já está
no caminho descoberto `.agents/skills/`. Este diretório registra apenas os
limites para integrações que possam exigir outro formato no futuro.

Não coloque cópias ou symlinks de skills aqui.

---

## Skill: `db-migrations` — `.agents/skills/db-migrations/SKILL.md`

---
name: db-migrations
description: Use when changing a Drizzle schema, generating or applying database migrations, or setting up the local PostgreSQL database for development.
---

# Database migrations

This monorepo has two independent PostgreSQL schemas and migration workflows:

- API database: `apps/api`, using `DATABASE_URL`.
- Auth database: `apps/auth`, using the separate migration credential
  `AUTH_DATABASE_MIGRATION_URL`.

Run commands from the repository root.

## API database

The Drizzle schema is under
`apps/api/src/infrastructure/persistence/database/schema` and migrations are
written to `apps/api/drizzle/`.

```bash
pnpm db:generate
pnpm db:migrate
```

`db:generate` creates a migration from the current schema. `db:migrate`
applies pending migrations to `DATABASE_URL`.

For a local database, start PostgreSQL first:

```bash
pnpm compose:up
```

Worktree-specific databases and ports are provisioned by the worktree scripts;
do not replace their generated `.env.local` values manually.

## Auth database

The Auth schema is under `apps/auth/src/db/schema.ts` and migrations are stored
in `apps/auth/drizzle/`.

```bash
pnpm --filter @repo/auth run db:generate
pnpm --filter @repo/auth run db:migrate
```

Apply Auth migrations with `AUTH_DATABASE_MIGRATION_URL`, never with the
runtime credential `AUTH_DATABASE_URL`. For permissions, readiness checks, and
rollback, read `docs/runbook/auth-database.md`.

## Non-negotiable rule

Never edit a migration that has already been applied in a shared environment.
Create a new migration instead. The migration tables track filenames, so
rewriting an existing file creates drift rather than applying the change again.

---

## Skill: `e2e-tests` — `.agents/skills/e2e-tests/SKILL.md`

---
name: e2e-tests
description: Use when adding or changing Playwright scenarios through the real web, Auth, and API chain with external dependencies mocked.
---

# Adding E2E scenarios

- Add `test/e2e/*.e2e.spec.ts`. In `beforeAll`, call `createE2eUserForFile(__filename)`; every file owns a different real Auth user. Keep tests within a file serial if they mutate that user's state. Files may run in parallel. Use a second user to verify ownership boundaries. Call `blockExternalBrowserRequests(page)` in browser scenarios.
- Drive the real UI with Playwright through Next → Auth → API and assert user-visible results plus important persisted effects. Direct DB access is only for fixtures/assertions, never a replacement for a user action.
- Mock all external HTTP via `test/e2e/external-mocks.mjs`, loaded only in E2E service processes. Keep internal service calls real. Block browser requests to public hosts. Never allow a real email, OpenRouter, broker, or other external call; add explicit non-HTTP publisher fakes when a flow needs them.
- Map applicable success, loading/navigation, validation, auth/ownership, persistence, conflict/retry, and external-failure behavior before adding tests. Cover all expected behavior for the integrated feature, not just one happy path.
- Reuse `test/e2e/global-setup.ts`: one E2E Testcontainers Postgres, separate Auth/API databases, migrations, real service startup, and teardown. Do not create a per-scenario container or globally truncate shared tables; clean only file-owned users/data.
- During feature development run only `npm run --silent test:unit:ai`. After the frontend and both services form the intended flow, run `npm run --silent test:e2e:ai`; use `test:e2e` for full output. Relevant integrated service tests run with `test:integration(:ai)`.

---

## Skill: `frontend-design` — `.agents/skills/frontend-design/SKILL.md`

---
name: frontend-design
description: Use when building a new frontend, redesigning an existing UI, or choosing a visual direction for a web interface that should feel distinctive, intentional, and specific to its subject rather than like a templated default.
license: Complete terms in LICENSE.txt
---

# Frontend Design

Approach this as the design lead at a small studio known for giving every client a visual identity that could not be mistaken for anyone else's. This client has already rejected proposals that felt templated, and is paying for a distinctive point of view: make deliberate, opinionated choices about palette, typography, and layout that are specific to this brief, and take one real aesthetic risk you can justify.

## Ground It In The Subject

If the brief does not pin down what the product or subject is, pin it yourself before designing: name one concrete subject, its audience, and the page's single job, and state your choice. If there is any information in memory about the human's preferences, context about what they are building, or designs made before, use that as a hint. The subject's own world, its materials, instruments, artifacts, and vernacular, is where distinctive choices come from. Build with the brief's real content and subject matter throughout.

## Design Principles

### Hero As Thesis

For web designs, the hero is a thesis. Open with the most characteristic thing in the subject's world, in whatever form makes sense for it: a headline, an image, an animation, a live demo, or an interactive moment. Be deliberate with the choice: a big number with a small label, supporting stats, and a gradient accent is the template answer, only use it if that is truly the best option.

### Typography Carries Personality

Pair the display and body faces deliberately, not the same families you would reach for on any other project, and set a clear type scale with intentional weights, widths, and spacing. Make the type treatment itself a memorable part of the design, not a neutral delivery vehicle for the content.

### Structure Is Information

Structural devices, numbering, eyebrows, dividers, and labels should encode something true about the content, not decorate it. Many generic designs use numbered markers (`01 / 02 / 03`), but that is only appropriate if the content actually is a sequence, like a real process or a typed timeline where order carries information the reader needs. Question whether devices like numbered markers actually make sense before incorporating them.

### Motion With Intent

Think about where and whether animation can serve the subject: a page-load sequence, a scroll-triggered reveal, hover micro-interactions, or ambient atmosphere. An orchestrated moment usually lands harder than scattered effects; choose what the direction calls for. However, sometimes less is more, and extra animation contributes to the feeling that the design is AI-generated.

### Match Complexity To Vision

Maximalist directions need elaborate execution; minimal directions need precision in spacing, type, and detail. Elegance is executing the chosen vision well.

### Copy Is Design Material

Often a brief does not contain real content, and it is up to you to supply copy. Copy can make a design feel as templated as the layout. Treat written content with the same intentionality as spacing and color.

## Process

Work in two passes before building.

### Pass 1: Build A Compact Design Plan

Create a short plan with these four parts:

- `Color`: describe the palette as 4-6 named hex values.
- `Type`: list typefaces for 2 or more roles, including a characterful display face used with restraint, a complementary body face, and a utility face for captions or data if needed.
- `Layout`: describe the layout concept in one-sentence prose and compare ideas with ASCII wireframes when useful.
- `Signature`: define the single unique element the page should be remembered by, grounded in the brief.

### Pass 2: Critique The Plan Before Coding

Review the plan against the brief. If any part reads like a generic default you would produce for any similar page rather than a choice made for this specific subject, revise it. State what changed and why, then build from the revised plan exactly, deriving every color and type decision from it.

For calibration: AI-generated design currently clusters around three default looks:

1. A warm cream background (near `#F4F1EA`) with a high-contrast serif display and a terracotta accent.
2. A near-black background with a single bright acid-green or vermilion accent.
3. A broadsheet-style layout with hairline rules, zero border-radius, and dense newspaper-like columns.

All three can be legitimate for some briefs, but they are defaults rather than choices, and they appear regardless of subject. Where the brief pins down a visual direction, follow it exactly. Where it leaves an axis free, do not spend that freedom on one of these defaults.

## Implementation Guidance

When writing the code, keep selector specificity disciplined. It is easy to generate CSS classes that cancel each other out, especially with combinations like a type-based section selector and a more local CTA selector. Watch paddings and margins between sections carefully.

Do as much of the planning and iteration internally as possible, and only show ideas to the user when confidence is high that the direction will delight them.

## Restraint And Self-Critique

Spend boldness in one place. Let the signature element be the memorable move, keep everything around it quiet and disciplined, and cut any decoration that does not serve the brief. Not taking a risk can be a risk itself.

Build to a quality floor without announcing it:

- Responsive down to mobile
- Visible keyboard focus
- Reduced motion respected

Critique the work as it develops. Take screenshots if the environment supports it. A picture is worth 1000 tokens. Follow the spirit of removing one accessory before shipping: inspect the design and cut the least necessary flourish.

If there is a place to keep short notes about what has already been tried, use it to help future passes stay fresh.

## Writing For Design

Words appear in a design for one reason: to make it easier to understand, and therefore easier to use. They are design material, not decoration. Before writing anything, ask what the design needs to say, and how it can best say it to help the person navigate the experience.

Write from the end user's side of the screen. Name things by what people control and recognize, never by how the system is built. A person manages notifications, not webhook config. Describe what something does in plain terms rather than selling it. Specificity beats cleverness.

Use active voice by default. A control should say exactly what happens when it is used: `Save changes`, not `Submit`. An action keeps the same name through the whole flow, so the button that says `Publish` produces a toast that says `Published`. The vocabulary of an interface is signposting; cohesion and consistency are how people learn their way around.

Treat failure and emptiness as moments for direction, not mood. Explain what went wrong and how to fix it, in the interface's voice rather than a person's. Errors should not apologize, and they should never be vague. An empty state is an invitation to act.

Keep the register conversational and tuned: plain verbs, sentence case, no filler, with tone matched to the brand and audience. Let each element do exactly one job. A label labels, an example demonstrates, and nothing quietly does double duty.

---

## Skill: `grill-me` — `.agents/skills/grill-me/SKILL.md`

---
name: grill-me
description: A relentless interview to sharpen a plan or design.
disable-model-invocation: true
---

Call the Skill tool with "grilling".

---

## Skill: `grill-with-docs` — `.agents/skills/grill-with-docs/SKILL.md`

---
name: grill-with-docs
description: A relentless interview to sharpen a plan or design, which also creates docs (ADR's and glossary) as we go.
disable-model-invocation: true
---

Call the Skill tool twice, for "grilling" and "domain-modeling".

---

## Skill: `install-dependencies` — `.agents/skills/install-dependencies/SKILL.md`

---
name: install-dependencies
description: Install, add, or repair dependencies in this pnpm monorepo.
---

# Install dependencies

Use `pnpm` from the repository root. The declared version is in the root
`package.json` (`pnpm@11.24.0`). Prefer `corepack pnpm` so the repository's
package-manager version is used.

## Install or repair

```bash
corepack pnpm install --frozen-lockfile
```

Use `--frozen-lockfile` for reproducible installs. If the manifest changed,
update the lockfile deliberately with `corepack pnpm install`, then run the
frozen install again.

## Add a dependency

Add it to the workspace that owns the code, not the repository root:

```bash
corepack pnpm --filter @repo/api add <package>
```

Use the appropriate workspace filter (`@repo/web`, `@repo/auth`, or a package
under `packages/`). Commit the corresponding
manifest and `pnpm-lock.yaml` changes.

## Common failures

- `ERR_PNPM_IGNORED_BUILDS`: inspect `allowBuilds` in `pnpm-workspace.yaml`.
  Allow only packages that genuinely need install scripts; do not enable every
  package.
- Lockfile or resolution errors: run the install from the root and check that
  `package.json` and `pnpm-lock.yaml` describe the intended change.
- Missing or broken generated dependencies: confirm the exact workspace and
  package-manager version before repairing anything.

Do not delete source files, manifests, or `pnpm-lock.yaml` to fix an install.
`node_modules` is generated and may be recreated only after the cause is
understood.

## Verify

After dependency changes, run the affected workspace's checks:

```bash
corepack pnpm --filter <workspace> typecheck
corepack pnpm --filter <workspace> build
```

Run the focused test command when behavior changed:

```bash
corepack pnpm run --silent test:unit:ai
```

Stop when installation succeeds and the affected checks pass. Report warnings
separately from actual installation failures, and do not upgrade unrelated
dependencies.

---

## Skill: `investigate-first` — `.agents/skills/investigate-first/SKILL.md`

---
name: investigate-first
description: Diagnose ambiguous failures before editing. Use for unknown causes, intermittent behavior, performance regressions, or investigations needing evidence-ranked hypotheses.
---

# Investigate first

Gather evidence before changing product code.

- Separate observed symptom from inferred cause.
- Trace inputs, state transitions, ownership boundaries, and failure output.
- Rank hypotheses by evidence and cheap falsification value.
- Do not edit until one credible mechanism explains evidence.
- Stop exploration when evidence is sufficient to name cause or exact blocker.

Report cause and proof. Make no fix unless task authorizes implementation.

---

## Skill: `kotlin-android` — `.agents/skills/kotlin-android/SKILL.md`

---
name: kotlin-android
description: Use for any implementation, review, testing, or debugging change under apps/mobile, the native Kotlin Android app built with Jetpack Compose.
---

# Kotlin Android no Braid

Use esta skill para qualquer mudança em `apps/mobile`. O app é Android nativo
com Kotlin, Jetpack Compose, Hilt, Retrofit, Kotlin Serialization, coroutines e
Flow. O objetivo é manter o contrato e a experiência do web sem transportar
detalhes do React para a UI Android.

## Mapa da arquitetura

As dependências apontam para dentro:

```text
ui → domain ← data
          ↑
       core (designsystem, network, auth, common)
```

- `ui/`: telas Compose, navegação e ViewModels. A UI observa estado e emite
  eventos; não conhece Retrofit nem DataStore.
- `domain/`: entidades, casos de uso, interfaces de repositório e `UiState`.
  Não importa Android ou implementação de rede.
- `data/`: DTOs de `data/dto/`, APIs Retrofit, mapeadores, repositórios,
  persistência de sessão e cache.
- `core/designsystem/`: tokens gerados em `Color.kt`, tipografia, `BraidTheme`
  e cores de tag. Não use cores hexadecimais dentro de uma tela.
- `core/network/`, `core/auth/` e `core/common/`: infraestrutura compartilhada.

O scaffold real começa em `BraidApp.kt`, `MainActivity.kt`,
`core/designsystem/Theme.kt` e `ui/navigation/AppNavHost.kt`. O fluxo completo
que as próximas telas devem seguir é este:

```kotlin
// data/remote/EventsApi.kt
interface EventsApi {
    @GET("/api/events")
    suspend fun page(@Query("from") from: String): TimelineEventPageDto
}

// domain/events/EventRepository.kt
interface EventRepository {
    suspend fun page(from: String): Result<TimelinePage>
}

// data/events/DefaultEventRepository.kt
class DefaultEventRepository @Inject constructor(
    private val api: EventsApi,
) : EventRepository {
    override suspend fun page(from: String): Result<TimelinePage> = runCatching {
        api.page(from).toDomain()
    }
}

// ui/timeline/TimelineViewModel.kt
@HiltViewModel
class TimelineViewModel @Inject constructor(
    private val repository: EventRepository,
) : ViewModel() {
    val state: StateFlow<TimelineUiState> = flow {
        emit(TimelineUiState.Content(repository.page("2026-09-22").getOrThrow()))
    }.catch { emit(TimelineUiState.Error(it)) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), TimelineUiState.Loading)
}

// ui/timeline/TimelineRoute.kt
@Composable
fun TimelineRoute(viewModel: TimelineViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    TimelineScreen(state = state)
}
```

`BraidApp` e `MainActivity` já demonstram o bootstrap Hilt → Activity →
Compose → `BraidTheme`; ao implementar rede, mantenha esse fluxo e registre
`EventsApi`/`EventRepository` em um módulo Hilt de `data`.

## Java → Kotlin para quem já conhece Java

Aprenda a tradução e a razão, mas preserve as regras do projeto: estado
imutável na fronteira da UI, `!!` evitado e erros tratados explicitamente.

### Null-safety

```java
String label = user != null && user.getName() != null
    ? user.getName() : "Visitante";
```

```kotlin
val label = user?.name ?: "Visitante"
val length = user?.name?.length ?: 0
```

`?` declara que o valor pode ser nulo, `?.` interrompe a cadeia com segurança
e `?:` define o fallback. `!!` afirma que o valor não é nulo e transforma um
problema de dados em crash; só use após uma prova local muito clara, preferindo
validação e tipos não nulos.

### `val`, `var` e imutabilidade

```java
final List<String> tags = new ArrayList<>();
tags.add("foco");
```

```kotlin
val tags = mutableListOf<String>() // referência não muda; conteúdo pode mudar
val nextTags = tags + "foco"       // prefira coleção nova na UI
var selectedDay = today             // só quando a referência realmente muda
```

`val` impede reatribuição, não torna um objeto mutável. Exponha `List`, não
`MutableList`, em DTOs e estados; deixe mutação confinada ao repositório ou ao
ViewModel.

### `data class` e `sealed interface`

```java
final class EventState {
    final String id;
    EventState(String id) { this.id = id; }
    // equals, hashCode e toString escritos manualmente
}
```

```kotlin
data class EventState(val id: String)

sealed interface TimelineUiState {
    data object Loading : TimelineUiState
    data class Content(val events: List<Event>) : TimelineUiState
    data class Error(val cause: Throwable) : TimelineUiState
}

val text = when (state) {
    TimelineUiState.Loading -> "Carregando"
    is TimelineUiState.Content -> "${state.events.size} eventos"
    is TimelineUiState.Error -> "Não foi possível carregar"
}
```

`data class` gera igualdade por valor e cópia; `sealed interface` limita as
variantes conhecidas, permitindo `when` exaustivo sem `default` que esconda um
estado novo. As uniões de `data/dto/` usam o mesmo princípio com
`@JsonClassDiscriminator`.

### Extension functions

```java
static String dayKey(Instant instant) {
    return formatInSaoPaulo(instant);
}
```

```kotlin
fun Instant.dayKey(): String = atZone(BRAID_TIME_ZONE).toLocalDate().toString()
```

A extension mantém a operação junto do tipo sem criar uma classe utilitária
estática. Use extensions para conversões puras (`Dto.toDomain()`), não para
esconder efeitos de rede ou estado global.

### Lambdas e scope functions

```java
api.load(id, value -> repository.save(value));
```

```kotlin
api.load(id) { value -> repository.save(value) }
val request = CreateEventRequest().apply { name = input.trim() }
repository.save(request).also { logger.debug("saved=${it.id}") }
```

`let` transforma um valor e é útil após `?.`; `apply` configura o próprio
objeto e retorna ele; `also` executa observação lateral e retorna o objeto;
`run` agrupa cálculo usando o receiver. Não encadeie scope functions a ponto de
ocultar qual `this` está ativo.

### `object` e `companion object`

```java
final class TimeZones {
    static final ZoneId BRAZIL = ZoneId.of("America/Sao_Paulo");
}
```

```kotlin
object TimeZones {
    val brazil: ZoneId = ZoneId.of("America/Sao_Paulo")
}

class Cursor private constructor(val value: String) {
    companion object {
        fun of(raw: String): Cursor? = raw.takeIf(String::isNotBlank)?.let(::Cursor)
    }
}
```

`object` é um singleton explícito; `companion object` fornece membros ligados
à classe, mas não é uma keyword `static`. Prefira injeção Hilt para serviços;
use singleton apenas para valores puros e fábricas pequenas.

## Coroutines e Flow

- `suspend` suspende a coroutine sem bloquear uma thread; é o equivalente
  assíncrono mais seguro de um `CompletableFuture`, não uma thread nova.
- Use `viewModelScope` para trabalho ligado à tela e `withContext(Dispatchers.IO)`
  para I/O quando a biblioteca não já troca de dispatcher. Cancelamento é
  estruturado: não lance `GlobalScope` e não crie jobs órfãos.
- Exponha `StateFlow<UiState>` e construa-o com `stateIn(viewModelScope,
  SharingStarted.WhileSubscribed(5_000), initial)`. A tela coleta com
  `collectAsStateWithLifecycle()`.
- Eventos de uso único (navegar, toast, logout) saem por `Channel<UiEvent>` e
  `receiveAsFlow()`, não por um booleano dentro do estado persistente.
- Teste suspensões com `runTest`; teste emissões com Turbine:

```kotlin
runTest {
    viewModel.events.test {
        viewModel.onSave()
        assertIs<UiEvent.Saved>(awaitItem())
        cancelAndIgnoreRemainingEvents()
    }
}
```

## Compose

Pense em `UI = f(estado)`: uma Composable recebe estado e callbacks e descreve
o resultado. Recomposição reexecuta funções; não faça I/O ou mutação arbitrária
no corpo.

- `remember` preserva estado apenas durante a composição; `rememberSaveable`
  sobrevive recriação simples. Estado de negócio deve estar no ViewModel.
- Faça state hoisting: `TextField(value, onValueChange)` recebe o valor, e o
  pai decide onde guardá-lo.
- `LaunchedEffect(key)` executa trabalho suspenso quando a chave muda;
  `DisposableEffect(key)` registre e remova listeners no cleanup.
- Use `collectAsStateWithLifecycle`, nunca uma coleta contínua desligada do
  ciclo de vida.
- Use `@Preview` com estado fake e `BraidTheme`; não acople preview ao backend.
- Todas as cores, fontes e espaçamentos visíveis vêm de `core/designsystem`.

## Padrões do projeto

```kotlin
sealed interface UiState<out T> {
    data object Loading : UiState<Nothing>
    data class Content<T>(val value: T) : UiState<T>
    data class Error(val error: ApiError) : UiState<Nothing>
}
```

Mapeie respostas HTTP para `ApiError` preservando o status e o código do
backend (`401`, `403`, `409`, `429`, `5xx` e erro de rede). A UI decide o texto
e a ação; o repositório não exibe Toast. Use Hilt com `@Inject constructor`,
`@HiltViewModel` e módulos por camada; não instancie Retrofit dentro de uma
Composable.

## Procedimento: portar uma tela do web

1. Ache a tela na tabela de `docs/mobile-parity.md` e leia o JSX, CSS e hooks
   correspondentes em `apps/web`.
2. Liste cada `useState`, hook e transição. Modele isso como `UiState` e ações
   do ViewModel; diferencie estado persistente de evento único.
3. Confirme endpoint, autenticação e DTO em `packages/contracts`; adicione ou
   regenere fixture antes de criar um modelo Kotlin novo.
4. Monte a Route que coleta o ViewModel e uma Screen pura. Use apenas tokens de
   `core/designsystem`, incluindo `BraidTheme`, `BraidTypography` e `tagColors`.
5. Adapte navegação, back, teclado e gestos ao Android sem alterar o contrato
   do backend. Compare lado a lado no viewport mobile do web.
6. Atualize `docs/mobile-parity.md` na mesma mudança e acrescente teste de
   estado, contrato ou Compose conforme o risco.

Exemplo rápido: para portar `apps/web/src/components/events/MissedBadge.tsx`,
confirme em `event-visuals.ts` o texto e a classe visual, mantenha
`missed = false` ou ausente como ausência de UI, use `MaterialTheme`/tokens para
o chip quando `missed = true`, passe a decisão pelo estado do cartão e teste as
duas ramificações. Depois registre a linha de selo na tabela de paridade.

## Rodar, testar e depurar

Sempre a partir da raiz:

```bash
pnpm dev:mobile                 # adb reverse + installDebug + abre o app
pnpm --filter @repo/mobile run generate:theme
pnpm --filter @repo/mobile run lint
pnpm --filter @repo/mobile run test
```

Se a API/auth estiverem locais, confirme um dispositivo ou emulador no `adb
devices`; `scripts/mobile/dev.sh` configura `adb reverse` para as portas
`API_PORT` e `AUTH_PORT`. Para um teste específico:

```bash
./gradlew testDebugUnitTest --tests '*ContractFixturesTest*'
adb logcat --pid="$(adb shell pidof app.braid.mobile)"
```

Use Layout Inspector e Compose previews para layout, Logcat para ciclo de vida
e rede, e confira o APK debug quando a mudança tocar manifest ou recursos.

## Armadilhas comuns

- Trabalho pesado, JSON ou banco no Main dispatcher.
- Coletar Flow fora do lifecycle ou lançar `GlobalScope`.
- `!!` para mascarar contrato incompleto.
- Estado de tela dentro da Composable quando precisa sobreviver navegação.
- Cor, fonte ou padding hardcoded em vez dos tokens.
- DTO de rede usado diretamente na UI, sem mapeamento para domínio.
- `ignoreUnknownKeys = true` nos testes: produção pode tolerar campo novo, o
  teste de contrato não.
- Esquecer `adb reverse`, fixture, atualização de `mobile-parity.md` ou o
  `ktlintCheck` ao concluir uma tela.

---

## Skill: `running-tests` — `.agents/skills/running-tests/SKILL.md`

---
name: running-tests
description: Run and diagnose this monorepo's Vitest and Playwright tests, including workspace and file filters.
---

# Running tests

Run commands from the repository root. During normal feature development, use
the quiet unit-test command:

```bash
pnpm run --silent test:unit:ai
```

`test:ai` is an alias for the same unit-test suite. Integration tests and E2E
tests should run only after the corresponding flow is integrated.

## Test commands

```bash
pnpm test:unit                                  # full unit-test output
pnpm run --silent test:unit:ai -- path/to/test  # one unit-test file
pnpm run --silent test:integration:ai -- --project api-integration
pnpm test:e2e                                   # full Playwright output
```

Use `test:integration` for API/Auth integration tests and `test:e2e` for the
full Web → Auth → API flow.

The quiet reporter prints `Tests pass` on success. On failure, it prints the
first failing test and the total number of failures; use the full-output
commands above when more context is needed.

## Workspace behavior

`vitest.workspace.ts` resolves `@repo/*` packages directly from TypeScript
source, so unit tests do not require a build first. Unit-test workspaces are:
`web`, `mobile`, `api`, `auth`, `contracts`, `timeline`, and `theme`.

The `mobile` workspace runs in Node and includes only `*.test.ts`; React Native
component rendering requires a native runtime and is not supported by this
Vitest setup.

When a test fails, first rerun the narrowest relevant file or workspace with
full output. Fix the underlying failure instead of weakening or skipping the
test.

---

## Skill: `typesafe-ai` — `.agents/skills/typesafe-ai/SKILL.md`

---
name: typesafe-ai
license: MIT
description: >
  Build AI-powered software with TypeSafe: small units of AI intelligence you
  can use like programming primitives. Its System One models, including Jev,
  turn natural language and application state into typed judgments and
  probabilities that code can combine. Use when a feature needs programmable
  common sense, when brainstorming what AI could make possible in an app, or
  when an LLM prompt-and-parse step could become a structured decision.
  Applications include routing, ranking, extraction, verification, and
  interactive experiences; these are starting points, not the limits.
  Read live docs and cookbooks to find useful patterns and discover new combinations.
---

# Build with TypeSafe

TypeSafe makes units of AI intelligence usable like programming primitives: small
judgments you can compose into larger capabilities. Its **System One models** return
fast, focused judgments that software can consume directly. **Jev** is TypeSafe's
flagship and first System One model. It understands natural language and returns
typed answers and probabilities rather
than generating text or reasoning explanations. Code owns the workflow; the model
supplies programmable common sense where ordinary code needs semantic understanding.

## Read the live docs

**The live TypeSafe docs are the source of truth. Read them as part of the task.**
This skill gives direction; the docs carry current concepts, prompting guidance,
API contracts, SDK usage, models, limits, and worked examples.

- Start with the [documentation index](https://docs.typesafe.ai/llms.txt) to discover
  relevant pages and cookbooks. Use targeted reads rather than loading the entire site.
- Mintlify serves Markdown by appending `.md` to a page path, for example
  [how to build with TypeSafe](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md).
  Follow links from the index; convert extensionless documentation page links to
  `.md` when useful. Resolve relative links against `https://docs.typesafe.ai`.
- Before writing an integration, read the current API or chosen SDK page and the
  question guidance relevant to the design. For a new workflow, also inspect the
  closest cookbook: it often shows a better decomposition than a generic classifier.
- If the index is unavailable, use the direct links below or the site's navigation.
  If Markdown fetching fails, try the normal page. If live access is unavailable,
  use available local docs or installed SDK types, state that limitation, and avoid
  inventing version-dependent details.

| Task | Start here; follow the relevant details |
| --- | --- |
| Understand the programming model | [System One](https://docs.typesafe.ai/concepts/system-one.md), [building guide](https://docs.typesafe.ai/concepts/how-to-build-with-system-one.md) |
| Explore what to build | [Use-case map](https://docs.typesafe.ai/concepts/use-case-map.md), then relevant cookbooks from the index |
| Prepare inputs and questions | [State](https://docs.typesafe.ai/concepts/state.md), [primitives](https://docs.typesafe.ai/primitives.md), then the chosen primitive's page |
| Decide how to handle uncertainty | [Confidence](https://docs.typesafe.ai/confidence.md) |
| Write API code | [HTTP API](https://docs.typesafe.ai/api.md), [Python SDK](https://docs.typesafe.ai/sdk/python.md), or [JavaScript SDK](https://docs.typesafe.ai/sdk/javascript.md) |
| Update an older integration | [Migration guide](https://docs.typesafe.ai/migrating-to-v1.md) and the installed SDK's current reference |

## Find the useful shape

Start from the behavior the user wants: what will the application show, select,
change, or hand off? Work backward to the judgments it needs. Keep known rules,
calculations, exact lookups, and execution in code. Preserve the user's chosen stack
and scope; add TypeSafe where semantic understanding helps.

When brainstorming or choosing an architecture, consider more than classification.
The patterns below are starting points: combine primitives around the user's goal,
including ideas that do not fit an established recipe.

- **Route and fill known arguments.** A request can select a handler and its typed
  parameters. Ask useful branch-specific questions up front and consume only the
  relevant answers. Explore [function calling](https://docs.typesafe.ai/cookbooks/function_calling.md)
  and [speculative fan-out](https://docs.typesafe.ai/patterns/fan-out.md).
- **Select instead of generate.** Find candidate values or source spans in code,
  use a judgment to select the intended one, then copy or normalize it. Code can
  also assemble source text into a formatted document or reading guide. Explore
  [value extraction](https://docs.typesafe.ai/cookbooks/pre_parsed_value_extraction_cookbook.md)
  and [structure recovery](https://docs.typesafe.ai/cookbooks/autoformat.md).
- **Find and judge evidence.** Retrieve candidates, compare their relevance to a
  query, and select useful context. Explore
  [reranking](https://docs.typesafe.ai/cookbooks/rerank_typesafe.md)
  and [hierarchical classification](https://docs.typesafe.ai/cookbooks/hierarchical_classification.md).
- **Turn judgments into reusable data.** Score dimensions once, then let code or
  user controls change weights, thresholds, rankings, and views. With labeled
  outcomes, those signals can become classical ML features. Explore
  [composite scoring](https://docs.typesafe.ai/patterns/composite-scoring.md) and
  [feature discovery](https://docs.typesafe.ai/cookbooks/autoresearch_feature_discovery.md).
- **Verify and escalate.** Check specific claims or fields against their evidence;
  send uncertain or failing cases to a person or reasoning model. Explore
  [citation checks](https://docs.typesafe.ai/cookbooks/citation_check.md) and
  [extraction cascades](https://docs.typesafe.ai/cookbooks/sde_cascade.md).
- **Respond to changing state.** Code can retain goals and observations while fresh
  judgments guide the next bounded step. Keep inferred state distinct from observed
  facts, and check freshness before applying a result to a changed situation.

For open-ended requests, offer the few directions that best serve the user's goal
and recommend a starting point. For a concrete request, choose the relevant pattern
and build; a brainstorm is not a mandatory detour.

## Design the judgments

Choose by what the answer means, then read the relevant primitive page:

| Need | Primitive | Important distinction |
| --- | --- | --- |
| One of a defined set | [Choice](https://docs.typesafe.ai/primitives/choice.md) | Picks one option; its distribution compares competing options |
| Whether a condition holds | [Noul](https://docs.typesafe.ai/primitives/noul.md) | Probability of yes; no separate confidence; use one per label when several may apply |
| Degree along a described dimension | [Score](https://docs.typesafe.ai/primitives/score.md) | Probability-weighted position on ordered levels; use comparable per-item Scores for graded ranking |

Give each question enough relevant **state** to answer: source text, identities,
relationships, policies, and current facts. Prefer named JSON fields when context
has several parts. Put the judgment in **instructions** and define its possible
answers in **criteria**. Question IDs are for code and are not sent to the model;
include complete meaning in the question. Reference nested state with backticked
paths such as `ticket.messages[0].text`.

Ask one narrow, coherent judgment per question. Split independently useful dimensions,
without destroying the relationship being judged. A bounded action selection or
contextual interpretation is valid; atomic does not mean literal fact extraction
or a one-sentence limit. Strings work for simple questions. Use structured objects
or arrays when definitions, contrasts, exclusions, or examples clarify instructions
or criteria. Score levels must describe concrete situations and stand on their own.

Keep the needed answers available. Include a no-match outcome when nothing may fit;
use a separate presence judgment when it is independently useful. For source-value
selection, check candidate coverage: the model cannot choose an omitted value.

## Compose and verify

**Ask independent questions over the same state together**, including useful
speculative questions. They run in parallel and cannot see one another's answers.
A second request is warranted when an earlier answer is needed to fetch evidence,
construct new state, or determine the next options. Extra questions still use tokens;
measure actual request budgets, cost, and end-to-end latency.

Use probabilities and confidence to guide behavior, with thresholds evaluated on the
user's data and consequences. Choice/Score confidence summarizes distribution
concentration, not overall workflow correctness or permission to act. A Noul near
0.5 means similar probability for yes and no, not medium intensity. Several
acceptable alternatives can also spread probability; low confidence need not
invalidate a harmless preference choice. Ignore uncertainty on unused branches.

Keep policy explicit and raw judgments reusable. Weighted scores suit compensating
preferences; an “any serious violation” rule needs separate conditions. Changing a
weight or display filter need not rerun inference when evidence and question meanings
are unchanged. Typed output guarantees the interface, not truth. System One models
are trained for calibrated decisions; validate their performance in the target domain.

Test representative cases and the resulting application behavior. For failures,
inspect the exact state, questions, candidates, answers, composition, and observed
outcome. Separate missing evidence, model errors, code errors, and service failures.
Treat cookbook thresholds and demo results as examples to evaluate, not universal
rules or permanent model limitations. Keep API credentials server-side in web apps.

---

## Skill: `worktree-app-testing` — `.agents/skills/worktree-app-testing/SKILL.md`

---
name: worktree-app-testing
description: >
  Sobe web/api/auth de verdade, com portas e banco Postgres isolados da
  worktree atual, para validar uma mudanca manualmente (curl, Browser pane,
  screenshots) em vez de so rodar a suite de testes unitarios. Use sempre que
  for testar uma mudanca rodando a aplicacao de fato neste monorepo,
  especialmente quando varias worktrees/agentes podem estar rodando a app em
  paralelo. Nao use para os testes unitarios do dia a dia (`test:ai`) nem para
  o teste de integracao Postgres do @repo/persistence, que ja isola porta
  sozinho via Testcontainers.
---

## Por que isto existe

Este monorepo tem um unico `.env`/`.env.local` na raiz e, por padrao, portas
fixas (web 3000, api 3001, auth 3002, Postgres 54391). Se varias worktrees
rodarem a app ao mesmo tempo sem isolamento, uma pisa na porta e no banco da
outra. `scripts/worktree/` resolve isso: cada worktree ganha seu proprio
`.env.local` com portas livres calculadas na hora, bases proprias para a API
(`<worktree>`) e para o Auth (`<worktree>_auth`) dentro do Postgres
compartilhado (porta 54391) e o dominio `<worktree>.braid.local` (Caddy,
HTTPS na porta 8443). A fila de jobs de IA e a tabela `jobs` da base da API, entao ja
nasce isolada por worktree.

## Passo a passo

1. **Confirme se a worktree atual ja esta provisionada.** Rode:
   ```bash
   grep -q COMPOSE_PROJECT_NAME .env.local 2>/dev/null && echo provisionada || echo nao-provisionada
   ```
   Se `nao-provisionada`, rode `bash scripts/worktree/provision-env.sh` (ou
   `pnpm worktree:provision`) de dentro da worktree. Isso gera o
   `.env.local`, cria as bases da worktree, roda as migrations, cria o
   admin `admin@admin.com`, builda os pacotes e sobe web/api/auth. Leva um tempo na primeira vez — normal.
   Se voce esta na worktree principal do checkout (a original, nao uma criada
   com `git worktree add`), o script se recusa a rodar de proposito: a
   principal e gerenciada manualmente pelo desenvolvedor, nao por este
   sistema. Nesse caso so use as portas/banco que ja estao configurados la.

2. **Leia as portas desta worktree** direto do `.env.local`:
   ```bash
   grep -E '^(WEB_PORT|API_PORT|AUTH_PORT|POSTGRES_HOST_PORT)=' .env.local
   ```

3. **Suba so o que o teste precisa**, nunca a stack inteira por reflexo.
   Rodando de dentro desta worktree:
   - Mudanca so no frontend que ja tem os dados que precisa: `pnpm dev:web`.
   - Mudanca de API/regra de negocio: `pnpm dev:api` (+ `pnpm dev:web` se o
     teste passa pelo browser).
   - Mudanca que envolve login/sessao/MFA: adicione `pnpm dev:auth`.
   - So use `pnpm dev` (os tres) quando o teste realmente cruza os tres.

   Rode cada comando via Bash com `run_in_background: true` — sao processos
   longos. Depois de rodar, `Bash` com `curl -fsS http://127.0.0.1:$API_PORT/...`
   (ou o health check do servico) e um jeito rapido de confirmar que subiu
   antes de ir para o browser.

4. **Abra o preview na porta certa desta worktree**, lendo a porta calculada do
   `.env.local`. Não use configurações fixas de outro agente, porque elas não
   conhecem a porta desta worktree. Use:
   ```
   preview_start({ url: "http://localhost:<WEB_PORT-desta-worktree>" })
   ```
   Se o teste for so de API, `curl`/`read_network_requests` bastam, sem
   precisar abrir o browser.

5. **Valide de verdade**, nao so "carregou sem erro":
   - Rede: `read_network_requests` para checar status code e payload das
     chamadas relevantes.
   - Console: `read_console_messages` para erros de runtime.
   - Estado da pagina: `read_page`/`get_page_text` em vez de confiar so em
     screenshot.
   - Fluxo completo: use `computer` (clique/type) para reproduzir o caminho
     que a mudanca afeta, nao so a tela inicial.

6. **Ao terminar**, encerre os processos de dev que voce subiu em background
   (as bases da worktree ficam; isso e normal entre sessoes). Só rode
   `pnpm worktree:teardown <caminho>` quando for remover a worktree de vez —
   isso apaga as bases dela.

## O que nao fazer

- Nao rode `scripts/worktree/provision-env.sh` na worktree principal sem
  motivo forte — ela nao foi feita para isso e o script bloqueia por padrao.
- Nao assuma as portas 3000/3001/3002/54391 dentro de uma worktree secundaria
  — elas so valem no checkout principal. Leia sempre do `.env.local` local.
- Nao confunda isto com os testes automatizados (`npm run --silent test:ai`)
  — aquilo continua sendo a forma de rodar a suite Vitest; esta skill e para
  quando o pedido e efetivamente ligar a aplicacao e olhar o comportamento.
