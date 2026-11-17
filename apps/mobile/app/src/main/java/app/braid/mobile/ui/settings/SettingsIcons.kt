package app.braid.mobile.ui.settings

import app.braid.mobile.core.designsystem.SvgPart
import app.braid.mobile.core.designsystem.svgCircle

/** Os ícones da tela de configurações: os mesmos SVG do web (lucide), na grade de 24. */
internal object SettingsIcons {
    val arrowLeft = listOf(SvgPart("m12 19-7-7 7-7"), SvgPart("M19 12H5"))
    val moon =
        listOf(
            SvgPart("M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"),
        )
    val sun =
        listOf(
            SvgPart(svgCircle(12f, 12f, 4f)),
            SvgPart("M12 2v2"),
            SvgPart("M12 20v2"),
            SvgPart("m4.93 4.93 1.41 1.41"),
            SvgPart("m17.66 17.66 1.41 1.41"),
            SvgPart("M2 12h2"),
            SvgPart("M20 12h2"),
            SvgPart("m6.34 17.66-1.41 1.41"),
            SvgPart("m19.07 4.93-1.41 1.41"),
        )
    val logOut = listOf(SvgPart("m16 17 5-5-5-5"), SvgPart("M21 12H9"), SvgPart("M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"))
}
