package app.braid.mobile.core.designsystem

import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable

@Composable
@Suppress("ktlint:standard:function-naming")
fun BraidTheme(
    darkTheme: Boolean = true,
    content: @Composable () -> Unit,
) {
    MaterialTheme(
        colorScheme = if (darkTheme) BraidDarkColorScheme else BraidLightColorScheme,
        typography = BraidTypography,
        content = content,
    )
}
