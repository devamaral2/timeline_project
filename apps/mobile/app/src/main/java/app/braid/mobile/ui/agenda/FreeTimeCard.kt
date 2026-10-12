package app.braid.mobile.ui.agenda

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.DarkTokens
import app.braid.mobile.core.designsystem.LightTokens
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.domain.timeline.FreeTimeSlot
import app.braid.mobile.domain.timeline.durationPartsOfMinutes
import app.braid.mobile.domain.timeline.formatTime
import java.time.Instant

/**
 * O tempo livre entre dois eventos (o `FreeTimeSlot` do `agenda-day.tsx`).
 * Contorno tracejado e sem fundo de cartão, para nunca parecer algo
 * registrado; não é tocável. A duração fica em destaque, como no cartão de
 * evento.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun FreeTimeCard(
    slot: FreeTimeSlot,
    modifier: Modifier = Modifier,
    now: Instant = Instant.now(),
) {
    val dark = LocalBraidDarkTheme.current
    val brand = if (dark) DarkTokens.brand else LightTokens.brand
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val isPast = !now.isBefore(slot.end)
    val isNow = !isPast && !now.isBefore(slot.start)
    val start = formatTime(slot.start.toString())
    val end = if (slot.endsAtMidnight) "24:00" else formatTime(slot.end.toString())
    val dashColor = if (isNow) brand.copy(alpha = 0.6f) else muted.copy(alpha = 0.45f)
    val parts = durationPartsOfMinutes(slot.minutes)

    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .alpha(if (isPast) 0.6f else 1f)
                .semantics { contentDescription = "Tempo livre, de $start até $end" }
                .drawBehind {
                    drawRoundRect(
                        color = dashColor,
                        cornerRadius = CornerRadius(14.dp.toPx()),
                        style =
                            Stroke(
                                width = 1.dp.toPx(),
                                pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx())),
                            ),
                    )
                }.padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            modifier = Modifier.size(22.dp),
            imageVector = Icons.Outlined.HourglassEmpty,
            contentDescription = null,
            tint = muted,
        )
        Column(modifier = Modifier.weight(1f)) {
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "TEMPO LIVRE",
                    style =
                        MaterialTheme.typography.labelSmall.copy(
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold,
                            letterSpacing = 1.2.sp,
                        ),
                    color = muted,
                )
                if (isNow) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(6.dp).clip(CircleShape).background(brand))
                        Text(
                            text = "LIVRE AGORA",
                            style =
                                MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    letterSpacing = 1.sp,
                                ),
                            color = brand,
                        )
                    }
                }
            }
            Text(
                modifier = Modifier.padding(top = 4.dp),
                text = "$start — $end",
                style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                color = muted,
            )
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
            parts.forEach { part ->
                Row(verticalAlignment = Alignment.Bottom) {
                    Text(
                        text = part.value.toString(),
                        style = MaterialTheme.typography.titleLarge.copy(fontFamily = BraidDisplayFont, fontSize = 26.sp),
                        color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f),
                    )
                    Text(
                        modifier = Modifier.padding(start = 3.dp, bottom = 3.dp),
                        text = part.unit,
                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                        color = muted,
                    )
                }
            }
        }
    }
}
