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
    ): ImageVector =
        cache.getOrPut("$name@$strokeWidth") {
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
                            stroke = SolidColor(Color.Black),
                            strokeLineWidth = strokeWidth,
                            strokeLineCap = StrokeCap.Round,
                            strokeLineJoin = StrokeJoin.Round,
                        )
                    }
                }.build()
        }

    fun squareCheck(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "SquareCheck",
            strokeWidth,
            "M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z",
            "m9 12 2 2 4-4",
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

    fun circlePlus(strokeWidth: Float = DEFAULT_STROKE) =
        icon("CirclePlus", strokeWidth, "M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0", "M8 12h8", "M12 8v8")

    fun plus(strokeWidth: Float = DEFAULT_STROKE) = icon("Plus", strokeWidth, "M5 12h14", "M12 5v14")

    fun close(strokeWidth: Float = DEFAULT_STROKE) = icon("X", strokeWidth, "M18 6 6 18", "m6 6 12 12")

    fun arrowUp(strokeWidth: Float = DEFAULT_STROKE) = icon("ArrowUp", strokeWidth, "m5 12 7-7 7 7", "M12 19V5")

    fun chevronDown(strokeWidth: Float = DEFAULT_STROKE) = icon("ChevronDown", strokeWidth, "m6 9 6 6 6-6")

    /** O balão com três barras de `BraidAssistantIcon` (`navigation-icons.tsx`), usado no “Chat com IA”. */
    fun braidAssistant(strokeWidth: Float = DEFAULT_STROKE) =
        icon(
            "BraidAssistant",
            strokeWidth,
            "M3.8 16.8A9 9 0 1 1 7.2 20L2.8 21.2Z",
            "M8.5 10v4",
            "M12 8v8",
            "M15.5 10v4",
        )
}
