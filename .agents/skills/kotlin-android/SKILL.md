---
name: kotlin-android
description: Use for any implementation, review, testing, or debugging change under apps/mobile, the native Kotlin Android app built with Jetpack Compose that mirrors the web.
---

# Kotlin Android no Braid

Use esta skill para qualquer mudança em `apps/mobile`. O app é Android nativo
(Kotlin, Jetpack Compose, Hilt, Retrofit + OkHttp, kotlinx.serialization,
coroutines e Flow) e repercute o web de hoje na largura mobile. A spec é
`docs/prd/android-reconstruido-do-web.md`; os tickets estão em
`.scratch/android-reconstruido-do-web/issues/`. Onde a spec e o web divergirem
no detalhe (texto, fonte, ordem, estado), vale o web.

## Vocabulário

O glossário é `CONTEXT.md`. O código segue os contratos em inglês e a tela fala
português:

| Código | Tela |
|---|---|
| `Task` (pessoa, agente, referência, longa, recorrente) | tarefa |
| `Artifact` | documento (a lista é "Documentos") |
| `Request` | pedido |
| `Step`, `Entry`, `Relation`, `Recurrence`, `Actor` | passo, entrada, relação, recorrência, executor |

Nenhum nome antigo sobrevive: nada de `Event`/`evento` nem `Note`/`nota` como
nome de entidade. "Nota" só aparece como rótulo de tela, dentro de uma string.
`AppVocabularyTest` varre `src/main` e `src/test` e falha com o arquivo e a
linha. Se uma biblioteca ou a plataforma exigir um nome com "Event" (um
`MotionEvent`, o `cancelAndIgnoreRemainingEvents` do Turbine), acrescente-o à
lista explícita dentro do teste, nunca renomeie o domínio.

## Camadas

As dependências apontam para dentro, em um módulo Gradle só (`apps/mobile/app`,
`applicationId app.braid.mobile`):

```text
ui → domain ← data
          ↑
       core (designsystem, network)
```

- `ui/`: telas Compose, `ViewModel`s com `StateFlow<UiState>` e as rotas
  tipadas em `ui/navigation/Routes.kt`. A UI observa estado e emite eventos; não
  conhece Retrofit nem DataStore.
- `domain/`: modelos e interfaces de repositório (`domain/session/Session.kt` é o
  exemplo). Não importa Android nem rede.
- `data/`: DTOs `@Serializable` escritos à mão (um por schema que o app usa),
  APIs Retrofit, repositórios e persistência.
- `core/designsystem/`: `Color.kt` é **gerado** (`pnpm --filter @repo/mobile run
  generate:theme`, nunca à mão); `Type.kt`, `Shape.kt` e `BraidTheme`. Nenhuma
  tela escreve um hexadecimal.
- `core/network/`: `BraidJson`, `createAuthApi`, `ApiClientFactory` (bearer,
  renovação num 401 e repetição única) e o módulo Hilt.

## Sessão e rede

- O app fala direto com o **Auth** (`POST /auth/login`, `/auth/token/refresh`,
  `/auth/logout`, `GET /auth/me`) e com a **API** com `Authorization: Bearer`,
  nos mesmos caminhos que o web usa pelo proxy. URLs vêm de
  `BuildConfig.AUTH_BASE_URL` e `API_BASE_URL` (padrão `localhost:3002` e
  `localhost:3001`; `pnpm dev:mobile` faz `adb reverse`).
- Os tokens ficam no DataStore, cifrados com Tink sobre o Keystore
  (`DataStoreSessionStorage`, `SessionCipher`). O armazenamento está atrás de
  `SessionStorage` para os testes.
- Um 401 renova uma vez (`DefaultSessionRepository.renew`, com `Mutex`, então
  renovações concorrentes viram uma) e repete a chamada uma vez. Refresh
  recusado (4xx) apaga a sessão e o estado vira `SignedOut`, que leva ao login;
  Auth fora do ar mantém a sessão, como o web.
- Toda criação manda `Idempotency-Key`; toda edição de tarefa de pessoa manda a
  `revision` lida e o conflito relê a entidade e avisa. Concluir uma tarefa de
  pessoa envia `finishedAt` com o instante atual; sair de `done` envia nulo.
- Ao vivo é consulta periódica, nunca WebSocket: 3 s para pedidos e tarefas de
  agente abertas (só com a tela visível), 180 s de limite para a caixa de
  processo, 5 min para a fonte dos lembretes.
- Não mude a API, o Auth, o web nem `packages/*`. Se faltar um dado, registre a
  lacuna em `docs/mobile-parity.md`.

## Uma tela, do começo ao fim

O exemplo vivo é o login (`ui/auth`, `domain/session`, `data/session`). Para uma
tela nova sobre `Task`, nesta ordem:

1. **Fixture primeiro.** Acrescente o schema Zod e o exemplo em
   `scripts/mobile/fixtures/<area>.ts` e registre o módulo em
   `scripts/mobile/generate-fixtures.ts`. Rode `pnpm --filter @repo/mobile run
   test` (ele gera as fixtures antes do Gradle).
