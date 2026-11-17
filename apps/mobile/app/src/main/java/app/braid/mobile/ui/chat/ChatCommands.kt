package app.braid.mobile.ui.chat

import java.text.Normalizer
import java.util.Locale

/** O que a barra "/" do chat abre, como `HUB_COMMANDS` do web (`hub-commands.ts`). */
enum class ChatCommand(
    val slug: String,
    val label: String,
    val hint: String,
) {
    Task("tarefa", "Criar tarefa", "Nome, status, prioridade e dia"),
    Event("evento", "Criar evento", "Tipo, início e término"),
    Note("nota", "Criar nota", "A primeira linha vira o título"),
    Search("buscar", "Pesquisar", "Eventos, tarefas e notas"),
}

/** Os comandos que ainda casam com o que foi digitado e o texto depois do comando. */
data class CommandQuery(
    val matches: List<ChatCommand>,
    val argument: String,
)

private val PT_BR = Locale.forLanguageTag("pt-BR")
private val COMMAND_INPUT = Regex("""^/(\S*)\s*([\s\S]*)$""")

private fun String.fold(): String =
    Normalizer
        .normalize(this, Normalizer.Form.NFD)
        .replace(Regex("\\p{Mn}+"), "")
        .lowercase(PT_BR)

/**
 * Lê o campo do chat como comando quando ele começa com "/". Sem barra, ou com
 * um comando que não existe, devolve `null` e o texto segue para a IA.
 */
fun parseChatCommand(input: String): CommandQuery? {
    if (!input.startsWith("/")) return null
    val match = COMMAND_INPUT.find(input) ?: return null
    val typed = match.groupValues[1].fold()
    val hasArgument = Regex("""^/\S*\s""").containsMatchIn(input)
    val matches =
        ChatCommand.entries.filter { command ->
            if (hasArgument) {
                command.slug == typed
            } else {
                command.slug.startsWith(typed) ||
                    command.label
                        .fold()
                        .split(" ")
                        .any { it.startsWith(typed) }
            }
        }
    return if (matches.isEmpty()) null else CommandQuery(matches, match.groupValues[2].trim())
}
