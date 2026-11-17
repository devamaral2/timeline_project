package app.braid.mobile.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
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
