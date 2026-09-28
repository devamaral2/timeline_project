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
 * As três vozes do Braid, as mesmas fontes variáveis do web
 * (`apps/web/src/fonts`): Figtree na interface, Newsreader nos títulos e na
 * assinatura, JetBrains Mono só onde o número é dado técnico.
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

/** Interface e leitura, igual ao `font-sans` do web. */
val BraidSansFont =
    FontFamily(
        variable(R.font.figtree, FontWeight.Normal),
        variable(R.font.figtree, FontWeight.Medium),
        variable(R.font.figtree, FontWeight.SemiBold),
        variable(R.font.figtree, FontWeight.Bold),
    )

/** Títulos, assinatura e números de duração, igual ao `font-display` do web. */
val BraidDisplayFont =
    FontFamily(
        variable(R.font.newsreader, FontWeight.Normal),
        variable(R.font.newsreader, FontWeight.Medium),
        variable(R.font.newsreader_italic, FontWeight.Normal, FontStyle.Italic),
        variable(R.font.newsreader_italic, FontWeight.Medium, FontStyle.Italic),
    )

/** Cronômetro, códigos e valores, igual ao `font-mono` do web. */
val BraidMonoFont =
    FontFamily(
        variable(R.font.jetbrains_mono, FontWeight.Normal),
        variable(R.font.jetbrains_mono, FontWeight.Medium),
    )

/** O cronômetro do evento em andamento: JetBrains Mono 500, 22. */
val BraidStopwatchStyle =
    TextStyle(
        fontFamily = BraidMonoFont,
        fontWeight = FontWeight.Medium,
        fontSize = 22.sp,
        letterSpacing = (-0.02).em,
    )

/** Códigos e valores de token: JetBrains Mono 400, 12. */
val BraidMonoStyle =
    TextStyle(
        fontFamily = BraidMonoFont,
        fontSize = 12.sp,
    )

private fun display(
    size: Float,
    lineHeight: Float,
) = TextStyle(
    fontFamily = BraidDisplayFont,
    fontWeight = FontWeight.Normal,
    fontSize = size.sp,
    lineHeight = lineHeight.sp,
    letterSpacing = (-0.01).em,
)

/**
 * A escala de `design system/Tipografia-html/`: display na Newsreader,
 * títulos, corpo e rótulos na Figtree. O espaçamento aberto dos rótulos em
 * maiúsculas (`label` +0,12em, `tag` +0,1em) só entra junto do `uppercase()`,
 * em quem usa — os mesmos estilos também servem texto corrido pequeno.
 */
val BraidTypography =
    Typography(
        // display-lg: detalhe do evento, assinatura.
        displayLarge = display(52f, 52f),
        // display-md: título de página no celular.
        displayMedium = display(40f, 40f),
        // numeral: duração no cartão.
        displaySmall = display(30f, 30f),
        headlineLarge = display(32f, 35f),
        // display-sm: cabeçalho de dia.
        headlineMedium = display(26f, 28.6f),
        headlineSmall = display(22f, 25f),
        titleLarge =
            TextStyle(
                fontFamily = BraidSansFont,
                fontWeight = FontWeight.SemiBold,
                fontSize = 17.sp,
                lineHeight = 23.sp,
            ),
        // title: nome do evento, título de cartão.
        titleMedium =
            TextStyle(
                fontFamily = BraidSansFont,
                fontWeight = FontWeight.SemiBold,
                fontSize = 15.sp,
                lineHeight = 21.sp,
            ),
        titleSmall =
            TextStyle(
                fontFamily = BraidSansFont,
                fontWeight = FontWeight.SemiBold,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            ),
        bodyLarge =
            TextStyle(
                fontFamily = BraidSansFont,
                fontSize = 16.sp,
                lineHeight = 24.sp,
            ),
        // body: leitura.
        bodyMedium =
            TextStyle(
                fontFamily = BraidSansFont,
                fontSize = 15.sp,
                lineHeight = 23.sp,
            ),
        // small: horário, apoio.
        bodySmall =
            TextStyle(
                fontFamily = BraidSansFont,
                fontSize = 13.sp,
                lineHeight = 19.5.sp,
            ),
        labelLarge =
            TextStyle(
                fontFamily = BraidSansFont,
                fontWeight = FontWeight.Medium,
                fontSize = 13.sp,
                lineHeight = 18.sp,
            ),
        // label: rótulo de seção.
        labelMedium =
            TextStyle(
                fontFamily = BraidSansFont,
                fontWeight = FontWeight.Medium,
                fontSize = 11.sp,
                lineHeight = 14.sp,
            ),
        // tag: selos.
        labelSmall =
            TextStyle(
                fontFamily = BraidSansFont,
                fontWeight = FontWeight.SemiBold,
                fontSize = 10.sp,
                lineHeight = 14.sp,
            ),
    )