2. **Teste do ViewModel** (vermelho): o ViewModel real, com a infraestrutura real,
   contra o `TestBackend` servindo a fixture; confira o `UiState` e as
   requisições recebidas.
3. **DTO** `@Serializable` em `data/<area>/`, **API Retrofit**
   (`interface TasksApi { @GET("api/tasks") suspend fun page(...): AgendaPageDto }`)
   e **repositório** que devolve modelos de `domain/`.
4. **ViewModel** `@HiltViewModel` com `StateFlow<UiState>` (`sealed interface`
   com `Loading`, `Content`, `Error` quando couber) e **tela** Compose com um
   `...Route` que lê o estado com `collectAsStateWithLifecycle()`.
5. Rota tipada em `Routes.kt` e entrada no `AppNavHost`.
6. Linha(s) da tela em `docs/mobile-parity.md`.

```kotlin
// data/tasks/TasksApi.kt
interface TasksApi {
    @GET("api/tasks")
    suspend fun page(@Query("from") from: String): AgendaPageDto
}
// ui/agenda/AgendaViewModel.kt
@HiltViewModel
class AgendaViewModel @Inject constructor(private val tasks: TaskRepository) : ViewModel() {
    val state: StateFlow<AgendaUiState> = ...
}
```

Prefira `val` e coleções imutáveis na fronteira da UI, `sealed interface` com
`when` exaustivo para estados e evite `!!`. Funções `@Composable` ficam em
PascalCase (o `.editorconfig` do módulo configura o ktlint para isso).

## Testes

Há **uma fronteira**: a rede. O teste cria o ViewModel da tela com Retrofit,
OkHttp, `Authenticator`, repositório e serialização reais, apontados para um
`MockWebServer` que serve fixtures geradas dos contratos. Não escreva
repositórios falsos nem use `mockk`.

Peças em `app/src/test/java/app/braid/mobile/support/`:

- `Fixtures.text("nome")` / `Fixtures.json("nome")`: lê
  `src/test/resources/fixtures/<nome>.json`, geradas por
  `scripts/mobile/generate-fixtures.ts` a partir dos schemas Zod e das funções
  TS. Nunca escreva à mão uma resposta da API: peça ao gerador.
- `TestBackend`: o servidor. `route("GET", "/api/tasks", fixture("nome"))`
  (várias respostas são servidas em ordem; a última repete),
  `route(método, caminho) { request -> MockResponse }` para lógica, e
  `requestsTo(método, caminho)` para conferir método, caminho, query, corpo,
  `Authorization`, `Idempotency-Key` e `revision`.
- `TestGraph(backend)`: a mesma ligação de produção (`DefaultSessionRepository`,
  `ApiClientFactory`) com `InMemorySessionStorage`. Crie o ViewModel com o que
  ele expõe.
- Para observar o `UiState`: Turbine (`state.test { awaitItem() }`) com
  `Dispatchers.setMain(UnconfinedTestDispatcher())`; veja `LoginViewModelTest`.

O gerador de fixtures resolve `@repo/*` e `@/*` pelo `scripts/mobile/tsconfig.json`, então pode importar as funções do web
e dos pacotes como elas são. O relógio do app é o `AppClock`.

Só relógio, alarmes, voz e armazenamento cifrado são trocados, cada um atrás de
uma interface pequena. Toda lógica portada à mão do TS (`packages/timeline`,
`hueForTag`, grupos da lista, tempo livre, lembretes) é testada com entradas e
saídas de fixtures geradas pelas funções TS. Um contrato novo ou uma
fixture decodificando no DTO entra num teste como `SessionFixturesTest`.

Não há teste instrumentado de Compose: a comparação visual é manual, com o app
no emulador contra o backend local lado a lado com o web em 390×844.

## Comandos

Sempre da raiz do repositório; exigem JDK 17+ e o Android SDK (`ANDROID_HOME`).

```bash
pnpm --filter @repo/mobile run test        # gera as fixtures e roda testDebugUnitTest
pnpm --filter @repo/mobile run lint        # ktlintCheck lintDebug
pnpm --filter @repo/mobile run generate:theme
pnpm dev:mobile                            # adb reverse + instala e abre no aparelho
```

`ktlintFormat` (`cd apps/mobile && ./gradlew ktlintFormat`) corrige o estilo.
Mudou `packages/contracts`, `packages/theme` ou `packages/timeline`? Rode o
`test` do mobile: o gerador de fixtures e o teste de tema pegam a divergência.

## Paridade

Toda mudança visível em `apps/web` (tela, fluxo, campo, texto, cor,
comportamento) pede a mudança equivalente aqui no mesmo PR, ou num PR vinculado,
e a linha atualizada em `docs/mobile-parity.md`. Antes de portar uma tela, abra o
componente web correspondente e o web rodando em 390×844: ele é a referência,
não a documentação. Cada ticket termina com screenshot do app e do web lado a
lado no PR.
