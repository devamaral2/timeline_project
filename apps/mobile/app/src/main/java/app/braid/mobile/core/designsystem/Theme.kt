package app.braid.mobile.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf

/** Se o tema ativo é a Noite; lido por quem precisa escolher tokens fora do `colorScheme`, como as tags. */
val LocalBraidDarkTheme = staticCompositionLocalOf { false }

/**
 * Névoa ou Noite, seguindo o esquema do sistema — como o web, que também abre
 * pelo sistema e cai na Névoa sem preferência.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
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
