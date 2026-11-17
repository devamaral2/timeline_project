package app.braid.mobile.ui.taskedit

import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.svgCircle

/** Os ícones do lucide-react que o formulário usa, na grade de 24 (`Pencil`, `Plus`, `X`, `Clock`). */
object TaskEditIcons {
    val pencil =
        listOf(
            SvgPart(
                "M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z",
            ),
            SvgPart("m15 5 4 4"),
        )

    val plus = listOf(SvgPart("M5 12h14"), SvgPart("M12 5v14"))

    val x = listOf(SvgPart("M18 6 6 18"), SvgPart("m6 6 12 12"))

    val clock = listOf(SvgPart(svgCircle(12f, 12f, 10f)), SvgPart("M12 6v6l4 2"))
}
