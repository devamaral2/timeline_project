package app.braid.mobile.domain.chat

import java.text.Normalizer
import java.util.Locale

/** Comandos de modo do chat: `/hermes` entra no modo Hermes (com uma mensagem, já a envia); `/app` volta ao assistente. */
sealed interface ChatModeCommand {
    data class Hermes(
        val text: String?,
    ) : ChatModeCommand

    data object Leave : ChatModeCommand
}

private val HERMES_COMMAND = Regex("/hermes(?:\\s+([\\s\\S]+))?", RegexOption.IGNORE_CASE)
private val LEAVE_COMMAND = Regex("/(?:app|assistente|sair)", RegexOption.IGNORE_CASE)

/** Lê `/hermes`, `/hermes mensagem`, `/app`, `/assistente` e `/sair`; qualquer outro texto não é comando. */
fun parseChatCommand(text: String): ChatModeCommand? {
    val trimmed = text.trim()
    HERMES_COMMAND.matchEntire(trimmed)?.let { return ChatModeCommand.Hermes(it.groupValues[1].trim().ifEmpty { null }) }
    if (LEAVE_COMMAND.matches(trimmed)) return ChatModeCommand.Leave
    return null
}

/**
 * O que a barra "/" do chat abre. `/buscar` (a pesquisa) é código morto do web e não existe aqui; cada ticket de tela
 * liga o seu comando em [ChatCommandHandlers].
 */
enum class ChatCommand(
    val slug: String,
    val label: String,
    val hint: String,
) {
    Task("tarefa", "Criar tarefa", "Tipo, status, início e término"),
    Document("nota", "Criar nota", "A primeira linha vira o título"),
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
