package app.braid.mobile.ui.notes

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Note
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.ui.event.eventDetailPalette

/** O ícone e a cor da origem da nota: o tipo do evento, a tarefa ou nada (nota solta). */
internal data class NoteOriginVisual(
    val icon: ImageVector,
    val color: Color,
)

@Composable
internal fun noteOriginVisual(note: NoteDto): NoteOriginVisual {
    val palette = eventDetailPalette()
    val link = note.link ?: return NoteOriginVisual(Icons.Outlined.Note, MaterialTheme.colorScheme.onSurfaceVariant)
    if (link.kind == "task") return NoteOriginVisual(Icons.Outlined.Schedule, MaterialTheme.colorScheme.onBackground)
    return when (link.eventKind) {
        "meal" -> NoteOriginVisual(Icons.Outlined.Restaurant, palette.meal)
        "training" -> NoteOriginVisual(Icons.Outlined.FitnessCenter, palette.training)
        "sleep" -> NoteOriginVisual(Icons.Outlined.Bedtime, palette.sleep)
        "routine" -> NoteOriginVisual(Icons.Outlined.AccessTime, palette.routine)
        else -> NoteOriginVisual(Icons.Outlined.Circle, MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
