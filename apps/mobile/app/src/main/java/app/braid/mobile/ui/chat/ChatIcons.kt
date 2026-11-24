package app.braid.mobile.ui.chat

import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.svgCircle

/** Os ícones do chat: os mesmos SVG do web (lucide), na grade de 24, com o `d` copiado. */
internal object ChatIcons {
    val retry = listOf(SvgPart("M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"), SvgPart("M3 3v5h5"))
    val arrowUpRight = listOf(SvgPart("M7 7h10v10"), SvgPart("M7 17 17 7"))
    val copy =
        listOf(
            SvgPart("M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2z"),
            SvgPart("M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"),
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
    val traceRouting =
        listOf(SvgPart("M16 3h5v5"), SvgPart("M8 3H3v5"), SvgPart("M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"), SvgPart("m15 9 6-6"))
    val traceThought =
        listOf(
            SvgPart("M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"),
            SvgPart("M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"),
            SvgPart("M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"),
        )
    val traceMessage =
        listOf(SvgPart("M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"), SvgPart("M13 8H7"), SvgPart("M17 12H7"))
    val traceAnswer = listOf(SvgPart("M20 4v7a4 4 0 0 1-4 4H4"), SvgPart("m9 10-5 5 5 5"))
}
