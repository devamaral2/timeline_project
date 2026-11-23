package app.braid.mobile.domain.chat

import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.RequestRoute
import java.text.Normalizer
import java.util.Locale

/** Os agentes que o chat atende por modo: o Hermes (ADR 004) e o modelo que a pessoa escolhe (ADR 0019). */
enum class ChatAgent(
    val code: String,
    val route: RequestRoute,
    /** O nome no topo do chat e no rastro. */
    val title: String,
) {
    Hermes("hermes", RequestRoute.Hermes, "Hermes"),
    Model("model", RequestRoute.Model, "Modelo"),
    ;

    companion object {
        /** O agente de modo que atende a rota, ou `null` na rota por passos e nas que o chat não mostra. */
        fun of(route: RequestRoute): ChatAgent? = entries.firstOrNull { it.route == route }
    }
}

/**
 * Comandos de modo do chat. `/hermes` entra no modo do Hermes; `/modelo`, `/claude`, `/openai` e `/openrouter` entram no
 * modo modelo (os três últimos já escolhem o provedor; `/modelo` mantém o salvo). Com uma mensagem depois, já a enviam.
 * `/app` volta ao assistente da agenda.
 */
sealed interface ChatModeCommand {
    data class Hermes(
        val text: String?,
    ) : ChatModeCommand

    data class Model(
        val provider: ModelProvider?,
        val text: String?,
    ) : ChatModeCommand

    data object Leave : ChatModeCommand
}

private val AGENT_COMMAND = Regex("/(hermes|modelo|claude|openai|openrouter)(?:\\s+([\\s\\S]+))?", RegexOption.IGNORE_CASE)
private val LEAVE_COMMAND = Regex("/(?:app|assistente|sair)", RegexOption.IGNORE_CASE)

/** O provedor que cada comando de modelo já escolhe; `/modelo` não escolhe nenhum e mantém o salvo. */
private val COMMAND_PROVIDERS =
    mapOf(
        "modelo" to null,
        "claude" to ModelProvider.Anthropic,
        "openai" to ModelProvider.OpenAi,
        "openrouter" to ModelProvider.OpenRouter,
    )

/**
 * Lê `/hermes`, `/modelo`, `/claude`, `/openai`, `/openrouter` (com ou sem mensagem), `/app`, `/assistente` e `/sair`;
 * qualquer outro texto não é comando.
 */
fun parseChatCommand(text: String): ChatModeCommand? {
    val trimmed = text.trim()
    AGENT_COMMAND.matchEntire(trimmed)?.let { match ->
        val name = match.groupValues[1].lowercase(Locale.ROOT)
        val rest = match.groupValues[2].trim().ifEmpty { null }
        return if (name == "hermes") ChatModeCommand.Hermes(rest) else ChatModeCommand.Model(COMMAND_PROVIDERS[name], rest)
    }
    if (LEAVE_COMMAND.matches(trimmed)) return ChatModeCommand.Leave
    return null
}

/**
 * O que a barra "/" do chat abre, na ordem do web; cada tela liga o seu comando em [ChatCommandHandlers]. `/buscar` pesquisa
 * as tarefas e os documentos de verdade (o web filtra uma lista de exemplo).
 */
enum class ChatCommand(
    val slug: String,
    val label: String,
    val hint: String,
) {
    Task("tarefa", "Criar tarefa", "Tipo, status, início e término"),
    Document("nota", "Criar nota", "A primeira linha vira o título"),
    Search("buscar", "Pesquisar", "Tarefas e documentos"),
    Notifications("notificacoes", "Notificações", "Avisos recentes e próximos"),
    Settings("configuracoes", "Configurações", "Tema e conta"),
}

data class CommandQuery(
    /** Os comandos que ainda casam com o que foi digitado depois da barra. */
    val matches: List<ChatCommand>,
    /** O texto depois do comando (`/tarefa comprar pão` → `comprar pão`). */
    val argument: String,
)

private val DIACRITICS = Regex("\\p{InCombiningDiacriticalMarks}")
private val PT_BR = Locale.forLanguageTag("pt-BR")

private fun fold(text: String): String = Normalizer.normalize(text, Normalizer.Form.NFD).replace(DIACRITICS, "").lowercase(PT_BR)

private val COMMAND_SHAPE = Regex("/(\\S*)\\s*([\\s\\S]*)")
private val HAS_ARGUMENT = Regex("/\\S*\\s[\\s\\S]*")

/**
 * Lê o campo do chat como comando quando ele começa com "/". Sem barra, ou com um comando que não existe (ou que ainda
 * não tem tela), devolve `null` e o texto segue para a IA.
 */
fun parseCommand(
    input: String,
    available: List<ChatCommand> = ChatCommand.entries,
): CommandQuery? {
    if (!input.startsWith("/")) return null
    val shape = COMMAND_SHAPE.matchEntire(input)
    val typed = fold(shape?.groupValues?.get(1).orEmpty())
    val rest = shape?.groupValues?.get(2).orEmpty()
    val hasArgument = HAS_ARGUMENT.matches(input)
    val matches =
        available.filter { command ->
            if (hasArgument) {
                command.slug == typed
            } else {
                command.slug.startsWith(typed) || fold(command.label).split(" ").any { it.startsWith(typed) }
            }
        }
    return if (matches.isEmpty()) null else CommandQuery(matches, rest.trim())
}
