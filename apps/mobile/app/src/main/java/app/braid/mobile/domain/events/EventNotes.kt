package app.braid.mobile.domain.events

import app.braid.mobile.data.dto.EventDetailDto
import app.braid.mobile.data.dto.EventNoteDto
import app.braid.mobile.data.dto.MealEventNoteDto
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.SleepEventNoteDto
import app.braid.mobile.data.dto.TextEventNoteDto
import app.braid.mobile.data.dto.TrainingEventNoteDto
import app.braid.mobile.data.dto.UpdateEventNoteDto

/** O `type` da note no contrato (`text`, `meal`, `sleep`, `training`). */
fun EventNoteDto.typeName(): String =
    when (this) {
        is TextEventNoteDto -> "text"
        is MealEventNoteDto -> "meal"
        is SleepEventNoteDto -> "sleep"
        is TrainingEventNoteDto -> "training"
    }

/**
 * A note que carrega os dados da natureza do evento: a primeira cujo tipo é o
 * `kind` dele. É achada pelo tipo, e não pela primeira posição: a ordem das
 * notes é a que o usuário montou, e um evento composto pode ter uma nota de
 * texto antes da refeição. Pode não existir — um evento não exige note.
 */
fun EventDetailDto.primaryNote(): EventNoteDto? = notes.firstOrNull { it.typeName() == kind }

/**
 * A lista completa de notes do evento, com a de [noteId] trocada por [patch].
 *
 * O PATCH substitui a lista inteira: mandar só a note editada tiraria as outras
 * do evento. Cada formulário cuida de uma note — as demais atravessam só com o
 * `id`, o que as mantém na lista sem reescrevê-las. Sem [noteId] (o evento
 * ainda não tem a note deste tipo), uma note nova entra no fim.
 */
fun EventDetailDto.notesPatchedWith(
    noteId: String?,
    patch: UpdateEventNoteDto,
): List<UpdateEventNoteDto> {
    val entries = notes.map { note -> if (note.id == noteId) patch else UpdateEventNoteDto.keep(note) }
    return if (noteId != null) entries else entries + patch
}

/**
 * O tipo de nota que cabe à natureza do evento: refeição, sono e treino levam a
 * nota do próprio tipo; a rotina não tem nota própria e leva texto livre.
 */
fun noteTypeForEventKind(kind: String): String = if (kind == "routine") "text" else kind

/**
 * As notas que se podem associar ao evento: as do tipo adequado que ainda não
 * estão nele. Notas de outros tipos nunca entram.
 */
fun linkableNotesOf(
    notes: List<NoteDto>,
    event: EventDetailDto,
): List<NoteDto> {
    val type = noteTypeForEventKind(event.kind)
    val linked = event.notes.mapTo(mutableSetOf()) { it.id }
    return notes.filter { it.type == type && it.id !in linked }
}
