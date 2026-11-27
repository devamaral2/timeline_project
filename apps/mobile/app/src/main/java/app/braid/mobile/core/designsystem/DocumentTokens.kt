package app.braid.mobile.core.designsystem

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.Color

/** As cores dos artefatos que o `colorScheme` não carrega: o sono, o treino, a refeição e os três macronutrientes. */
@Immutable
class DocumentTokens(
    val sleep: Color,
    val training: Color,
    val meal: Color,
    val protein: Color,
    val carbohydrates: Color,
    val fat: Color,
    /** `--faint`: a legenda em mono e o ícone de recolher. */
    val faint: Color,
)

/** O matiz das gorduras (`--macro-fat` do web): a luminosidade e o croma das tags, num rosa. */
private const val FAT_HUE = 340.0

internal fun documentTokensFor(dark: Boolean): DocumentTokens {
    val lightness = if (dark) DarkTokens.tagLightness else LightTokens.tagLightness
    val chroma = if (dark) DarkTokens.tagChroma else LightTokens.tagChroma
    return DocumentTokens(
        sleep = if (dark) DarkTokens.sleep else LightTokens.sleep,
        training = if (dark) DarkTokens.training else LightTokens.training,
        meal = if (dark) DarkTokens.meal else LightTokens.meal,
        protein = if (dark) DarkTokens.routine else LightTokens.routine,
        carbohydrates = if (dark) DarkTokens.meal else LightTokens.meal,
        fat = Color(0xFF000000.toInt() or oklchRgb(FAT_HUE, lightness, chroma)),
        // No claro `--faint` é o `--muted-foreground`; no escuro tem valor próprio, lido do `globals.css` pelo gerador.
        faint = if (dark) DarkTokens.faint else LightTokens.faint,
    )
}

@Composable
fun documentTokens(): DocumentTokens {
    val dark = LocalBraidDarkTheme.current
    return remember(dark) { documentTokensFor(dark) }
}
