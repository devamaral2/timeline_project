package app.braid.mobile.ui.event

import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import app.braid.mobile.core.designsystem.DarkTokens
import app.braid.mobile.core.designsystem.LightTokens
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme

/** Os tokens do detalhe que o `colorScheme` do Material não expressa: cor por tipo e calorias. */
internal data class EventDetailPalette(
    val routine: Color,
    val meal: Color,
    val training: Color,
    val sleep: Color,
    val kcalBurned: Color,
    val kcalConsumed: Color,
)

@Composable
internal fun eventDetailPalette(): EventDetailPalette =
    if (LocalBraidDarkTheme.current) {
        EventDetailPalette(
            routine = DarkTokens.routine,
            meal = DarkTokens.meal,
            training = DarkTokens.training,
            sleep = DarkTokens.sleep,
            kcalBurned = DarkTokens.destructive,
            kcalConsumed = Color(0xFF7BD08A),
        )
    } else {
        EventDetailPalette(
            routine = LightTokens.routine,
            meal = LightTokens.meal,
            training = LightTokens.training,
            sleep = LightTokens.sleep,
            kcalBurned = LightTokens.destructive,
            kcalConsumed = Color(0xFF257C3A),
        )
    }
