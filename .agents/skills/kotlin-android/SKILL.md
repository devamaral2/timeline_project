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
pnpm --filter @repo/mobile run generate:fixtures
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
