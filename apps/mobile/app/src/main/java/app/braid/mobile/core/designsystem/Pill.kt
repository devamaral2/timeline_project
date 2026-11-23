package app.braid.mobile.core.designsystem

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** O botão em pílula do web (`pill` de `controls.module.css`): contorno fino, 40dp de altura, texto de 14sp. */
@Composable
fun BraidPill(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    brandDot: Boolean = false,
    horizontalPadding: Dp = 16.dp,
) {
    Surface(
        onClick = onClick,
        modifier = modifier.defaultMinSize(minHeight = 40.dp),
        shape = CircleShape,
        color = Color.Transparent,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
    ) {
        Row(
            modifier = Modifier.defaultMinSize(minHeight = 40.dp).padding(horizontal = horizontalPadding),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (brandDot) {
                Box(Modifier.size(6.dp).background(braidTokens().brand, CircleShape))
                Spacer(Modifier.width(8.dp))
            }
            Text(text = text, color = MaterialTheme.colorScheme.onBackground, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
        }
    }
}
