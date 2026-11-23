package app.braid.mobile.core.designsystem

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.sin

/*
 * As cores de tag do `packages/theme`: o matiz sai de um hash do nome e a
 * luminosidade e o croma vêm do tema, então toda tag combina com o resto da UI.
 * O hash e a conversão OKLCH → sRGB são os de `theme.ts` e `oklch.ts`, conferidos
 * contra as funções TS (`TagColorsTest`).
 */

private const val HASH_MULTIPLIER = 31L
private const val UINT_MASK = 0xFFFFFFFFL
private const val HUES = 360
private const val CHANNEL_MAX = 255

/** O matiz (0 a 359) estável de uma tag: o hash de 31 sobre as unidades UTF-16 do nome, sem sinal de 32 bits. */
fun hueForTag(name: String): Int {
    var hash = 0L
    for (unit in name) hash = (hash * HASH_MULTIPLIER + unit.code) and UINT_MASK
    return (hash % HUES).toInt()
}

private fun gammaEncode(channel: Double): Int {
    val clamped = channel.coerceIn(0.0, 1.0)
    val encoded = if (clamped <= 0.0031308) 12.92 * clamped else 1.055 * clamped.pow(1 / 2.4) - 0.055
    return Math.round(encoded * CHANNEL_MAX).toInt()
}

/** `0xRRGGBB` da cor OKLCH com o matiz da tag; um canal fora do gamut sRGB é preso. */
fun tagRgb(
    name: String,
    lightness: Float,
    chroma: Float,
): Int = oklchRgb(hueForTag(name).toDouble(), lightness, chroma)

/** `0xRRGGBB` da cor OKLCH de matiz [hue] (em graus), preso ao gamut sRGB. */
fun oklchRgb(
    hue: Double,
    lightness: Float,
    chroma: Float,
): Int {
    val radians = Math.toRadians(hue)
    val a = chroma.toDouble() * cos(radians)
    val b = chroma.toDouble() * sin(radians)
    val l = lightness.toDouble()

    val long = (l + 0.3963377774 * a + 0.2158037573 * b).let { it * it * it }
    val medium = (l - 0.1055613458 * a - 0.0638541728 * b).let { it * it * it }
    val short = (l - 0.0894841775 * a - 1.291485548 * b).let { it * it * it }

    val red = gammaEncode(4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short)
    val green = gammaEncode(-1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short)
    val blue = gammaEncode(-0.0041960863 * long - 0.7034186147 * medium + 1.707614701 * short)
    return (red shl 16) or (green shl 8) or blue
}

/** O texto e o fundo suave (alfa 0,14) de um chip de tag no tema ativo. */
data class TagColors(
    val color: Color,
    val background: Color,
)

private const val TAG_BACKGROUND_ALPHA = 0.14f

@Composable
fun tagColors(name: String): TagColors {
    val dark = LocalBraidDarkTheme.current
    val rgb =
        tagRgb(
            name,
            if (dark) DarkTokens.tagLightness else LightTokens.tagLightness,
            if (dark) DarkTokens.tagChroma else LightTokens.tagChroma,
        )
    val solid = Color(0xFF000000.toInt() or rgb)
    return TagColors(color = solid, background = solid.copy(alpha = TAG_BACKGROUND_ALPHA))
}
