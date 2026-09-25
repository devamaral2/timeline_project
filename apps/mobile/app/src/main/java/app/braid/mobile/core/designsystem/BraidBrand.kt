package app.braid.mobile.core.designsystem

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

private val WaveBarHeights = listOf(8f, 15f, 11f, 6f)

@Composable
@Suppress("ktlint:standard:function-naming")
fun BraidLogo(
    modifier: Modifier = Modifier,
    size: Dp = 32.dp,
    contentDescription: String? = "Braid",
) {
    val accentColor = MaterialTheme.colorScheme.tertiary
    val brandBrush =
        Brush.linearGradient(
            colors = listOf(MaterialTheme.colorScheme.primary, MaterialTheme.colorScheme.tertiary),
            start = Offset(4f, 28f),
            end = Offset(28f, 4f),
        )

    Canvas(
        modifier =
            modifier
                .size(size)
                .semantics {
                    contentDescription?.let { this.contentDescription = it }
                },
    ) {
        val scale = this.size.minDimension / 32f
        val center = Offset(16f * scale, 16f * scale)
        drawCircle(
            brush = brandBrush,
            radius = 13f * scale,
            center = center,
            style = Stroke(width = 2f * scale),
        )

        WaveBarHeights.forEachIndexed { index, height ->
            val x = (10.5f + index * 3.5f) * scale
            val top = (16f - height / 2f) * scale
            drawRoundRect(
                brush = brandBrush,
                topLeft = Offset(x, top),
                size = Size(2f * scale, height * scale),
                cornerRadius = CornerRadius(1f * scale),
            )
        }

        val sparkle =
            Path().apply {
                moveTo(26f * scale, 3.5f * scale)
                lineTo(26.9f * scale, 6.1f * scale)
                lineTo(29.5f * scale, 7f * scale)
                lineTo(26.9f * scale, 7.9f * scale)
                lineTo(26f * scale, 10.5f * scale)
                lineTo(25.1f * scale, 7.9f * scale)
                lineTo(22.5f * scale, 7f * scale)
                lineTo(25.1f * scale, 6.1f * scale)
                close()
            }
        drawPath(path = sparkle, color = accentColor)
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
fun BraidWordmark(
    style: TextStyle,
    modifier: Modifier = Modifier,
    logoSize: Dp = 32.dp,
) {
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BraidLogo(size = logoSize, contentDescription = null)
        Text(text = "Braid", style = style, color = MaterialTheme.colorScheme.primary)
    }
}
