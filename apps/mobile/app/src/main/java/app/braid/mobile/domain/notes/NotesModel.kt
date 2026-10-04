package app.braid.mobile.domain.notes

import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.TEXT_NOTE_TYPE
import app.braid.mobile.domain.timeline.TIMELINE_TIME_ZONE
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.formatTime
import java.text.Normalizer
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.Locale

/**
 * O que a tela de Notas decide a partir dos dados: filtro, agrupamento por dia,
 * rótulos de data e o texto em blocos. É a porta de `apps/web/src/lib/notes/notes-model.ts`
 * — mesma regra, mesmos rótulos.
 */
enum class NoteKind { Event, Task, Loose }

enum class NoteFilter(
    val label: String,
) {
    All("Todas"),
    Events("Eventos"),
    Tasks("Tarefas"),
    Loose("Soltas"),
}

fun noteKindOf(note: NoteDto): NoteKind =
    when (note.link?.kind) {
        "event" -> NoteKind.Event
        "task" -> NoteKind.Task
        else -> NoteKind.Loose
    }

private fun NoteFilter.matches(kind: NoteKind): Boolean =
    when (this) {
        NoteFilter.All -> true
        NoteFilter.Events -> kind == NoteKind.Event
        NoteFilter.Tasks -> kind == NoteKind.Task
        NoteFilter.Loose -> kind == NoteKind.Loose
    }

private val ptBr = Locale("pt", "BR")
private val diacritics = Regex("\\p{Mn}+")

internal fun normalize(text: String): String = Normalizer.normalize(text, Normalizer.Form.NFD).replace(diacritics, "").lowercase(ptBr)

fun filterNotes(
    notes: List<NoteDto>,
    filter: NoteFilter,
    query: String = "",
): List<NoteDto> {
    val needle = normalize(query.trim())
    return notes.filter { note ->
        if (!filter.matches(noteKindOf(note))) return@filter false
        if (needle.isEmpty()) return@filter true
        val haystack = listOf(note.name, note.content, note.link?.name.orEmpty()) + note.tags.map { "#$it" }
        haystack.any { normalize(it).contains(needle) }
    }
}

data class NoteGroup(
    val key: String,
    val label: String,
    val notes: List<NoteDto>,
)

private val zone: ZoneId = ZoneId.of(TIMELINE_TIME_ZONE)
private val monthsLong =
    listOf("janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro")
private val monthsShort = listOf("jan.", "fev.", "mar.", "abr.", "mai.", "jun.", "jul.", "ago.", "set.", "out.", "nov.", "dez.")
private val weekdaysShort = listOf("seg.", "ter.", "qua.", "qui.", "sex.", "sáb.", "dom.")

private fun dayOf(instant: String): LocalDate = LocalDate.parse(dayKeyOf(instant))

private fun todayOf(now: Instant): LocalDate = now.atZone(zone).toLocalDate()

private fun ageInDays(
    instant: String,
    now: Instant,
): Long = ChronoUnit.DAYS.between(dayOf(instant), todayOf(now))

private fun groupOf(
    updatedAt: String,
    now: Instant,
): Pair<String, String> {
    val day = dayOf(updatedAt)
    val today = todayOf(now)
    val age = ChronoUnit.DAYS.between(day, today)
    return when {
        age <= 0 -> "today" to "Hoje"
        age == 1L -> "yesterday" to "Ontem"
        age < 7 -> "week" to "Esta semana"
        day.year == today.year && day.monthValue == today.monthValue -> "month" to "Este mês"
        else -> "${day.year}-${day.monthValue}" to "${monthsLong[day.monthValue - 1]} de ${day.year}"
    }
}

/** Do mais recente para o mais antigo, um grupo por bloco do tempo. */
fun groupNotes(
    notes: List<NoteDto>,
    now: Instant,
): List<NoteGroup> {
    val groups = mutableListOf<NoteGroup>()
    for (note in notes.sortedByDescending { Instant.parse(it.updatedAt) }) {
        val (key, label) = groupOf(note.updatedAt, now)
        val last = groups.lastOrNull()
        if (last?.key == key) {
            groups[groups.lastIndex] = last.copy(notes = last.notes + note)
        } else {
            groups += NoteGroup(key, label, listOf(note))
        }
    }
    return groups
}

/** "11 set." — e o ano, quando ele não é o corrente. */
private fun shortDay(
    instant: String,
    now: Instant,
): String {
    val day = dayOf(instant)
    val base = "${day.dayOfMonth} ${monthsShort[day.monthValue - 1]}"
    return if (day.year == todayOf(now).year) base else "$base ${day.year}"
}

