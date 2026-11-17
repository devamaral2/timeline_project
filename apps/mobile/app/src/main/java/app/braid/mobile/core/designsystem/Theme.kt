package app.braid.mobile.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

/** Se o tema ativo é a Noite; lido por quem escolhe tokens fora do `colorScheme`, como a marca. */
val LocalBraidDarkTheme = staticCompositionLocalOf { false }

/** Névoa ou Noite, seguindo o esquema do sistema como o web faz sem escolha salva. */
@Composable
fun BraidTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit,
) {
    CompositionLocalProvider(LocalBraidDarkTheme provides darkTheme) {
        MaterialTheme(
            colorScheme = if (darkTheme) BraidDarkColorScheme else BraidLightColorScheme,
            typography = BraidTypography,
            shapes = BraidShapes,
            content = content,
        )
    }
}

/** `--brand` do tema ativo: o ponto verde-água da marca e o foco dos campos. */
@Composable
fun braidBrand(): Color = if (LocalBraidDarkTheme.current) DarkTokens.brand else LightTokens.brand

/** Os tokens do tema ativo que o `colorScheme` do Material não carrega: o web os usa pelo nome. */
@Immutable
class BraidTokens(
    val brand: Color,
    val brandAccent: Color,
    val brandSoft: Color,
    val routine: Color,
    val warning: Color,
    val success: Color,
    /** `--mode-all`, a pílula da aba com "Todas as tarefas": no web é o mesmo âmbar nos dois temas. */
    val modeAll: Color,
    /** `--on-primary-brand`: o ponto de hoje sobre o dia escolhido. */
    val onPrimaryBrand: Color,
)

private val LightBraidTokens =
    BraidTokens(
        brand = LightTokens.brand,
        brandAccent = LightTokens.brandAccent,
        brandSoft = LightTokens.brandSoft,
        routine = LightTokens.routine,
        warning = LightTokens.warning,
        success = LightTokens.success,
        modeAll = DarkTokens.meal,
        onPrimaryBrand = LightTokens.strandDestaque,
    )

private val DarkBraidTokens =
    BraidTokens(
        brand = DarkTokens.brand,
        brandAccent = DarkTokens.brandAccent,
        brandSoft = DarkTokens.brandSoft,
        routine = DarkTokens.routine,
        warning = DarkTokens.warning,
        success = DarkTokens.success,
        modeAll = DarkTokens.meal,
        onPrimaryBrand = DarkTokens.strandDestaque,
    )

@Composable
fun braidTokens(): BraidTokens = if (LocalBraidDarkTheme.current) DarkBraidTokens else LightBraidTokens
