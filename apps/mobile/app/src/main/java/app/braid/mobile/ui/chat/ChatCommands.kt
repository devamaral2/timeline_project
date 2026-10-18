package app.braid.mobile.ui.chat

import app.braid.mobile.data.dto.AgentConversationDto
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.format.TextStyle
import java.time.temporal.ChronoUnit
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

/** Hoje, os últimos sete dias e o resto (`groupConversations` do web). */
enum class ConversationGroupLabel(
    val label: String,
) {
    Today("Hoje"),
    ThisWeek("Esta semana"),
    Before("Antes"),
}

data class ConversationGroup(
    val label: ConversationGroupLabel,
    val items: List<AgentConversationDto>,
)

private fun AgentConversationDto.day(zone: ZoneId): LocalDate = Instant.parse(lastMessageAt).atZone(zone).toLocalDate()

/** Cada grupo do mais recente para o mais antigo; grupos vazios ficam de fora. */
fun groupConversations(
    conversations: List<AgentConversationDto>,
    today: LocalDate,
    zone: ZoneId = ZoneId.systemDefault(),
): List<ConversationGroup> =
    conversations
        .sortedByDescending { Instant.parse(it.lastMessageAt) }
        .groupBy { conversation ->
            val days = ChronoUnit.DAYS.between(conversation.day(zone), today)
            when {
                days <= 0 -> ConversationGroupLabel.Today
                days < 7 -> ConversationGroupLabel.ThisWeek
                else -> ConversationGroupLabel.Before
            }
        }.toSortedMap()
        .map { (label, items) -> ConversationGroup(label, items) }

/** "14:32" hoje, "ter." nesta semana e "28 set." antes disso. */
fun conversationTime(
    lastMessageAt: String,
    today: LocalDate,
    zone: ZoneId = ZoneId.systemDefault(),
): String {
    val moment = Instant.parse(lastMessageAt).atZone(zone)
    val days = ChronoUnit.DAYS.between(moment.toLocalDate(), today)
    return when {
        days <= 0 -> moment.format(DateTimeFormatter.ofPattern("HH:mm"))
        days < 7 -> moment.dayOfWeek.getDisplayName(TextStyle.SHORT, PT_BR)
        else -> "${moment.dayOfMonth} ${moment.month.getDisplayName(TextStyle.SHORT, PT_BR)}"
    }
}

/** O nome de uma conversa: o título, se alguém deu um; senão o primeiro pedido. */
fun AgentConversationDto.label(): String = title ?: preview