/** A hora na lista: `09:40` hoje e ontem, `sex., 11 set.` depois. */
fun noteStamp(
    updatedAt: String,
    now: Instant,
): String {
    val age = ageInDays(updatedAt, now)
    if (age == 0L || age == 1L) return formatTime(updatedAt)
    return "${weekdaysShort[dayOf(updatedAt).dayOfWeek.value - 1]}, ${shortDay(updatedAt, now)}"
}

/** "hoje, 09:00", "ontem, 21:12", "amanhã, 08:00" ou "11 set., 09:00". */
fun whenLabel(
    instant: String,
    now: Instant,
): String {
    val time = formatTime(instant)
    return when (ageInDays(instant, now)) {
        0L -> "hoje, $time"
        1L -> "ontem, $time"
        -1L -> "amanhã, $time"
        else -> "${shortDay(instant, now)}, $time"
    }
}

/** "Criada hoje, 08:05" ou "Criada em 12 set. · editada ontem, 21:12". */
fun noteDatesLine(
    note: NoteDto,
    now: Instant,
): String {
    fun relative(instant: String): String {
        val age = ageInDays(instant, now)
        return if (age == 0L || age == 1L) whenLabel(instant, now) else "em ${shortDay(instant, now)}"
    }
    val created = "Criada ${relative(note.createdAt)}"
    val edited = note.revision > 1 && note.updatedAt != note.createdAt
    return if (edited) "$created · editada ${relative(note.updatedAt)}" else created
}

/** O rótulo da origem: "Evento · Almoço", "Tarefa · Revisar proposta" ou "Nota solta". */
fun noteOriginLabel(note: NoteDto): String {
    val link = note.link ?: return "Nota solta"
    return "${if (link.kind == "event") "Evento" else "Tarefa"} · ${link.name}"
}

private val headingMarker = Regex("^\\s*#{1,6}\\s+")
private val blockMarker = Regex("^\\s*(?:>\\s?|[-*+•]\\s+(?:\\[[ xX]]\\s+)?|\\d+[.)]\\s+)")
private val fenceLine = Regex("^\\s*(?:```|~~~)")
private val ruleLine = Regex("^\\s*(?:[-*_]\\s*){3,}$")

/** O texto de uma linha sem a marcação inline do markdown (negrito, itálico, código, links). */
fun stripInlineMarkdown(line: String): String =
    line
        .replace(Regex("!\\[([^\\]]*)]\\([^)]*\\)"), "$1")
        .replace(Regex("\\[([^\\]]+)]\\([^)]*\\)"), "$1")
        .replace(Regex("`([^`]*)`"), "$1")
        .replace(Regex("(\\*\\*|__)(.+?)\\1"), "$2")
        .replace(Regex("~~(.+?)~~"), "$1")
        .replace(Regex("(^|[^\\w*])\\*(?!\\s)(.+?)\\*(?=[^\\w*]|$)"), "$1$2")
        .replace(Regex("(^|\\W)_(?!\\s)(.+?)_(?=\\W|$)"), "$1$2")

/** O corpo em markdown da nota, sem o título repetido na primeira linha (a tela já o mostra). */
fun noteMarkdownOf(note: NoteDto): String {
    var lines = note.content.lines()
    val firstIndex = lines.indexOfFirst { it.isNotBlank() }
    if (firstIndex >= 0 && lines[firstIndex].trim().replace(headingMarker, "") == note.name) {
        lines = lines.drop(firstIndex + 1)
    }
    return lines.joinToString("\n").trim()
}

/** O nome do tipo de uma nota que não é texto livre. */
fun noteTypeLabel(type: String): String =
    when (type) {
        "meal" -> "Refeição"
        "sleep" -> "Sono"
        "training" -> "Treino"
        else -> "Nota"
    }

/** O trecho da lista: o texto sem o título repetido, sem marcação do markdown e numa linha só. */
fun noteSnippet(note: NoteDto): String {
    // Refeição, sono e treino ainda não têm texto para o trecho: o app mostra o tipo.
    if (note.type != TEXT_NOTE_TYPE) return noteTypeLabel(note.type)
    val lines = note.content.lines().map { it.trim() }
    val firstIndex = lines.indexOfFirst { it.isNotEmpty() }
    val first = lines.getOrNull(firstIndex)?.replace(headingMarker, "")
    val body = if (first == note.name) lines.drop(firstIndex + 1) else lines
    return body
        .filterNot { fenceLine.containsMatchIn(it) || ruleLine.matches(it) }
        .map { stripInlineMarkdown(it.replace(headingMarker, "").replace(blockMarker, "")) }
        .filter { it.isNotEmpty() }
        .joinToString(" ")
}
