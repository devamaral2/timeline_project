package app.braid.mobile.core.designsystem

import androidx.compose.material3.Typography
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import app.braid.mobile.R

/*
 * As três vozes do web (`apps/web/src/fonts`): Figtree na interface, Newsreader
 * nos títulos e na assinatura, JetBrains Mono onde o número é dado técnico.
 * Os `.ttf` em `res/font` são cópias dos do web, todos variáveis.
 */

@OptIn(ExperimentalTextApi::class)
private fun variable(
    resId: Int,
    weight: FontWeight,
    style: FontStyle = FontStyle.Normal,
) = Font(
    resId = resId,
    weight = weight,
    style = style,
    variationSettings = FontVariation.Settings(FontVariation.weight(weight.weight)),
)

/** `font-sans` do web: interface e leitura. */
val BraidSansFont =
    FontFamily(
        variable(R.font.figtree, FontWeight.Normal),
        variable(R.font.figtree, FontWeight.Medium),
        variable(R.font.figtree, FontWeight.SemiBold),
        variable(R.font.figtree, FontWeight.Bold),
    )

/** `font-display` do web: títulos e a assinatura. */
val BraidDisplayFont =
    FontFamily(
        variable(R.font.newsreader, FontWeight.Normal),
        variable(R.font.newsreader, FontWeight.Medium),
        variable(R.font.newsreader_italic, FontWeight.Normal, FontStyle.Italic),
        variable(R.font.newsreader_italic, FontWeight.Medium, FontStyle.Italic),
    )

/** `font-mono` do web: rótulos de campo, códigos e valores. */
val BraidMonoFont =
    FontFamily(
        variable(R.font.jetbrains_mono, FontWeight.Normal),
        variable(R.font.jetbrains_mono, FontWeight.Medium),
    )

private fun display(
    size: Float,
    lineHeight: Float,
    weight: FontWeight = FontWeight.Normal,
) = TextStyle(
    fontFamily = BraidDisplayFont,
    fontWeight = weight,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = (-0.01).em,
)

private fun sans(
    size: Float,
    lineHeight: Float,
    weight: FontWeight = FontWeight.Normal,
) = TextStyle(fontFamily = BraidSansFont, fontWeight = weight, fontSize = size.sp, lineHeight = lineHeight.sp)

/** A escala do web: display na Newsreader, títulos, corpo e rótulos na Figtree, 12sp no mínimo. */
val BraidTypography =
    Typography(
        displayLarge = display(52f, 52f),
        displayMedium = display(32f, 35.2f, FontWeight.Medium).copy(letterSpacing = (-0.015).em),
        displaySmall = display(30f, 30f),
        headlineLarge = display(32f, 35.2f, FontWeight.Medium).copy(letterSpacing = (-0.015).em),
        headlineMedium = display(26f, 28.6f),
        headlineSmall = display(22f, 25f),
        titleLarge = sans(17f, 23f, FontWeight.SemiBold),
        titleMedium = sans(15f, 21f, FontWeight.SemiBold),
        titleSmall = sans(13f, 18f, FontWeight.SemiBold),
        bodyLarge = sans(16f, 24f),
        bodyMedium = sans(15f, 23f),
        bodySmall = sans(13f, 19.5f),
        labelLarge = sans(13f, 18f, FontWeight.Medium),
        labelMedium = sans(12f, 16f, FontWeight.Medium),
        labelSmall = sans(12f, 16f, FontWeight.SemiBold),
    )
