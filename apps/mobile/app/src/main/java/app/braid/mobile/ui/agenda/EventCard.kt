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
import app.braid.mobile.core.designsystem.tagColors
import app.braid.mobile.data.dto.TimelineEventCardDto
import app.braid.mobile.domain.timeline.EventPosition
import app.braid.mobile.domain.timeline.durationPartsOf
import app.braid.mobile.domain.timeline.elapsedSecondsOf
import app.braid.mobile.domain.timeline.eventPositionOf
import app.braid.mobile.domain.timeline.formatStopwatch
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
    val destructive = if (dark) DarkTokens.destructive else LightTokens.destructive
    val muted = MaterialTheme.colorScheme.onSurfaceVariant
    val position = eventPositionOf(event, now)
    val isRunning = position == EventPosition.Running
    val elapsedSeconds = if (isRunning) elapsedSecondsOf(event.startedAt, now) else null
    val durationParts = event.finishedAt?.let { durationPartsOf(event.startedAt, it) }.orEmpty()

    // Quem já passou some para o fundo (sem superfície); o não realizado esmaece
    // mais um pouco; o que está rolando ganha a borda da marca.
    Surface(
        onClick = onClick,
        modifier = Modifier.alpha(if (event.missed) 0.58f else 1f).semantics { contentDescription = "${visual.label}: ${event.name}" },
        shape = RoundedCornerShape(14.dp),
        color = if (position == EventPosition.Past) Color.Transparent else MaterialTheme.colorScheme.surface,
        border = BorderStroke(if (isRunning) 2.dp else 1.dp, if (isRunning) brand else MaterialTheme.colorScheme.outline),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                modifier = Modifier.size(22.dp).align(Alignment.Top).padding(top = 2.dp),
                imageVector = visual.icon,
                contentDescription = null,
                tint = visual.color,
            )
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = event.name,
                    style = MaterialTheme.typography.titleMedium.copy(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    modifier = Modifier.padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    if (position == EventPosition.Past) {
                        Box(
                            Modifier
                                .size(5.dp)
                                .clip(CircleShape)
                                .alpha(0.8f)
                                .background(muted),
                        )
                    }
                    val finishedAt = event.finishedAt
                    Text(
                        text =
                            if (finishedAt == null ||
                                isRunning
                            ) {
                                formatTime(event.startedAt)
                            } else {
                                "${formatTime(event.startedAt)} — ${formatTime(finishedAt)}"
                            },
                        style = MaterialTheme.typography.bodySmall.copy(fontSize = 13.sp),
                        color = muted,
                    )
                    if (isRunning) {
                        Box(Modifier.size(6.dp).clip(CircleShape).background(brand))
                        Text(
                            text = "EM ANDAMENTO",
                            style =
                                MaterialTheme.typography.labelSmall.copy(
                                    fontSize = 10.sp,
                                    fontWeight = FontWeight.SemiBold,
                                    letterSpacing = 1.sp,
                                ),
                            color = brand,
                        )
                    } else if (finishedAt == null) {
                        Text(text = "sem hora de fim", style = MaterialTheme.typography.labelSmall, color = muted)
                    }
                }
                if (event.tags.isNotEmpty() || event.missed) {
                    FlowRow(
                        modifier = Modifier.padding(top = 12.dp),
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        event.tags.forEach { tag ->
                            val colors = tagColors(tag, dark)
                            Surface(shape = RoundedCornerShape(5.dp), color = colors.backgroundColor) {
                                Text(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                                    text = "#$tag",
                                    style = MaterialTheme.typography.labelSmall.copy(fontSize = 11.5.sp, fontWeight = FontWeight.Medium),
                                    color = colors.color,
                                )
                            }
                        }
                        if (event.missed) {
                            Surface(shape = RoundedCornerShape(5.dp), color = destructive.copy(alpha = if (dark) 0.15f else 0.12f)) {
                                Text(
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 4.dp),
                                    text = "NÃO REALIZADO",
                                    style =
                                        MaterialTheme.typography.labelSmall.copy(
                                            fontSize = 10.sp,
                                            fontWeight = FontWeight.SemiBold,
                                            letterSpacing = 0.8.sp,
                                        ),
                                    color = destructive,
                                )
                            }
                        }
                    }
                }
            }
            if (elapsedSeconds != null) {
                Text(
                    text = formatStopwatch(elapsedSeconds),
                    style =
                        MaterialTheme.typography.titleMedium.copy(
                            fontFamily = BraidMonoFont,
                            fontSize = 20.sp,
                            fontWeight = FontWeight.Medium,
                            letterSpacing = (-0.4).sp,
                        ),
                    color = brand,
                )
            } else if (durationParts.isNotEmpty()) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.Bottom) {
                    durationParts.forEach { part ->
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                text = part.value.toString(),
                                style = MaterialTheme.typography.titleLarge.copy(fontFamily = BraidDisplayFont, fontSize = 26.sp),
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
    }
}
