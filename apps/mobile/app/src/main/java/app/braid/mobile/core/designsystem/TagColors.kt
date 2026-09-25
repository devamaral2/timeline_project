package app.braid.mobile.core.designsystem

import androidx.compose.ui.graphics.Color
import kotlin.math.pow

data class BraidTagColors(
    val color: Color,
    val backgroundColor: Color,
)

/** O mesmo hash UTF-16 do web (`packages/theme/src/theme.ts`). */
fun hueForTag(name: String): Int {
    var hash = 0L
    for (character in name) {
        hash = (hash * 31L + character.code.toLong()) and 0xFFFF_FFFFL
    }
    return (hash % 360L).toInt()
}

/**
 * Porta de `tagColors`: tags têm o matiz derivado do nome e usam a luminosidade
 * e o croma do tema ativo. A conversão é a mesma matriz OKLCH → sRGB do web.
 */
fun tagColors(
    name: String,
    darkTheme: Boolean = true,
): BraidTagColors {
    val lightness = if (darkTheme) DarkTokens.tagLightness else LightTokens.tagLightness
    val chroma = if (darkTheme) DarkTokens.tagChroma else LightTokens.tagChroma
    val hue = hueForTag(name).toFloat()
    return BraidTagColors(
        color = oklchColor(lightness, chroma, hue, 1f),
        backgroundColor = oklchColor(lightness, chroma, hue, 0.14f),
    )
}

private fun oklchColor(
    lightness: Float,
    chroma: Float,
    hue: Float,
    alpha: Float,
): Color {
    val radians = Math.toRadians(hue.toDouble())
    val a = chroma * kotlin.math.cos(radians).toFloat()
    val b = chroma * kotlin.math.sin(radians).toFloat()

    val longCubeRoot = lightness + 0.3963377774f * a + 0.2158037573f * b
    val mediumCubeRoot = lightness - 0.1055613458f * a - 0.0638541728f * b
    val shortCubeRoot = lightness - 0.0894841775f * a - 1.291485548f * b
    val long = longCubeRoot * longCubeRoot * longCubeRoot
    val medium = mediumCubeRoot * mediumCubeRoot * mediumCubeRoot
    val short = shortCubeRoot * shortCubeRoot * shortCubeRoot

    return Color(
        red = gammaEncode(4.0767416621f * long - 3.3077115913f * medium + 0.2309699292f * short),
        green = gammaEncode(-1.2684380046f * long + 2.6097574011f * medium - 0.3413193965f * short),
        blue = gammaEncode(-0.0041960863f * long - 0.7034186147f * medium + 1.707614701f * short),
        alpha = alpha,
    )
}

private fun gammaEncode(channel: Float): Float {
    val clamped = channel.coerceIn(0f, 1f)
    return if (clamped <= 0.0031308f) {
        12.92f * clamped
    } else {
        (1.055f * clamped.toDouble().pow(1.0 / 2.4) - 0.055).toFloat()
    }
}
