package app.braid.mobile.ui.chat

import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.svgCircle
import app.braid.mobile.core.designsystem.svgRect

/** Os ícones do chat: os mesmos SVG do web (lucide), na grade de 24, com o `d` copiado. */
internal object ChatIcons {
    val plus = listOf(SvgPart("M5 12h14"), SvgPart("M12 5v14"))
    val close = listOf(SvgPart("M18 6 6 18"), SvgPart("m6 6 12 12"))
    val arrowUp = listOf(SvgPart("m5 12 7-7 7 7"), SvgPart("M12 19V5"))
    val retry = listOf(SvgPart("M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"), SvgPart("M3 3v5h5"))
    val check = listOf(SvgPart("M20 6 9 17l-5-5"))
    val circle = listOf(SvgPart(svgCircle(12f, 12f, 10f)))
    val spinner = listOf(SvgPart("M21 12a9 9 0 1 1-6.219-8.56"))
    val chevronRight = listOf(SvgPart("m9 18 6-6-6-6"))
    val arrowUpRight = listOf(SvgPart("M7 7h10v10"), SvgPart("M7 17 17 7"))

    val calendarDays =
        listOf(
            SvgPart(svgRect(3f, 4f, 18f, 18f, 2f)),
            SvgPart("M16 2v4"),
            SvgPart("M8 2v4"),
            SvgPart("M3 10h18"),
            SvgPart("M8 14h.01"),
            SvgPart("M12 14h.01"),
            SvgPart("M16 14h.01"),
            SvgPart("M8 18h.01"),
            SvgPart("M12 18h.01"),
            SvgPart("M16 18h.01"),
        )
    val fileText =
        listOf(
            SvgPart("M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"),
            SvgPart("M14 2v4a2 2 0 0 0 2 2h4"),
            SvgPart("M10 9H8"),
            SvgPart("M16 13H8"),
            SvgPart("M16 17H8"),
        )
    val bell = listOf(SvgPart("M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"), SvgPart("M10.3 21a1.94 1.94 0 0 0 3.4 0"))
    val settings =
        listOf(
            SvgPart(
                "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 " +
                    ".73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 " +
                    "2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l" +
                    ".15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 " +
                    "0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z",
            ),
            SvgPart(svgCircle(12f, 12f, 3f)),
        )

    // Os tipos de entrada do rastro.
    val traceRequest = listOf(SvgPart("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"))
    val traceRouting =
        listOf(SvgPart("M16 3h5v5"), SvgPart("M8 3H3v5"), SvgPart("M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"), SvgPart("m15 9 6-6"))
    val traceThought =
        listOf(
            SvgPart("M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"),
            SvgPart("M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"),
            SvgPart("M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"),
        )
    val traceAgent =
        listOf(
            SvgPart("M12 8V4H8"),
            SvgPart(svgRect(4f, 8f, 16f, 12f, 2f)),
            SvgPart("M2 14h2"),
            SvgPart("M20 14h2"),
            SvgPart("M15 13v2"),
            SvgPart("M9 13v2"),
        )
    val traceTool =
        listOf(
            SvgPart(
                "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91" +
                    "a6 6 0 " +
                    "0 1 7.94-7.94l-3.76 3.76z",
            ),
        )
    val traceMessage =
        listOf(SvgPart("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"), SvgPart("M13 8H7"), SvgPart("M17 12H7"))
    val traceAnswer = listOf(SvgPart("M20 4v7a4 4 0 0 1-4 4H4"), SvgPart("m9 10-5 5 5 5"))
}
