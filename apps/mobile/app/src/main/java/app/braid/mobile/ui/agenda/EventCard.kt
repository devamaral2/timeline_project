package app.braid.mobile.ui.agenda

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccessTime
import androidx.compose.material.icons.outlined.Bedtime
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import app.braid.mobile.data.dto.TimelineEventCardDto
import app.braid.mobile.domain.timeline.EventPosition
import app.braid.mobile.domain.timeline.durationRatioOf
import app.braid.mobile.domain.timeline.elapsedSecondsOf
import app.braid.mobile.domain.timeline.endLabelOf
import app.braid.mobile.domain.timeline.eventPositionOf
import app.braid.mobile.domain.timeline.formatStopwatch
import app.braid.mobile.domain.timeline.formatTime
import java.time.Instant

private data class EventVisual(
    val icon: ImageVector,
    val label: String,
    val color: Color,
)

@Composable
private fun visualFor(type: String): EventVisual {
    val colors = MaterialTheme.colorScheme
    return when (type) {
        "meal" -> EventVisual(Icons.Outlined.Restaurant, "Refeição", colors.tertiary)
        "training" -> EventVisual(Icons.Outlined.FitnessCenter, "Treino", colors.primary)
        "sleep" -> EventVisual(Icons.Outlined.Bedtime, "Sono", colors.secondary)
        "routine" -> EventVisual(Icons.Outlined.AccessTime, "Rotina", colors.secondary)
        else -> EventVisual(Icons.Outlined.Circle, "Evento", colors.onSurfaceVariant)
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
fun EventCard(
    event: TimelineEventCardDto,
    longestMinutes: Int,
    now: Instant = Instant.now(),
    onClick: () -> Unit = {},
) {
    val visual = visualFor(event.primaryItemType)
    val position = eventPositionOf(event, now)
    val isRunning = position == EventPosition.Running
    val elapsedSeconds = if (isRunning) elapsedSecondsOf(event.startedAt, now) else null
    val ratio =
        if (elapsedSeconds != null) {
            if (longestMinutes > 0) {
                (elapsedSeconds / 60f / longestMinutes).coerceIn(0.06f, 1f)
            } else {
                0.06f
            }
        } else {
            durationRatioOf(event, longestMinutes)
        }

    Card(
        onClick = onClick,
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(imageVector = visual.icon, contentDescription = visual.label, tint = visual.color)
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Text(text = visual.label, style = MaterialTheme.typography.labelMedium, color = visual.color)
                        if (isRunning) {
                            Surface(
                                shape = RoundedCornerShape(50),
                                color = MaterialTheme.colorScheme.primaryContainer,
                            ) {
                                Text(
                                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                                    text = "Agora",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                                )
                            }
                        }
                    }
                    Text(text = event.name, style = MaterialTheme.typography.titleMedium)
                }
                Column(horizontalAlignment = Alignment.End) {
                    Text(
                        text = "${formatTime(event.startedAt)} → ${endLabelOf(event, now)}",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        text = elapsedSeconds?.let(::formatStopwatch) ?: event.durationLabel,
                        style = if (isRunning) MaterialTheme.typography.labelMedium else MaterialTheme.typography.labelSmall,
                        color = if (isRunning) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }

            if (event.description.isNotBlank()) {
                Text(
                    modifier = Modifier.padding(top = 12.dp),
                    text = event.description,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            if (event.tags.isNotEmpty() || event.missed) {
                Row(modifier = Modifier.padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    event.tags.forEach { tag ->
                        Surface(shape = RoundedCornerShape(50), color = visual.color.copy(alpha = 0.16f)) {
                            Text(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                text = "#$tag",
                                style = MaterialTheme.typography.labelSmall,
                                color = visual.color,
                            )
                        }
                    }
                    if (event.missed) {
                        Surface(shape = RoundedCornerShape(50), color = MaterialTheme.colorScheme.errorContainer) {
                            Text(
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                text = "Não realizado",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onErrorContainer,
                            )
                        }
                    }
                }
            }
            if (ratio != null) {
                Spacer(modifier = Modifier.height(12.dp))
                LinearProgressIndicator(
                    progress = { ratio },
                    modifier = Modifier.fillMaxWidth().height(3.dp),
                    color = if (isRunning) MaterialTheme.colorScheme.primary else visual.color,
                    trackColor = visual.color.copy(alpha = 0.12f),
                )
            }
        }
    }
}
