package app.braid.mobile.ui.notes

import app.braid.mobile.data.dto.NoteDto

/** O que o editor de nota edita: título (opcional), texto e tags. */
data class NoteDraft(
    val name: String = "",
    val content: String = "",
    val tags: List<String> = emptyList(),
) {
    val isBlank: Boolean get() = content.isBlank()

    companion object {
        fun of(note: NoteDto): NoteDraft = NoteDraft(name = note.name, content = note.content, tags = note.tags)
    }
}
