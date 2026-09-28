// GERADO por scripts/mobile/generate-theme.ts — não edite
// A fonte da verdade está em packages/theme/src/tokens.ts.

package app.braid.mobile.core.designsystem

import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.ui.graphics.Color

internal object DarkTokens {
    val background = Color(0xFF141F29)
    val foreground = Color(0xFFEAF2F3)
    val card = Color(0xFF1F2B35)
    val cardForeground = Color(0xFFEAF2F3)
    val primary = Color(0xFFEAF2F3)
    val primaryForeground = Color(0xFF1F2B35)
    val secondary = Color(0xFF2B3741)
    val secondaryForeground = Color(0xFFEAF2F3)
    val muted = Color(0xFF2B3741)
    val mutedForeground = Color(0xFF9BAFB7)
    val accent = Color(0xFF333F49)
    val accentForeground = Color(0xFFEAF2F3)
    val destructive = Color(0xFFFDA0A3)
    val destructiveForeground = Color(0xFF1F2B35)
    val warning = Color(0xFFE2B57C)
    val success = Color(0xFF4FC2AB)
    val border = Color(0xFF36414B)
    val input = Color(0xFF47535C)
    val ring = Color(0xFF4FC2AB)
    val brand = Color(0xFF4FC2AB)
    val brandAccent = Color(0xFF6FD3BF)
    val brandSoft = Color(0xFF204744)
    val strandTile = Color(0xFF1F2B35)
    val strandNevoa = Color(0xFF6F929D)
    val strandDestaque = Color(0xFF4FC2AB)
    val strandTinta = Color(0xFFEAF2F3)
    val sleep = Color(0xFFBAB5F5)
    val training = Color(0xFFA5CB90)
    val meal = Color(0xFFE2B57C)
    val routine = Color(0xFF80C8EE)
    val tagLightness = 0.8f
    val tagChroma = 0.08f
}

internal object LightTokens {
    val background = Color(0xFFF1F5F6)
    val foreground = Color(0xFF152429)
    val card = Color(0xFFFFFFFF)
    val cardForeground = Color(0xFF152429)
    val primary = Color(0xFF203D46)
    val primaryForeground = Color(0xFFFFFFFF)
    val secondary = Color(0xFFE5EDF0)
    val secondaryForeground = Color(0xFF152429)
    val muted = Color(0xFFE5EDF0)
    val mutedForeground = Color(0xFF586A70)
    val accent = Color(0xFFDDE6EA)
    val accentForeground = Color(0xFF152429)
    val destructive = Color(0xFFAA474F)
    val destructiveForeground = Color(0xFFFFFFFF)
    val warning = Color(0xFF8F611E)
    val success = Color(0xFF2E8A7A)
    val border = Color(0xFFD9E3E6)
    val input = Color(0xFFB9C9CF)
    val ring = Color(0xFF2E8A7A)
    val brand = Color(0xFF2E8A7A)
    val brandAccent = Color(0xFF1E796B)
    val brandSoft = Color(0xFFE2F5F2)
    val strandTile = Color(0xFFE5EDF0)
    val strandNevoa = Color(0xFFACC4CC)
    val strandDestaque = Color(0xFF3C9F91)
    val strandTinta = Color(0xFF203D46)
    val sleep = Color(0xFF6962A2)
    val training = Color(0xFF52783B)
    val meal = Color(0xFF8F611E)
    val routine = Color(0xFF19759B)
    val tagLightness = 0.53f
    val tagChroma = 0.09f
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
