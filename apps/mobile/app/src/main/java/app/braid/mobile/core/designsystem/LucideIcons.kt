package app.braid.mobile.core.designsystem

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Os mesmos desenhos do `lucide-react` que o web usa, na grade de 24. O traço
 * padrão é o de `.shell svg` (1,65); a barra inferior pede 1,4, como o
 * `.bottomNav svg` do web.
 */
object LucideIcons {
    const val DEFAULT_STROKE = 1.65f
    const val NAV_STROKE = 1.4f

    private val cache = HashMap<String, ImageVector>()

    private fun icon(
        name: String,
        strokeWidth: Float,
        vararg paths: String,
        filled: Boolean = false,
    ): ImageVector =
        cache.getOrPut("$name@$strokeWidth@$filled") {
            ImageVector
                .Builder(
                    name = name,
                    defaultWidth = 24.dp,
                    defaultHeight = 24.dp,
                    viewportWidth = 24f,
                    viewportHeight = 24f,
                ).apply {
                    paths.forEach { data ->
                        addPath(
                            pathData = addPathNodes(data),
                            fill = if (filled) SolidColor(Color.Black) else null,
                            stroke = SolidColor(Color.Black),
                            strokeLineWidth = strokeWidth,
                            strokeLineCap = StrokeCap.Round,
                            strokeLineJoin = StrokeJoin.Round,
                        )
                    }
                }.build()
        }

    fun slidersHorizontal(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "SlidersHorizontal",
            strokeWidth,
            "M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3",
            "M14 2v4M8 10v4M16 18v4",
        )

    fun squareCheck(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "SquareCheck",
            strokeWidth,
            "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
            "m9 12 2 2 4-4",
        )

    fun listChecks(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "ListChecks",
            strokeWidth,
            "M13 5h8",
            "M13 12h8",
            "M13 19h8",
            "m3 17 2 2 4-4",
            "m3 7 2 2 4-4",
        )

    fun fileText(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "FileText",
            strokeWidth,
            "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",
            "M14 2v5a1 1 0 0 0 1 1h5",
            "M10 9H8",
            "M16 13H8",
            "M16 17H8",
        )

    fun calendarDays(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "CalendarDays",
            strokeWidth,
            "M8 2v4",
            "M16 2v4",
            "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
            "M3 10h18",
            "M8 14h.01",
            "M12 14h.01",
            "M16 14h.01",
            "M8 18h.01",
            "M12 18h.01",
            "M16 18h.01",
        )

    fun notepadText(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "NotepadText",
            strokeWidth,
            "M8 2v4",
            "M12 2v4",
            "M16 2v4",
            "M6 4h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
            "M8 10h6",
            "M8 14h8",
            "M8 18h5",
        )

    fun bell(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "Bell",
            strokeWidth,
            "M10.268 21a2 2 0 0 0 3.464 0",
            "M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
        )

    fun circleUserRound(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "CircleUserRound",
            strokeWidth,
            "M18 20a6 6 0 0 0-12 0",
            "M8 10a4 4 0 1 0 8 0 4 4 0 1 0-8 0",
            "M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0",
        )

    fun infinity(strokeWidth: Float = DEFAULT_STROKE) =
        icon("Infinity", strokeWidth, "M6 16c5 0 7-8 12-8a4 4 0 0 1 0 8c-5 0-7-8-12-8a4 4 0 1 0 0 8")

    fun search(strokeWidth: Float = DEFAULT_STROKE) = icon("Search", strokeWidth, "M3 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0", "m21 21-4.3-4.3")

    fun plus(strokeWidth: Float = DEFAULT_STROKE) = icon("Plus", strokeWidth, "M5 12h14", "M12 5v14")

    fun close(strokeWidth: Float = DEFAULT_STROKE) = icon("X", strokeWidth, "M18 6 6 18", "m6 6 12 12")

    fun arrowUp(strokeWidth: Float = DEFAULT_STROKE) = icon("ArrowUp", strokeWidth, "m5 12 7-7 7 7", "M12 19V5")

    fun chevronDown(strokeWidth: Float = DEFAULT_STROKE) = icon("ChevronDown", strokeWidth, "m6 9 6 6 6-6")

    fun chevronRight(strokeWidth: Float = DEFAULT_STROKE) = icon("ChevronRight", strokeWidth, "m9 18 6-6-6-6")

    fun arrowLeft(strokeWidth: Float = DEFAULT_STROKE) = icon("ArrowLeft", strokeWidth, "m12 19-7-7 7-7", "M19 12H5")

    fun check(strokeWidth: Float = DEFAULT_STROKE) = icon("Check", strokeWidth, "M20 6 9 17l-5-5")

    fun trash2(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "Trash2",
            strokeWidth,
            "M3 6h18",
            "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6",
            "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2",
            "M10 11v6",
            "M14 11v6",
        )

    /** O balão do botão "Buscar e criar" na barra inferior: a porta do chat com IA. */
    fun messageSquare(
        strokeWidth: Float = DEFAULT_STROKE,
        filled: Boolean = false,
    ) = icon(
        "MessageSquare",
        strokeWidth,
        "M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z",
        filled = filled,
    )

    /** As duas bolhas de "Todas as conversas" no cabeçalho do chat. */
    fun messagesSquare(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "MessagesSquare",
            strokeWidth,
            "M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z",
            "M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1",
        )

    fun maximize2(strokeWidth: Float = DEFAULT_STROKE) = icon("Maximize2", strokeWidth, "M15 3h6v6", "m21 3-7 7", "m3 21 7-7", "M9 21H3v-6")

    fun minimize2(strokeWidth: Float = DEFAULT_STROKE) =
        icon("Minimize2", strokeWidth, "m14 10 7-7", "M20 10h-6V4", "m3 21 7-7", "M4 14h6v6")
}
