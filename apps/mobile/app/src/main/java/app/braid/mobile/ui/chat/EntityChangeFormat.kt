package app.braid.mobile.ui.chat

import app.braid.mobile.data.dto.AgentChatFieldChangeDto
import java.time.Instant
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

/** Uma linha do diff do chat: `-` o que saiu, `+` o que entrou (`changeLines` do web). */
data class ChangeLine(
    val sign: Char,
    val label: String,
    val value: String,
)

private val LOCALE = Locale.forLanguageTag("pt-BR")
private val WEEKDAY = DateTimeFormatter.ofPattern("EEE", LOCALE)
private val DAY = DateTimeFormatter.ofPattern("d", LOCALE)
private val MONTH = DateTimeFormatter.ofPattern("MMM", LOCALE)
private val CLOCK = DateTimeFormatter.ofPattern("HH:mm", LOCALE)

/** O nome do campo na primeira coluna; o horário fica sem nome, como o `ter 15 set` do desenho. */
fun entityFieldLabel(field: String): String =
    when (field) {
        "deadline" -> "prazo"
        "name" -> "nome"
        "description" -> "descrição"
        "status" -> "estado"
        "priority" -> "prioridade"
        "tags" -> "tags"
        else -> ""
    }

/** `ter 15 set`: o ponto que o Java põe nas abreviações sai. */
private fun dayLabel(date: ZonedDateTime): String =
    listOf(WEEKDAY, DAY, MONTH).joinToString(" ") { it.format(date).trimEnd('.') }

private fun parse(
    value: String,
    zone: ZoneId,
): ZonedDateTime? = runCatching { Instant.parse(value).atZone(zone) }.getOrNull()

/** `ter 15 set 07:00 — 07:45`; o fim em outro dia leva o dia dele. */
private fun formatInterval(
    value: String,
    zone: ZoneId,
): String {
    val from = value.substringBefore('/')
    val to = value.substringAfter('/', "")
    val start = parse(from, zone) ?: return value
    val head = "${dayLabel(start)} ${CLOCK.format(start)}"
    val end = if (to.isEmpty()) null else parse(to, zone)
    if (end == null) return head
    val endDay = if (dayLabel(end) == dayLabel(start)) "" else "${dayLabel(end)} "
    return "$head — $endDay${CLOCK.format(end)}"
}

fun formatChangeValue(
    field: String,
    value: String,
    zone: ZoneId = ZoneId.systemDefault(),
): String = if (field == "time" || field == "deadline") formatInterval(value, zone) else value

/** As linhas do diff: o que saiu (`-`) e depois o que entrou (`+`), campo a campo. */
fun changeLines(
    changes: List<AgentChatFieldChangeDto>,
    zone: ZoneId = ZoneId.systemDefault(),
): List<ChangeLine> =
    changes.flatMap { change ->
        val label = entityFieldLabel(change.field)
        listOfNotNull(
            change.before?.let { ChangeLine('-', label, formatChangeValue(change.field, it, zone)) },
            change.after?.let { ChangeLine('+', label, formatChangeValue(change.field, it, zone)) },
        )
    }
