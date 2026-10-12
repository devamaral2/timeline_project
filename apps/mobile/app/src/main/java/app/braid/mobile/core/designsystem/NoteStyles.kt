package app.braid.mobile.core.designsystem

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp

/** Escala das referências Notas · celular e Nota · detalhe do design system. */
val BraidNoteTitleStyle =
    TextStyle(
        fontFamily = BraidDisplayFont,
        fontWeight = FontWeight.Normal,
        fontSize = 36.sp,
        lineHeight = 37.8.sp,
        letterSpacing = (-0.01).em,
    )

val BraidNoteBodyStyle =
    TextStyle(
        fontFamily = BraidSansFont,
        fontSize = 17.sp,
        lineHeight = 28.9.sp,
    )

val BraidNoteExcerptStyle =
    TextStyle(
        fontFamily = BraidSansFont,
        fontSize = 14.sp,
        lineHeight = 21.sp,
    )
