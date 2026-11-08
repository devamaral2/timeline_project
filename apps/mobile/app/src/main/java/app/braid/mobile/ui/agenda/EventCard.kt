package app.braid.mobile.ui.agenda

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.core.designsystem.BraidMonoFont
import app.braid.mobile.core.designsystem.DarkTokens
import app.braid.mobile.core.designsystem.LightTokens
import app.braid.mobile.core.designsystem.LocalBraidDarkTheme
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.core.designsystem.braidBrandAccent
import app.braid.mobile.core.designsystem.tagColors
import app.braid.mobile.data.dto.TimelineEventCardDto
import app.braid.mobile.domain.timeline.EventPosition
import app.braid.mobile.domain.timeline.durationPartsOf
import app.braid.mobile.domain.timeline.eventPositionOf
import app.braid.mobile.domain.timeline.formatTime
import app.braid.mobile.ui.event.eventDetailPalette
import java.time.Instant

private data class EventVisual(
    val icon: ImageVector,
    val label: String,
    val color: Color,
)

@Composable
private fun visualFor(type: String): EventVisual {
    val palette = eventDetailPalette()
    return when (type) {
        "meal" -> EventVisual(Icons.Outlined.Restaurant, "Refeição", palette.meal)
        "training" -> EventVisual(Icons.Outlined.FitnessCenter, "Treino", palette.training)
        "sleep" -> EventVisual(Icons.Outlined.Bedtime, "Sono", palette.sleep)
        "routine" -> EventVisual(Icons.Outlined.AccessTime, "Rotina", palette.routine)
        else -> EventVisual(Icons.Outlined.Circle, "Evento", MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

/**
 * O cartão de evento do canvas “Eventos · Braid” (`.event` do HTML): ícone do tipo à esquerda,
 * nome, a meta em mono (“07:00 — 08:00 · 1 h”) e as etiquetas; à direita, a seta que abre o
 * evento ou, no que está rolando, “Em andamento”. Quem já passou some para o fundo (sem
 * superfície); o não realizado esmaece; o que está rolando ganha a borda da marca.
 */
@Composable
@OptIn(ExperimentalLayoutApi::class)
@Suppress("ktlint:standard:function-naming")
fun EventCard(
    event: TimelineEventCardDto,
    now: Instant = Instant.now(),
    onClick: () -> Unit = {},
) {
    val visual = visualFor(event.kind)
    val dark = LocalBraidDarkTheme.current
    val brand = if (dark) DarkTokens.brand else LightTokens.brand
    val input = if (dark) DarkTokens.input else LightTokens.input
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val position = eventPositionOf(event, now)
    val isRunning = position == EventPosition.Running
    val finishedAt = event.finishedAt
    val durationParts = finishedAt?.let { durationPartsOf(event.startedAt, it) }.orEmpty()
    val timeText =
        when {
            finishedAt == null -> formatTime(event.startedAt)
            else -> "${formatTime(event.startedAt)} — ${formatTime(finishedAt)}"
        }

    Surface(
        onClick = onClick,
        modifier = Modifier.alpha(if (event.missed) 0.7f else 1f).semantics { contentDescription = "${visual.label}: ${event.name}" },
        shape = RoundedCornerShape(14.dp),
        color = if (position == EventPosition.Past) Color.Transparent else MaterialTheme.colorScheme.surface,
        border = BorderStroke(if (isRunning) 2.dp else 1.dp, if (isRunning) brand else MaterialTheme.colorScheme.outline),
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.Top,
        ) {
            Icon(
                modifier = Modifier.size(22.dp).padding(top = 2.dp),
                imageVector = visual.icon,
                contentDescription = null,
                tint = visual.color,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = event.name,
                    style = MaterialTheme.typography.titleMedium.copy(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    modifier = Modifier.padding(top = 4.dp),
                    text = timeText,
                    style = MaterialTheme.typography.bodySmall.copy(fontFamily = BraidMonoFont, fontSize = 13.sp),
                    color = muted,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (event.tags.isNotEmpty() || event.missed) {
                    FlowRow(
                        modifier = Modifier.padding(top = 8.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        event.tags.forEach { tag ->
                            val colors = tagColors(tag, dark)
                            Surface(shape = RoundedCornerShape(5.dp), color = colors.backgroundColor) {
                                Text(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                                    text = "#$tag",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp, fontWeight = FontWeight.Medium),
                                    color = colors.color,
                                )
                            }
                        }
                        if (event.missed) {
                            Surface(
                                shape = RoundedCornerShape(5.dp),
                                color = Color.Transparent,
                                border = BorderStroke(1.dp, input),
                            ) {
                                Text(
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 1.dp),
                                    text = "Não realizado",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 12.sp, fontWeight = FontWeight.Medium),
                                    color = muted,
                                )
                            }
                        }
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.Top) {
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    if (durationParts.isNotEmpty()) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                            durationParts.forEach { part ->
                                Row(verticalAlignment = Alignment.Bottom) {
                                    Text(
                                        text = part.value.toString(),
                                        style = MaterialTheme.typography.titleLarge.copy(fontFamily = BraidDisplayFont, fontSize = 22.sp),
                                    )
                                    Text(
                                        modifier = Modifier.padding(start = 3.dp, bottom = 2.dp),
                                        text = part.unit,
                                        style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.sp),
                                        color = muted,
                                    )
                                }
                            }
                        }
                    }
                    if (isRunning) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                            Box(Modifier.size(6.dp).clip(CircleShape).background(brand))
                            Text(
                                text = "Em andamento",
                                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.SemiBold),
                                color = braidBrandAccent(),
                                maxLines = 1,
                            )
                        }
                    }
                }
                if (!isRunning) {
                    Icon(
                        modifier = Modifier.size(18.dp).padding(top = 3.dp).alpha(0.6f),
                        imageVector = LucideIcons.chevronRight(),
                        contentDescription = null,
                        tint = muted,
                    )
                }
            }
        }
    }
}
