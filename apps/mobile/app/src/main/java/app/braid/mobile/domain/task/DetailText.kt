package app.braid.mobile.domain.task

import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.domain.timeline.shortDate
import app.braid.mobile.domain.timeline.weekday
import app.braid.mobile.domain.timeline.zonedDayStart
import java.time.Instant

/*
 * Port dos textos do detalhe da tarefa: `momentLabel`, `recurrenceLines`, `reminderLabel` e `recurrenceRuleLabel`
 * (`lib/tasks/task-read-model.ts` e `card-text.ts`), `mapsUrl` (`maps-link.ts`) e as linhas que `TaskInfoSection.tsx`
 * monta delas. São funções puras, conferidas contra as fixtures geradas pelas funções TS (`DetailTextTest`).
 */

private const val MINUTES_PER_DAY = 1440
private const val WEEKDAY_ABBREVIATION = 3

/** "30 min", "1 dia", "2 dias": o lembrete em cartão pequeno; dia exato sai em dias. */
fun reminderLabel(minutes: Int): String {
    if (minutes % MINUTES_PER_DAY == 0) {
        val days = minutes / MINUTES_PER_DAY
        return "$days ${if (days == 1) "dia" else "dias"}"
    }
    return "$minutes min"
}

/** Um instante no fuso da timeline: "Sáb, 14 nov · 18:30"; a meia-noite local é o dia sem hora e sai só "Sáb, 14 nov". */
fun momentLabel(instant: Instant): String {
    val dayKey = dayKeyOf(instant)
    val day = "${weekday(dayKey).take(WEEKDAY_ABBREVIATION)}, ${shortDate(dayKey).lowercase()}"
    return if (instant == zonedDayStart(dayKey)) day else "$day · ${formatTime(instant)}"
}

data class RecurrenceLines(
    val rule: String,
    val detail: String,
)

/** A regra da série e, embaixo, desde quando vale, se tem fim e se a ocorrência ainda a segue. */
fun recurrenceLines(recurrence: TaskRecurrence): RecurrenceLines {
    val rule = recurrence.rule
    val since = shortDate(rule.startsOn).lowercase()
    val end = rule.endsOn?.let { "até ${shortDate(it).lowercase()}" } ?: "sem fim"
    val follows = if (recurrence.detached) "esta ocorrência não segue a série" else "esta ocorrência segue a série"
    return RecurrenceLines(rule = recurrenceRuleLabel(rule), detail = "desde $since · $end · $follows")
}

private const val UNRESERVED_MARKS = "-_.!~*'()"
private const val HEX = "0123456789ABCDEF"
private const val NIBBLE = 4
private const val LOW_NIBBLE = 0xF

/** O `encodeURIComponent` do JavaScript: UTF-8 em `%XX`, menos letras, dígitos e `-_.!~*'()`. */
private fun encodeUriComponent(text: String): String {
    val out = StringBuilder()
    for (byte in text.toByteArray(Charsets.UTF_8)) {
        val value = byte.toInt() and 0xFF
        val char = value.toChar()
        if (value < 0x80 && (char.isLetterOrDigit() || char in UNRESERVED_MARKS)) {
            out.append(char)
        } else {
            out.append('%').append(HEX[value shr NIBBLE]).append(HEX[value and LOW_NIBBLE])
        }
    }
    return out.toString()
}

/** O link do local no Google Maps (busca por texto), o mesmo que o web abre; o app o usa quando nenhum app de mapas atende o `geo:`. */
fun mapsUrl(location: String): String = "https://www.google.com/maps/search/?api=1&query=${encodeUriComponent(location.trim())}"

/** O `geo:` que abre o mapa do Android com a mesma busca por texto. */
fun mapsGeoUri(location: String): String = "geo:0,0?q=${encodeUriComponent(location.trim())}"

/** O que a seção Informações mostra, linha a linha; `null` e lista vazia são linhas que não aparecem. */
data class TaskInfo(
    /** "Início": nulo na tarefa longa sem início. */
    val start: String?,
    /** "Término", ou "Previsão de entrega" na tarefa longa. */
    val endLabel: String,
    val end: String,
    val duration: String?,
    /** A linha "Tarefa persistente" (o ponto "Sim"): só a tarefa longa. */
    val persistent: Boolean,
    val recurrence: RecurrenceLines?,
    val location: String?,
    val reminders: List<String>,
    val tags: List<String>,
    val description: String?,
)

fun taskInfo(task: TaskDetail): TaskInfo {
    val card = task.card
    val start =
        when {
            card.startedAt != null -> momentLabel(card.startedAt)
            card.longRunning -> null
            else -> "sem data"
        }
    return TaskInfo(
        start = start,
        endLabel = if (card.longRunning) "Previsão de entrega" else "Término",
        end = card.estimatedFinishAt?.let(::momentLabel) ?: "sem data",
        duration = cardDurationLabel(card),
        persistent = card.longRunning,
        recurrence = task.recurrence?.let(::recurrenceLines),
        location = task.location?.ifEmpty { null },
        reminders = task.notifyOffsetsMinutes.map(::reminderLabel),
        tags = card.tags,
        description = task.description.ifEmpty { null },
    )
}
