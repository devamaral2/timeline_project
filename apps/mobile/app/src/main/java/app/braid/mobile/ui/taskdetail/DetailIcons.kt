package app.braid.mobile.ui.taskdetail

import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.core.designsystem.svgRect

/** Os ícones do lucide-react que o detalhe usa, na grade de 24 (`ArrowLeft`, `EllipsisVertical`, `MapPin`, `Trash2`, `AlertTriangle`, `ArrowUp`, `MessageSquare`, `FileText`, `CalendarDays`). */
object DetailIcons {
    val arrowLeft = listOf(SvgPart("m12 19-7-7 7-7"), SvgPart("M19 12H5"))

    val ellipsisVertical = listOf(svgCircle(12f, 12f, 1f), svgCircle(12f, 5f, 1f), svgCircle(12f, 19f, 1f)).map { SvgPart(it) }

    val mapPin =
        listOf(
            SvgPart("M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"),
            SvgPart(svgCircle(12f, 10f, 3f)),
        )

    val trash =
        listOf(
            SvgPart("M3 6h18"),
            SvgPart("M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"),
            SvgPart("M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"),
            SvgPart("M10 11v6"),
            SvgPart("M14 11v6"),
        )

    val alertTriangle =
        listOf(
            SvgPart("m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"),
            SvgPart("M12 9v4"),
            SvgPart("M12 17h.01"),
        )

    val arrowUp = listOf(SvgPart("m5 12 7-7 7 7"), SvgPart("M12 19V5"))

    val messageSquare = listOf(SvgPart("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"))

    val fileText =
        listOf(
            SvgPart("M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"),
            SvgPart("M14 2v4a2 2 0 0 0 2 2h4"),
            SvgPart("M10 9H8"),
            SvgPart("M16 13H8"),
            SvgPart("M16 17H8"),
        )

    val calendarDays =
        listOf(
            SvgPart("M8 2v4"),
            SvgPart("M16 2v4"),
            SvgPart(svgRect(3f, 4f, 18f, 18f, 2f)),
            SvgPart("M3 10h18"),
            SvgPart("M8 14h.01"),
            SvgPart("M12 14h.01"),
            SvgPart("M16 14h.01"),
            SvgPart("M8 18h.01"),
            SvgPart("M12 18h.01"),
            SvgPart("M16 18h.01"),
        )
}
