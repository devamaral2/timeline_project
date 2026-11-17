package app.braid.mobile.core.designsystem

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

/**
 * Os ícones das três abas da barra inferior. São desenhos próprios (não vêm do
 * Lucide), na grade de 24: os mesmos traçados de `components/ui/nav-icons.tsx`
 * no web.
 */
object NavIcons {
    private val cache = HashMap<String, ImageVector>()

    private fun icon(
        name: String,
        strokeWidth: Float,
        strokes: List<String>,
        fills: List<String> = emptyList(),
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
                    strokes.forEach { data ->
                        addPath(
                            pathData = addPathNodes(data),
                            stroke = SolidColor(Color.Black),
                            strokeLineWidth = strokeWidth,
                            strokeLineCap = StrokeCap.Round,
                            strokeLineJoin = StrokeJoin.Round,
                        )
                    }
                    fills.forEach { data ->
                        addPath(pathData = addPathNodes(data), fill = SolidColor(Color.Black))
                    }
                }.build()
        }

    /** Tarefas: a caixa aberta num canto, com o check saindo por ele. */
    fun tasks(strokeWidth: Float = LucideIcons.NAV_STROKE) =
        icon(
            "NavTasks",
            strokeWidth,
            strokes =
                listOf(
                    "M20.5 12v6.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2H15",
                    "M8 11l3.5 3.5L21.5 4",
                ),
        )

    /** Agenda: o calendário com um só dia marcado, à esquerda. */
    fun agenda(strokeWidth: Float = LucideIcons.NAV_STROKE) =
        icon(
            "NavAgenda",
            strokeWidth,
            strokes =
                listOf(
                    "M8 2v4",
                    "M16 2v4",
                    "M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
                    "M3 10h18",
                ),
            fills =
                listOf(
                    "M7.55 13.25h2.15a1.3 1.3 0 0 1 1.3 1.3v2.15a1.3 1.3 0 0 1-1.3 1.3H7.55a1.3 1.3 0 0 1-1.3-1.3v-2.15a1.3 1.3 0 0 1 1.3-1.3z",
                ),
        )

    /** Documentos: duas páginas empilhadas, a da frente com as linhas do texto. */
    fun documents(strokeWidth: Float = LucideIcons.NAV_STROKE) =
        icon(
            "NavDocuments",
            strokeWidth,
            strokes =
                listOf(
                    "M5.5 6.5h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2z",
                    "M7 11.5h6",
                    "M7 15.5h4",
                    "M8 2.75h10.5a2 2 0 0 1 2 2V18",
                ),
        )
}
