// GERADO por scripts/mobile/generate-theme.ts — não edite
// A fonte da verdade está em packages/theme/src/tokens.ts.

package app.braid.mobile.core.designsystem

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

internal object DarkTokens {
    val background = Color(0xFF0F131C)
    val foreground = Color(0xFFFFFFFF)
    val card = Color(0xFF1A1F2B)
    val cardForeground = Color(0xFFFFFFFF)
    val primary = Color(0xFF7C4DFF)
    val primaryForeground = Color(0xFFFFFFFF)
    val secondary = Color(0xFF232A38)
    val secondaryForeground = Color(0xFFFFFFFF)
    val muted = Color(0xFF232A38)
    val mutedForeground = Color(0xFF94A0B8)
    val accent = Color(0xFF262E3D)
    val accentForeground = Color(0xFFFFFFFF)
    val destructive = Color(0xFFFF5C7A)
    val destructiveForeground = Color(0xFF12161F)
    val warning = Color(0xFFFFB14A)
    val success = Color(0xFF6FDA75)
    val border = Color(0x14FFFFFF)
    val input = Color(0x1FFFFFFF)
    val ring = Color(0xFF7C4DFF)
    val brand = Color(0xFF7C4DFF)
    val brandAccent = Color(0xFF4CC9FF)
    val sleep = Color(0xFF7C4DFF)
    val training = Color(0xFF22D3A6)
    val meal = Color(0xFFFFB14A)
    val routine = Color(0xFF4CC9FF)
    val tagLightness = 0.78f
    val tagChroma = 0.13f
}

internal object LightTokens {
    val background = Color(0xFFF6F7FB)
    val foreground = Color(0xFF131722)
    val card = Color(0xFFFFFFFF)
    val cardForeground = Color(0xFF131722)
    val primary = Color(0xFF6A33F0)
    val primaryForeground = Color(0xFFFFFFFF)
    val secondary = Color(0xFFEDEFF6)
    val secondaryForeground = Color(0xFF131722)
    val muted = Color(0xFFEDEFF6)
    val mutedForeground = Color(0xFF5C6478)
    val accent = Color(0xFFE5E9F4)
    val accentForeground = Color(0xFF131722)
    val destructive = Color(0xFFD92A55)
    val destructiveForeground = Color(0xFFFFFFFF)
    val warning = Color(0xFFB8700C)
    val success = Color(0xFF409D48)
    val border = Color(0xFFE2E5EF)
    val input = Color(0xFFE2E5EF)
    val ring = Color(0xFF6A33F0)
    val brand = Color(0xFF6A33F0)
    val brandAccent = Color(0xFF0E86C7)
    val sleep = Color(0xFF6A33F0)
    val training = Color(0xFF06A87F)
    val meal = Color(0xFFB8700C)
    val routine = Color(0xFF0E86C7)
    val tagLightness = 0.52f
    val tagChroma = 0.15f
}

internal val BraidDarkColorScheme =
    darkColorScheme(
        primary = DarkTokens.primary,
        onPrimary = DarkTokens.primaryForeground,
        primaryContainer = DarkTokens.secondary,
        onPrimaryContainer = DarkTokens.secondaryForeground,
        secondary = DarkTokens.secondary,
        onSecondary = DarkTokens.secondaryForeground,
        secondaryContainer = DarkTokens.accent,
        onSecondaryContainer = DarkTokens.accentForeground,
        tertiary = DarkTokens.brandAccent,
        onTertiary = DarkTokens.background,
        tertiaryContainer = DarkTokens.routine,
        onTertiaryContainer = DarkTokens.foreground,
        background = DarkTokens.background,
        onBackground = DarkTokens.foreground,
        surface = DarkTokens.card,
        onSurface = DarkTokens.cardForeground,
        surfaceVariant = DarkTokens.muted,
        onSurfaceVariant = DarkTokens.mutedForeground,
        outline = DarkTokens.border,
        outlineVariant = DarkTokens.input,
        error = DarkTokens.destructive,
        onError = DarkTokens.destructiveForeground,
        errorContainer = DarkTokens.warning,
        onErrorContainer = DarkTokens.background,
        inverseSurface = DarkTokens.foreground,
        inverseOnSurface = DarkTokens.background,
        inversePrimary = DarkTokens.primary,
        scrim = Color.Black,
    )

internal val BraidLightColorScheme =
    lightColorScheme(
        primary = LightTokens.primary,
        onPrimary = LightTokens.primaryForeground,
        primaryContainer = LightTokens.secondary,
        onPrimaryContainer = LightTokens.secondaryForeground,
        secondary = LightTokens.secondary,
        onSecondary = LightTokens.secondaryForeground,
        secondaryContainer = LightTokens.accent,
        onSecondaryContainer = LightTokens.accentForeground,
        tertiary = LightTokens.brandAccent,
        onTertiary = LightTokens.background,
        tertiaryContainer = LightTokens.routine,
        onTertiaryContainer = LightTokens.foreground,
        background = LightTokens.background,
        onBackground = LightTokens.foreground,
        surface = LightTokens.card,
        onSurface = LightTokens.cardForeground,
        surfaceVariant = LightTokens.muted,
        onSurfaceVariant = LightTokens.mutedForeground,
        outline = LightTokens.border,
        outlineVariant = LightTokens.input,
        error = LightTokens.destructive,
        onError = LightTokens.destructiveForeground,
        errorContainer = LightTokens.warning,
        onErrorContainer = LightTokens.background,
        inverseSurface = LightTokens.foreground,
        inverseOnSurface = LightTokens.background,
        inversePrimary = LightTokens.primary,
        scrim = Color.Black,
    )
