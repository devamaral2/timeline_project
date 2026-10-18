package app.braid.mobile.core.designsystem

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

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

/** O verde da marca (`--brand`) do tema ativo: pontos de seleção, ícone de busca e seleção ativa. */
@Composable
fun braidBrand(): Color = if (LocalBraidDarkTheme.current) DarkTokens.brand else LightTokens.brand

/** O fundo suave da marca (`--brand-soft`) do tema ativo, usado na opção escolhida de um seletor. */
@Composable
fun braidBrandSoft(): Color = if (LocalBraidDarkTheme.current) DarkTokens.brandSoft else LightTokens.brandSoft

/** Os três fios da marca (`--strand-*`) do tema ativo: a trança do chat com IA. */
@Composable
fun braidStrandNevoa(): Color = if (LocalBraidDarkTheme.current) DarkTokens.strandNevoa else LightTokens.strandNevoa

@Composable
fun braidStrandDestaque(): Color = if (LocalBraidDarkTheme.current) DarkTokens.strandDestaque else LightTokens.strandDestaque

@Composable
fun braidStrandTinta(): Color = if (LocalBraidDarkTheme.current) DarkTokens.strandTinta else LightTokens.strandTinta
