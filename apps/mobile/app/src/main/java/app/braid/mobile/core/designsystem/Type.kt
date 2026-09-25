package app.braid.mobile.core.designsystem

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import app.braid.mobile.R

/** Corpo do produto, igual ao `--mockup-body-font` do web. */
val BraidBodyFont =
    FontFamily(
        Font(R.font.manrope, FontWeight.Normal),
        Font(R.font.manrope, FontWeight.Medium),
        Font(R.font.manrope, FontWeight.SemiBold),
        Font(R.font.manrope, FontWeight.Bold),
    )

/** Tipografia de marca, igual ao `--mockup-brand-font` do web. */
val BraidBrandFont =
    FontFamily(
        Font(R.font.outfit, FontWeight.Normal),
        Font(R.font.outfit, FontWeight.Medium),
        Font(R.font.outfit, FontWeight.SemiBold),
        Font(R.font.outfit, FontWeight.Bold),
    )

/** Escala inicial portada dos tamanhos usados nos mockups do web. */
val BraidTypography =
    Typography(
        displayLarge =
            TextStyle(
                fontFamily = BraidBrandFont,
                fontSize = 52.sp,
                lineHeight = 65.sp,
                fontWeight = FontWeight.Medium,
            ),
        headlineLarge =
            TextStyle(
                fontFamily = BraidBrandFont,
                fontSize = 39.sp,
                lineHeight = 49.sp,
                fontWeight = FontWeight.Medium,
            ),
        titleLarge =
            TextStyle(
                fontFamily = BraidBrandFont,
                fontSize = 21.sp,
                lineHeight = 27.sp,
                fontWeight = FontWeight.Medium,
            ),
        bodyLarge =
            TextStyle(
                fontFamily = BraidBodyFont,
                fontSize = 16.sp,
                lineHeight = 24.sp,
            ),
        bodyMedium =
            TextStyle(
                fontFamily = BraidBodyFont,
                fontSize = 14.sp,
                lineHeight = 21.sp,
            ),
        bodySmall =
            TextStyle(
                fontFamily = BraidBodyFont,
                fontSize = 12.sp,
                lineHeight = 18.sp,
            ),
        labelLarge =
            TextStyle(
                fontFamily = BraidBodyFont,
                fontSize = 13.sp,
                lineHeight = 18.sp,
                fontWeight = FontWeight.Medium,
            ),
        labelMedium =
            TextStyle(
                fontFamily = BraidBodyFont,
                fontSize = 11.sp,
                lineHeight = 16.sp,
            ),
        labelSmall =
            TextStyle(
                fontFamily = BraidBodyFont,
                fontSize = 10.sp,
                lineHeight = 14.sp,
            ),
    )
