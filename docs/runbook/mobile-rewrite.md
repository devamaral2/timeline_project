# Runbook — Reescrita do app mobile em Kotlin nativo

> **Status:** planejado · **Criado em:** 2026-09-24 · **Dono:** Rafael Amaral
> **Projeto no Linear:** [Braid Mobile — Reescrita nativa (Kotlin)](https://linear.app/rafaelavelarprojects/project/braid-mobile-reescrita-nativa-kotlin-7df841270646) (P-RAF-13, issues RAF-144 a RAF-178)

Este runbook substitui o app Expo em `apps/mobile` por um app **Android nativo em
Kotlin + Jetpack Compose** que **repercute o web de hoje**. Ele é a fonte de
verdade da reescrita: cada issue do Linear aponta para uma seção daqui, e cada
fase termina com o checklist de paridade (`docs/mobile-parity.md`) atualizado.

---

## 1. Decisões

| Tema | Decisão |
|---|---|
| Plataforma | Só Android. Kotlin + Jetpack Compose. `minSdk 26`, `targetSdk`/`compileSdk` na última versão estável. |
| Fidelidade ao web | O app tem as mesmas funcionalidades e a mesma identidade visual do web na largura mobile (`AgendaPreview`, em `apps/web/src/app/mockups/eventos/`). Navegação e gestos seguem o padrão Android: voltar do sistema, bottom sheets, swipe entre dias. |
| Escopo v1 | Login/sessão, agenda, detalhe, criar, editar por tipo, excluir, evento por voz, lembretes e chat com o agente. **Fora da v1:** aceite de convite (continua no web, vem de link de e-mail) e "ver como convidado". |
| Backend | Os **mesmos endpoints do web**, sem mudança no backend. `apps/api` com `Authorization: Bearer`, `apps/auth` direto para login, refresh, logout e `me`. |
| Ambientes | Até a v1, **só backend local**. O build `release` aponta para produção, mas só é usado depois da v1. |
| App atual | É apagado por completo. Ele não foi publicado, e o histórico do git guarda o código. |
| Paridade contínua | Regra no `AGENTS.md` + `docs/mobile-parity.md`. |
| Monorepo | Projeto Gradle em `apps/mobile` com um `package.json` fino que chama o `./gradlew`. O app fica fora do `pnpm dev` e sobe com `pnpm dev:mobile`. |
| Contratos | DTOs `@Serializable` escritos à mão, espelhando `packages/contracts`, validados por **testes de fixtures** geradas a partir dos schemas Zod. |
| Stack | Retrofit + OkHttp (refresh via `Authenticator`, WebSocket do OkHttp para o chat), kotlinx.serialization, Hilt, Navigation Compose com rotas tipadas, MVVM (`ViewModel` + `StateFlow<UiState>`), DataStore com criptografia via Android Keystore, sem Room, um módulo Gradle só. |
| Tema | Gerador `packages/theme` → Kotlin (`Color.kt`), rodando no build. |
| Lembretes | `AlarmManager` exato, com fallback para inexato se a permissão for negada. Reagendados a cada sincronização. |
| Skill | `.agents/skills/kotlin-android/`, com seções didáticas para quem vem do Java. |
| Qualidade | JUnit + MockK + Turbine. Testes de UI em Compose só nos fluxos críticos. Job de CI próprio, filtrado por caminho. APK instalado por `adb` ou baixado do artifact do CI. |

### Por que Kotlin nativo, e o que perdemos

O app Expo compartilhava `@repo/contracts`, `@repo/timeline` e `@repo/theme`
direto com o web. No Kotlin isso não é possível: o que era import vira
**espelhamento verificado**. Cada pacote tem sua estratégia:

| Pacote TS | Como chega ao Kotlin |
|---|---|
| `packages/contracts` (Zod) | DTOs à mão + testes de fixtures (Fase 1.4) |
| `packages/theme` | Gerador de código (Fase 1.3). `hueForTag`/`tagColors` são portados à mão, com teste de fixtures. |
| `packages/timeline` (janelas de data, agrupamento) | Port à mão para `domain/timeline/`, com testes de fixtures geradas pelas funções TS |

Regra geral: **toda lógica portada à mão tem teste de fixtures geradas pelo
código TS**. Se o TS mudar e o Kotlin não acompanhar, o teste do Kotlin quebra.

---

## 2. Fatos do sistema atual (levantados em 2026-09-24)

**Como o web fala com o backend.** O navegador chama `/api/*` na mesma origem.
O `apps/web/src/proxy.ts` transforma o cookie httpOnly em `Authorization: Bearer`,
e o `authedFetch` renova a sessão uma vez quando recebe 401. O app mobile não
tem o Next no meio, então:

- fala com o **`apps/auth`** direto: `POST /auth/login {email,password}` →
  `{accessToken, refreshToken}`, `POST /auth/token/refresh {refreshToken}`,
  `POST /auth/logout {refreshToken}` (idempotente, 204), `GET /auth/me` → `{userId,name,email}`;
- fala com o **`apps/api`** direto, com bearer, nos mesmos caminhos que o web usa.

**Endpoints usados pelo web** (o mobile precisa cobrir todos):

| Uso | Método e caminho |
|---|---|
| Timeline do dia/janela | `GET /api/events?from=…&…` → `TimelineEventPageDto` |
| Detalhe | `GET /api/events/{id}` → `EventDetailDto` |
| Criar | `POST /api/events` |
| Editar | `PATCH /api/events/{id}` (204) |
| Excluir | `DELETE /api/events/{id}` (204) |
| Evento por voz | `POST /api/events/voice` (transcrição) |
| Sugestão de tag | `GET /api/tags?query=…&limit=6` |
| Chat: ticket | `POST /api/ai/chat/tickets` → `AgentChatTicketDto` |
| Chat: socket | WebSocket `/api/ai/chat` (frames `AgentChatServerFrame`/`AgentChatMessageFrame`) |
| Chat: conversas | `GET /api/ai/conversations`, `GET …/{id}/messages`, `DELETE …/{id}` |

A documentação interativa fica em `http://localhost:<API_PORT>/docs` (spec em
`/openapi.json`) e no Auth. **Antes de portar cada tela, confirme o endpoint no
componente web correspondente**, porque o web é a referência.

**Onde está cada coisa no web:**

| Funcionalidade | Onde olhar |
|---|---|
| Shell, agenda, navegação mobile | `apps/web/src/app/mockups/eventos/` (`agenda-preview.tsx`, `mockup-shell.tsx`, `mobile-navigation.tsx`, `agenda-day.tsx`, `agenda-header-actions.tsx`) |
| Semana, seletor de dia, cards | `apps/web/src/components/events/` (`WeekStrip`, `DayPicker`, `DateNavigator`, `EventCard`, `MissedBadge`, `TimelineList`, `DaySkeleton`) |
| Detalhe | `apps/web/src/app/[userId]/eventos/[eventId]/page.tsx`, `EventDetailsModal.tsx` |
| Criar/editar | `event-schedule-fields.tsx`, `task-controls.tsx`, `components/events/new-event-forms/*`, `edit-event-forms/{Meal,Routine,Sleep,Training}EditForm.tsx`, `EditEventModal.tsx` |
| Excluir | `DeleteEventDialog.tsx` |
| Voz | `VoiceEventButton.tsx`, `VoiceJobStatus.tsx`, `lib/voice-events/use-voice-event-queue.ts`, `lib/speech/*` |
| Lembretes | `lib/events/use-due-notifications.ts`, `packages/contracts/src/notifications` |
| Chat | `agent-chat-panel.tsx`, `lib/agent-chat/*` |
| Login | `components/auth/LoginForm.tsx`, `SessionButton.tsx` |
| Marca | `components/brand/Logo.tsx`; fontes Manrope e Outfit em `mockups/eventos/_assets/` |

---

## 3. Convenções de execução

- Cada fase é uma **milestone** no Linear, e cada issue vira **um PR**.
- Branch: `mobile/<fase>-<slug>` (ex.: `mobile/3-week-strip`). Use `pnpm worktree:new` para trabalhar isolado.
- **Definição de pronto de toda issue** (além dos critérios específicos dela):
  1. `pnpm --filter @repo/mobile run lint` e `pnpm --filter @repo/mobile run test` verdes.
  2. Rodou no aparelho ou no emulador contra o backend local, comparado lado a lado com o web aberto em largura mobile (DevTools, 390×844).
  3. `docs/mobile-parity.md` atualizado.
  4. Screenshot do app e do web no PR.
- **Sempre consultar a skill `kotlin-android`** antes de implementar, depois que ela existir (Fase 1).

---

## Fase 0 — Remover o app Expo e instalar a regra de paridade

**Objetivo:** o repo fica sem nenhum rastro do app Expo, e a regra de paridade
passa a valer.

### 0.1 Apagar `apps/mobile` e limpar as referências

```bash
git rm -r apps/mobile
```

Limpe cada referência (levantadas com `git grep -n "apps/mobile\|@repo/mobile\|dev:mobile\|MOBILE_"`):

| Arquivo | Ação |
|---|---|
| `package.json` (raiz) | Remover o script `dev:mobile`. Ele volta na Fase 1 apontando para o Gradle. |
| `vitest.workspace.ts` | Remover o projeto `mobile`. |
| `turbo.json` | Remover `MOBILE_GOOGLE_WEB_CLIENT_ID` e `METRO_PORT` do `globalEnv`. `MOBILE_API_URL` também sai: o Kotlin lê do `local.properties`/`BuildConfig`, não do turbo. |
| `.env.example`, `env.tmpl`, `scripts/onepassword/loader.mjs` | Remover `MOBILE_API_URL`, `MOBILE_AUTH_URL` e `MOBILE_GOOGLE_WEB_CLIENT_ID`. |
| `scripts/worktree/provision-env.sh` | Remover o bloco que reescreve `MOBILE_API_URL`. |
| `.dockerignore` | Trocar `apps/mobile/android` e `apps/mobile/ios` por `apps/mobile` inteiro (o Docker nunca precisa do app). |
| `README.md` | Remover a seção do Expo e deixar um ponteiro: "app Android em reescrita — ver `docs/runbook/mobile-rewrite.md`". |
| `AGENTS.md` | Mudar a descrição de `apps/mobile` para "app Android nativo (Kotlin + Compose) que repercute o web". |
| `.agents/skills/install-dependencies/SKILL.md` | Remover `@repo/mobile` dos filtros de exemplo. |
| `docs/runbook/deploy-k3s.md` (linha ~1287) | Atualizar a menção ao `MOBILE_API_URL` para o `BuildConfig` do app Kotlin. |
| `apps/web/src/components/brand/Logo.tsx` | Tirar o comentário que aponta para o `Logo.tsx` do mobile. |
| `packages/theme/src/tokens.ts` | Tirar a menção a `apps/mobile/src/lib/theme/use-theme.ts`. |

Depois rode `pnpm install` (atualiza o `pnpm-lock.yaml`) e confira:

```bash
git grep -n "expo\|@repo/mobile\|apps/mobile/src" -- ':!pnpm-lock.yaml' ':!docs/runbook'
pnpm typecheck && pnpm run --silent test:unit:ai && pnpm exec turbo run build
```

**Pronto quando:** o grep volta vazio (ou só com menções intencionais) e os três comandos passam.

### 0.2 Regra de paridade no `AGENTS.md`

Adicione ao `AGENTS.md` da raiz:

```markdown
## Paridade web ↔ mobile

O app Android (`apps/mobile`) repercute a experiência mobile do web (`apps/web`).
Toda mudança visível ao usuário em `apps/web` — tela, fluxo, campo, texto, cor
ou comportamento — precisa da mudança equivalente em `apps/mobile`, no mesmo PR
ou num PR vinculado, e de uma linha atualizada em `docs/mobile-parity.md`.
Mudanças em `packages/contracts` ou `packages/theme` exigem rodar os testes de
contrato do mobile (`pnpm --filter @repo/mobile run test`).
```

### 0.3 Criar `docs/mobile-parity.md`

Uma linha por tela ou funcionalidade. Status: `—` (não existe), `🚧` (em
progresso), `✅` (paridade), `≠` (divergência intencional, com o motivo).

```markdown
# Paridade web ↔ mobile

| Área | Funcionalidade | Web (referência) | Mobile | Observação |
|---|---|---|---|---|
| Sessão | Login | `components/auth/LoginForm.tsx` | — | |
| Sessão | Refresh automático no 401 | `lib/api/authed-fetch.ts` | — | |
| Sessão | Logout | `components/auth/SessionButton.tsx` | — | |
| Agenda | Tira da semana | `components/events/WeekStrip.tsx` | — | |
| Agenda | Seletor de dia / navegação | `DayPicker.tsx`, `DateNavigator.tsx` | — | |
| Agenda | Timeline do dia | `mockups/eventos/agenda-day.tsx` | — | |
| Agenda | Card de evento + visuais por tipo | `EventCard.tsx`, `event-visuals.ts` | — | |
| Agenda | Badge "atrasado" | `MissedBadge.tsx` | — | |
| Agenda | Skeleton de carregamento | `DaySkeleton.tsx` | — | |
| Agenda | Tarefas/subtarefas no card | `mockups/eventos/task-controls.tsx` | — | |
| Detalhe | Tela de detalhe | `[userId]/eventos/[eventId]/page.tsx` | — | |
| Edição | Criar evento | `new-event-forms/*`, `event-schedule-fields.tsx` | — | |
| Edição | Tags com sugestão | `new-event-forms/TagInput.tsx` | — | |
| Edição | Editar refeição | `edit-event-forms/MealEditForm.tsx` | — | |
| Edição | Editar rotina | `edit-event-forms/RoutineEditForm.tsx` | — | |
| Edição | Editar sono | `edit-event-forms/SleepEditForm.tsx` | — | |
| Edição | Editar treino | `edit-event-forms/TrainingEditForm.tsx` | — | |
| Edição | Excluir | `DeleteEventDialog.tsx` | — | |
| Voz | Botão + reconhecimento | `VoiceEventButton.tsx`, `lib/speech/*` | — | |
| Voz | Fila e status | `VoiceJobStatus.tsx`, `lib/voice-events/*` | — | |
| Lembretes | Aviso no horário | `lib/events/use-due-notifications.ts` | — | ≠ esperado: no Android dispara com o app fechado |
| Chat | Painel do agente | `mockups/eventos/agent-chat-panel.tsx` | — | |
| Chat | Histórico de conversas | `lib/agent-chat/use-agent-conversations.ts` | — | |
| Marca | Logo, fontes, cores | `brand/Logo.tsx`, `packages/theme` | — | |
| Fora da v1 | Aceite de convite | `convites/aceitar` | ≠ | Só web (link de e-mail) |
| Fora da v1 | Ver como convidado | `layout/ViewAsGuestButton.tsx` | ≠ | Depois da v1 |
```

**Pronto quando:** o PR da Fase 0 está mergeado com as três partes.

---

## Fase 1 — Fundação: scaffold, integração, tema, contratos e skill

### 1.1 Scaffold do projeto Gradle

Pré-requisitos na máquina: **JDK 21** (Temurin), **Android Studio** (SDK e
emulador) e `ANDROID_HOME` definido.

Crie o projeto pelo Android Studio (*Empty Activity — Compose*) **dentro de
`apps/mobile`**, com:

- **Package/applicationId:** `app.braid.mobile` (ajuste se você tiver domínio próprio).
- **Build:** Kotlin DSL (`build.gradle.kts`) + **version catalog** (`gradle/libs.versions.toml`).
- **SDK:** `minSdk = 26`, `targetSdk`/`compileSdk` = último estável.

Estrutura-alvo:

```
apps/mobile/
├── package.json                 # wrapper pnpm (1.2)
├── settings.gradle.kts
├── build.gradle.kts
├── gradle/libs.versions.toml
├── gradlew, gradle/wrapper/
├── local.properties             # NÃO versionar (sdk.dir, URLs de dev)
└── app/
    ├── build.gradle.kts
    └── src/
        ├── main/
        │   ├── AndroidManifest.xml
        │   ├── res/font/        # manrope.ttf, outfit.ttf (copiados do web)
        │   └── java/app/braid/mobile/
        │       ├── BraidApp.kt              # @HiltAndroidApp
        │       ├── MainActivity.kt          # setContent { BraidTheme { AppNavHost() } }
        │       ├── core/
        │       │   ├── network/             # OkHttp, Retrofit, AuthInterceptor, TokenAuthenticator
        │       │   ├── session/             # TokenStore (DataStore+Keystore), SessionRepository
        │       │   ├── designsystem/        # Color.kt (gerado), Type.kt, Theme.kt, componentes base
        │       │   └── di/                  # módulos Hilt
        │       ├── data/
        │       │   ├── dto/                 # espelho de packages/contracts
        │       │   ├── api/                 # interfaces Retrofit (EventsApi, TagsApi, AgentApi, AuthApi)
        │       │   └── repository/          # EventRepository, TagRepository, AgentChatRepository…
        │       ├── domain/
        │       │   ├── model/               # modelos que a UI consome (desacoplados do DTO)
        │       │   └── timeline/            # port de packages/timeline
        │       └── ui/
        │           ├── navigation/          # rotas @Serializable + AppNavHost
        │           ├── login/
        │           ├── agenda/
        │           ├── event/detail/
        │           ├── event/edit/
        │           ├── voice/
        │           └── chat/
        ├── test/                            # JUnit/MockK/Turbine + testes de contrato
        └── androidTest/                     # Compose UI tests (fluxos críticos)
```

Dependências no `libs.versions.toml`, sempre na última versão estável
(confira no Context7 ou na documentação oficial na hora):

- Compose BOM, `material3`, `activity-compose`, `lifecycle-viewmodel-compose`, `lifecycle-runtime-compose`
- `navigation-compose` (rotas tipadas com `@Serializable`)
- `hilt-android` + `hilt-compiler` (KSP) + `hilt-navigation-compose`
- `retrofit` + `converter-kotlinx-serialization`, `okhttp` + `logging-interceptor` (só no debug)
- `kotlinx-serialization-json`, `kotlinx-coroutines-android`, `kotlinx-datetime`
- `datastore-preferences` + `tink-android` (criptografia com chave no Keystore)
- Testes: `junit`, `mockk`, `turbine`, `kotlinx-coroutines-test`, `okhttp-mockwebserver`, `compose-ui-test-junit4`
- Qualidade: plugin `ktlint` (org.jlleitschuh.gradle.ktlint) e Android Lint

**URLs por build type** (`app/build.gradle.kts`):

```kotlin
buildTypes {
    debug {
        // Com `adb reverse tcp:<porta> tcp:<porta>`, localhost do aparelho = sua máquina.
        buildConfigField("String", "API_BASE_URL", "\"${localProp("braid.apiUrl", "http://localhost:3001")}\"")
        buildConfigField("String", "AUTH_BASE_URL", "\"${localProp("braid.authUrl", "http://localhost:3002")}\"")
    }
    release {
        buildConfigField("String", "API_BASE_URL", "\"https://api.SEUDOMINIO\"")
        buildConfigField("String", "AUTH_BASE_URL", "\"https://auth.SEUDOMINIO\"")
    }
}
```

As portas reais vêm do `.env` da worktree (`API_PORT`, `AUTH_PORT`). O
`local.properties` permite sobrescrever. No emulador, use `10.0.2.2` no lugar de
`localhost`. No debug, libere HTTP em claro **só para localhost/10.0.2.2** via
`network_security_config.xml`, nunca no release.

**Pronto quando:** `./gradlew assembleDebug` gera o APK e o app abre uma tela
vazia com o tema escuro.

### 1.2 Integração com pnpm e turbo

`apps/mobile/package.json`:

```json
{
  "name": "@repo/mobile",
  "private": true,
  "scripts": {
    "dev": "echo 'use pnpm dev:mobile' && exit 0",
    "android": "./gradlew installDebug && adb shell am start -n app.braid.mobile/.MainActivity",
    "lint": "./gradlew ktlintCheck lintDebug",
    "test": "./gradlew testDebugUnitTest",
    "build": "./gradlew assembleDebug",
    "generate:theme": "tsx ../../scripts/mobile/generate-theme.ts",
    "generate:fixtures": "tsx ../../scripts/mobile/generate-fixtures.ts"
  }
}
```

Na raiz:

- `package.json`: `"dev:mobile": "bash scripts/mobile/dev.sh"`. O script faz `adb reverse` nas portas do `.env` (`API_PORT`, `AUTH_PORT`) e roda `pnpm --filter @repo/mobile run android`.
- `turbo.json`: `outputs` de `build` inclui `app/build/outputs/**` para o mobile.
- **Não quebrar o CI atual:** o job `validate` do `ci.yml` roda `pnpm lint`/`turbo run build` numa máquina sem Android SDK. Adicione `--filter=!@repo/mobile` nesses passos. O mobile ganha job próprio na Fase 9.

**Pronto quando:** `pnpm --filter @repo/mobile run build` funciona da raiz, e
`pnpm dev:mobile` instala e abre o app no aparelho conectado.

### 1.3 Gerador de tema (`packages/theme` → Kotlin)

`scripts/mobile/generate-theme.ts`:

1. Importa `darkTokens`/`lightTokens` de `packages/theme/src/tokens.ts`.
2. Converte cada cor `oklch(...)` para ARGB hex (use `parseOklch` de `packages/theme/src/oklch.ts` + a conversão OKLCH → sRGB).
3. Escreve `apps/mobile/app/src/main/java/app/braid/mobile/core/designsystem/Color.kt` com o cabeçalho `// GERADO por scripts/mobile/generate-theme.ts — não edite`, com um `object DarkTokens`/`LightTokens` e um `darkColorScheme(...)`/`lightColorScheme(...)` do Material 3 mapeado.
4. O `Color.kt` gerado **é versionado**. Um teste Vitest em `packages/theme` gera o arquivo em memória e falha se ele divergir do que está no disco ("rode `pnpm --filter @repo/mobile run generate:theme`").

Faça também, à mão:

- `Type.kt`: Manrope/Outfit (copie os `.ttf` de `apps/web/src/app/mockups/eventos/_assets/` para `res/font/`) com a mesma escala do web.
- `TagColors.kt`: port de `hueForTag` e `tagColors` de `packages/theme/src/theme.ts`, com teste de fixtures (1.4).
- O app abre **no tema escuro**, como o web.

**Pronto quando:** mudar uma cor em `tokens.ts` sem regenerar faz o teste falhar,
e regenerar deixa o app com a cor nova.

### 1.4 Contratos: DTOs e testes de fixtures

`scripts/mobile/generate-fixtures.ts` gera JSON em
`apps/mobile/app/src/test/resources/fixtures/`:

- **Contratos:** para cada DTO usado pelo app (`TimelineEventPageDto`, `EventDetailDto`, payloads de criar/editar por tipo, `AgentChatTicketDto`, frames do chat, conversas, tags), um ou mais exemplos **validados pelo schema Zod** antes de gravar (`schema.parse(exemplo)`). Inclua casos com campos opcionais ausentes e todas as variantes de união discriminada (tipos de evento, frames).
- **Lógica:** entradas e saídas de `packages/timeline` (janelas de data, agrupamento por dia) e de `hueForTag`/`tagColors`.

No Kotlin:

- `data/dto/` com `@Serializable data class`, uma por DTO. Uniões discriminadas viram `sealed interface` com `@JsonClassDiscriminator`. KDoc aponta o arquivo TS de origem.
- `Json { ignoreUnknownKeys = false; explicitNulls = false }` **nos testes**, para detectar campo novo no contrato. Em produção, `ignoreUnknownKeys = true`.
- `ContractFixturesTest`: decodifica cada fixture, re-encoda e compara.
- `TimelineParityTest`, `TagColorsParityTest`: rodam o port Kotlin nas entradas e comparam com as saídas do TS.

CI (Fase 9): `generate:fixtures` roda antes dos testes Kotlin, então um contrato
alterado sem espelho quebra o build.

**Pronto quando:** os testes passam e, ao adicionar um campo obrigatório num
schema Zod, o `ContractFixturesTest` falha.

### 1.5 Skill `kotlin-android`

Crie `.agents/skills/kotlin-android/SKILL.md` (siga a skill
`mattpocock-skills:writing-for-agents` e valide com `pnpm agents:validate`).
Conteúdo mínimo, com **seções didáticas** para quem vem de Java intermediário:

1. **Quando usar:** qualquer mudança em `apps/mobile`.
2. **Mapa da arquitetura:** as camadas da seção 1.1, quem pode depender de quem (`ui → domain ← data`), e um exemplo de ponta a ponta (Retrofit → Repository → ViewModel → Composable) com código real do repo.
3. **Java → Kotlin (didático):** para cada tópico, o código Java que você escreveria, o equivalente em Kotlin e **por que** o Kotlin faz assim:
   - null-safety (`?`, `?.`, `?:`, `!!` e por que evitá-lo);
   - `val`/`var` e imutabilidade;
   - `data class` × POJO com equals/hashCode;
   - `sealed interface` + `when` exaustivo × enum/visitor;
   - extension functions × classes utilitárias estáticas;
   - lambdas, `let`/`apply`/`also`/`run`;
   - `object`/`companion object` × `static`.
4. **Coroutines e Flow (didático):** `suspend` × `CompletableFuture`/threads, `viewModelScope`, `Dispatchers.IO`, cancelamento estruturado, `StateFlow` × `LiveData`, `stateIn`, e como testar com `runTest` + Turbine.
5. **Compose (didático):** pensar em "UI = f(estado)", recomposição, `remember`/`rememberSaveable`, state hoisting, `LaunchedEffect`/`DisposableEffect`, `collectAsStateWithLifecycle`, previews.
6. **Padrões do projeto:** `UiState` como `data class` ou `sealed interface` (Loading/Content/Error), eventos únicos via `Channel`, erros de rede mapeados como no `ApiError` do web (status preservado), injeção com Hilt (`@HiltViewModel`, `@Inject constructor`, módulos).
7. **Procedimento "portar uma tela do web":**
   1. Ache o componente na tabela da seção 2 e leia o JSX e os hooks.
   2. Liste o estado (`useState`/hooks), vire um `UiState` e as ações do usuário, vire funções do ViewModel.
   3. Confirme os endpoints chamados e os DTOs.
   4. Monte o Composable usando só os tokens do `designsystem`, **nunca cor hardcoded**.
   5. Compare lado a lado com o web mobile, adapte a navegação e os gestos ao padrão Android.
   6. Atualize `docs/mobile-parity.md`.
8. **Rodar, testar e depurar:** `pnpm dev:mobile`, `adb reverse`, Logcat, Layout Inspector, `./gradlew testDebugUnitTest --tests '*X*'`.
9. **Armadilhas comuns:** trabalho pesado no main thread, coletar Flow fora do ciclo de vida, `!!`, estado dentro de Composable que deveria estar no ViewModel.

As skills são descobertas pelo diretório `.agents/skills/` (ver
`.agents/manifest.yaml`), então basta criar a pasta. Cite a skill no `AGENTS.md`
junto da regra de paridade.

**Pronto quando:** `pnpm agents:validate` passa e um agente, dado "porte o
`MissedBadge`", segue o procedimento 7 sem instrução extra.

---

## Fase 2 — Login e sessão

**Referência web:** `LoginForm.tsx`, `SessionButton.tsx`, `lib/session/*`, `lib/api/authed-fetch.ts`.

### 2.1 Armazenamento de tokens

- `TokenStore`: DataStore com o conteúdo cifrado por Tink, chave no Android Keystore. Guarda `accessToken` e `refreshToken`.
- `SessionRepository`: expõe `StateFlow<SessionState>` (`Unknown`, `SignedOut`, `SignedIn(user)`).

### 2.2 Cliente de auth e refresh automático

- `AuthApi` (Retrofit, base `AUTH_BASE_URL`): `login`, `refresh`, `logout`, `me`.
- `AuthInterceptor` (OkHttp, só no cliente da API): injeta `Authorization: Bearer <access>`.
- `TokenAuthenticator` (OkHttp `Authenticator`): no 401, renova **uma vez** com um `Mutex` (várias requisições em paralelo disparam um refresh só) e repete a requisição. Se o refresh falhar, limpa os tokens → `SignedOut`. É a mesma regra do `sendWithSession` do web.
- Erros mapeados como no web: `invalid_credentials` (401/403/4xx), `rate_limited` (429, respeitando `Retry-After`), `unavailable` (5xx ou rede).

### 2.3 Tela de login e gate de navegação

- Tela igual ao `LoginForm` (campos, mensagens, estados de loading e erro).
- `AppNavHost` decide a rota inicial pelo `SessionState`. Logout (a partir do menu, como o `SessionButton`) chama `/auth/logout` e volta ao login.

**Testes:** `TokenAuthenticator` com `MockWebServer` (401 → refresh → retry; refresh 401 → sign out; dois 401 em paralelo → um refresh só). ViewModel de login com Turbine. **Compose UI test:** login feliz e credencial errada.

**Pronto quando:** login, fechar e reabrir o app (sessão persiste), esperar o
access token expirar (15 min) e a próxima chamada renovar sozinha, logout.

---

## Fase 3 — Agenda

**Referência web:** `mockups/eventos/agenda-preview.tsx`, `agenda-day.tsx`,
`mockup-shell.tsx`, `mobile-navigation.tsx`, `agenda-header-actions.tsx`,
`agenda-timing.ts`, `agenda-refresh.ts`, `components/events/*`, `lib/events/*`.

Issues:

1. **3.1 Shell e navegação:** header (`agenda-header-actions`), navegação mobile (`mobile-navigation.tsx`) como bottom bar ou top bar nativa, menu com logout.
2. **3.2 Port de `packages/timeline` + repositório de eventos:** `EventRepository.window(from, to)` sobre `GET /api/events`, com a mesma janela e paginação de `lib/events/event-window.ts`. Cache em memória por dia, igual à estratégia do web.
3. **3.3 Tira da semana e seletor de dia:** `WeekStrip`, `DayPicker`, `DateNavigator`. Swipe horizontal troca de dia (divergência nativa aceita).
4. **3.4 Timeline do dia e cards:** `TimelineList`/`agenda-day`, `EventCard` com os visuais por tipo (`event-visuals.ts`), cores de tag, tarefas e subtarefas (`task-controls.tsx`, incluindo marcar como feita se o web permite).
5. **3.5 "Agora", "atrasado" e estados vazio/carregando:** `use-now` (relógio compartilhado), `MissedBadge`, `DaySkeleton`, pull-to-refresh (equivalente ao `agenda-refresh`).

**Pronto quando:** a mesma conta mostra os mesmos eventos, na mesma ordem e com
os mesmos badges, no web mobile e no app, em pelo menos 3 dias diferentes
(hoje, passado e futuro).

---

## Fase 4 — Detalhe do evento

**Referência web:** `[userId]/eventos/[eventId]/page.tsx`, `event-details.module.css`, `EventDetailsModal.tsx`.

- **4.1** Rota tipada `EventDetail(eventId)`, `GET /api/events/{id}`, todos os campos por tipo, tarefas/notas e ações (editar, excluir) no mesmo lugar do web.

**Pronto quando:** abrir pelo card mostra exatamente o que o web mostra para o mesmo evento, em cada um dos 4 tipos.

---

## Fase 5 — Criar, editar e excluir

**Referência web:** `new-event-forms/*`, `event-schedule-fields.tsx`, `edit-event-forms/*`, `EditEventModal.tsx`, `DeleteEventDialog.tsx`, `TagInput.tsx`.

Issues:

1. **5.1 Criar evento:** fluxo e campos de agendamento (`event-schedule-fields`), escolha de tipo, lembretes (offsets de `packages/contracts/src/notifications`), `POST /api/events`, com a mesma validação de formulário do web.
2. **5.2 Tags com sugestão:** `TagInput` com `GET /api/tags?query=…&limit=6` e debounce.
3. **5.3 Editar refeição** (`MealEditForm`)
4. **5.4 Editar rotina** (`RoutineEditForm`)
5. **5.5 Editar sono** (`SleepEditForm`)
6. **5.6 Editar treino** (`TrainingEditForm`, `workout-codes.ts`)
7. **5.7 Excluir** (`DeleteEventDialog`, `DELETE /api/events/{id}`), com confirmação em diálogo nativo.

Os formulários de edição compartilham os componentes de `edit-event-forms/shared.tsx`.
Porte primeiro esses componentes compartilhados, na 5.3, e reaproveite-os nas 5.4 a 5.6.

**Pronto quando:** cada operação feita no app aparece certa no web (e vice-versa) ao recarregar.

---

## Fase 6 — Evento por voz

**Referência web:** `VoiceEventButton.tsx`, `VoiceJobStatus.tsx`, `lib/voice-events/use-voice-event-queue.ts`, `lib/speech/*`.

- **6.1 Reconhecimento de fala:** `SpeechRecognizer` do Android, com `pt-BR` e on-device quando disponível. Permissão `RECORD_AUDIO` pedida no primeiro uso, e as mesmas mensagens de erro de `speech-error-messages.ts`.
- **6.2 Fila de jobs:** port da `use-voice-event-queue` num `VoiceQueueRepository` (fila serial, `pending`/`error`, retry e dismiss). `POST /api/events/voice` com a transcrição. Ao esvaziar a fila, recarrega a agenda. UI igual ao `VoiceJobStatus`.

**Pronto quando:** falar "almoço amanhã ao meio-dia" cria o mesmo evento que o web criaria, e desligar a API mostra o erro com o botão de retry.

---

## Fase 7 — Lembretes

**Referência web:** `lib/events/use-due-notifications.ts`, `packages/contracts/src/notifications/types/notification-offset-minutes.ts`.

- **7.1 Agendamento:** `ReminderScheduler` calcula os disparos (`startedAt − offset`) para os eventos futuros carregados, com a mesma regra do web: não dispara aviso cujo horário já passou. Usa `AlarmManager.setExactAndAllowWhileIdle` com `SCHEDULE_EXACT_ALARM`. Se o usuário negar, usa `setWindow` (inexato) e mostra na UI que os avisos podem atrasar.
- **7.2 Sincronização e ciclo de vida:** reagenda a cada carga, criação, edição ou exclusão de evento, e no `BOOT_COMPLETED` (via `WorkManager`, que busca os próximos eventos). Cancela tudo no logout.
- **7.3 Notificação:** canal "Lembretes", `POST_NOTIFICATIONS` (Android 13+) pedido no contexto certo. Tocar abre o detalhe do evento.

**Testes:** o cálculo de disparos é função pura, testada com fixtures do web quando possível.

**Pronto quando:** um evento criado para daqui a 6 minutos, com offset de 5, notifica com o app fechado.

---

## Fase 8 — Chat com o agente

**Referência web:** `mockups/eventos/agent-chat-panel.tsx`, `lib/agent-chat/*`.

- **8.1 Cliente WebSocket:** port de `AgentChatClient`. Pede um ticket (`POST /api/ai/chat/tickets`, com refresh no 401) e só então abre o WebSocket do OkHttp em `/api/ai/chat`. Espera o frame `ready` (timeout de 10 s), abre a conexão na primeira mensagem, reabre depois de 4001/4002, trata 4401 (ticket rejeitado) e mapeia `connection_lost`/`connection_failed`/`session_expired`. O socket vive num repositório com escopo de sessão, não na tela.
- **8.2 Tela de chat:** mesmo layout, estados (`status`, `reply`, `error`) e textos do painel web. Ao terminar uma ação que muda eventos, recarrega a agenda, como o web.
- **8.3 Histórico de conversas:** `GET /api/ai/conversations` paginado, `…/{id}/messages`, `DELETE …/{id}`.

**Testes:** o cliente com um `ChatSocket` falso (mesma abstração do web) nos cenários de ticket rejeitado, timeout do `ready` e reconexão.

**Pronto quando:** a mesma conversa feita no web e no app produz as mesmas mudanças na agenda, e o histórico aparece nos dois.

---

## Fase 9 — CI e APK de release

- **9.1 Job `mobile` no `ci.yml`:** roda só com mudanças em `apps/mobile/**`, `packages/contracts/**`, `packages/theme/**`, `packages/timeline/**` ou `scripts/mobile/**` (use `dorny/paths-filter`). Passos: setup de Node e pnpm, `pnpm install`, `actions/setup-java@v4` (Temurin 21), `android-actions/setup-android`, cache do Gradle, `pnpm --filter @repo/mobile run generate:fixtures`, `./gradlew ktlintCheck lintDebug testDebugUnitTest assembleDebug`. O APK debug sobe como artifact.
- **9.2 Assinatura de release:** keystore gerado localmente e guardado no 1Password. No CI, os secrets entram em base64 e `assembleRelease` gera o APK assinado como artifact. Sem Play Store por enquanto.
- **9.3 Validação da v1 contra produção:** instalar o APK de release, fazer login com a conta real e percorrer o `docs/mobile-parity.md` inteiro. Aqui o app aponta pela primeira vez para produção.

**Pronto quando:** um PR que muda um schema Zod sem espelho no Kotlin fica
vermelho no CI, e o APK de release funciona contra produção.

---

## 4. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Contrato TS muda e o Kotlin fica para trás | Testes de fixtures + job de CI filtrado por `packages/contracts/**` + regra no `AGENTS.md`. |
| Curva de Kotlin/Compose | A skill `kotlin-android` com seções didáticas, antes de qualquer tela (Fase 1.5). Fases pequenas, um PR por issue. |
| Web muda durante a reescrita | O checklist de paridade é a fonte, e cada PR do web depois da Fase 0 precisa atualizar a linha. |
| Backend local inacessível do celular | `adb reverse` automatizado no `pnpm dev:mobile`. No emulador, `10.0.2.2`. |
| Permissão de alarme exato negada | Fallback inexato, avisando o usuário. |
| CI atual quebra por falta do Android SDK | `--filter=!@repo/mobile` no job `validate` (1.2). |

## 5. Rollback

Até a Fase 9 não existe app publicado, então não há rollback de usuário. Cada
fase é um conjunto de PRs revertíveis com `git revert`. O app Expo pode ser
consultado em `git show <commit-anterior-à-fase-0>:apps/mobile/...`.
