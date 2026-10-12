package app.braid.mobile.ui.agenda

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.LucideIcons
import app.braid.mobile.data.reminders.NotificationFeedItem
import app.braid.mobile.data.reminders.NotificationKind
import app.braid.mobile.data.reminders.notificationAgoLabel
import app.braid.mobile.data.reminders.notificationOffsetLabel
import app.braid.mobile.data.reminders.notificationUpcomingLabel
import app.braid.mobile.domain.timeline.TIMELINE_TIME_ZONE
import java.time.ZoneId

private val timelineZone: ZoneId = ZoneId.of(TIMELINE_TIME_ZONE)

/**
 * O sino do cabeçalho (`notification-bell.tsx` no web): o que venceu nas
 * últimas 24h e os próximos avisos, de eventos e tarefas. Tocar num evento
 * abre o detalhe dele; tarefa ainda não tem tela.
 */
@Composable
@Suppress("ktlint:standard:function-naming")
fun NotificationBell(
    onOpenEvent: (String) -> Unit,
    modifier: Modifier = Modifier,
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    var open by remember { mutableStateOf(false) }
    val colors = MaterialTheme.colorScheme
    val unread = state.unreadCount
    val description = if (unread > 0) "Notificações, $unread não lidas" else "Notificações"

    Box(modifier = modifier) {
        IconButton(
            onClick = {
                open = true
                viewModel.refresh()
            },
            modifier = Modifier.size(44.dp).semantics { contentDescription = description },
        ) {
            BadgedBox(
                badge = {
                    if (unread > 0) Badge { Text(if (unread > 9) "9+" else unread.toString()) }
                },
            ) {
                Icon(
                    imageVector = LucideIcons.bell(),
                    contentDescription = null,
                    modifier = Modifier.size(21.dp),
                    tint = colors.onSurfaceVariant,
                )
            }
        }
        DropdownMenu(
            expanded = open,
            onDismissRequest = { open = false },
            shape = RoundedCornerShape(12.dp),
            containerColor = colors.surface,
            border = BorderStroke(1.dp, colors.outline),
            modifier = Modifier.widthIn(min = 280.dp, max = 360.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(start = 16.dp, end = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text("Notificações", style = MaterialTheme.typography.titleMedium)
                if (unread > 0) {
                    TextButton(onClick = { viewModel.markRead(state.feed.recent) }) { Text("Marcar como lidas") }
                }
            }
            if (state.feed.recent.isEmpty() && state.feed.upcoming.isEmpty()) {
                Text(
                    "Nenhum aviso por enquanto. Defina um aviso ao criar um evento ou tarefa.",
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
                    style = MaterialTheme.typography.bodyMedium,
                    color = colors.onSurfaceVariant,
                )
            }
            if (state.feed.recent.isNotEmpty()) {
                SectionTitle("Recentes")
                state.feed.recent.forEach { item ->
                    NotificationRow(
                        item = item,
                        caption = notificationAgoLabel(item.triggerAt, state.now),
                        unread = item.key !in state.readKeys,
                        onClick = {
                            viewModel.markRead(listOf(item))
                            open = false
                            if (item.kind == NotificationKind.Event) onOpenEvent(item.sourceId)
                        },
                    )
                }
            }
            if (state.feed.upcoming.isNotEmpty()) {
                SectionTitle("Próximos")
                state.feed.upcoming.forEach { item ->
                    NotificationRow(
                        item = item,
                        caption = notificationUpcomingLabel(item.triggerAt, state.now, timelineZone),
                        unread = false,
                        onClick = {
                            open = false
                            if (item.kind == NotificationKind.Event) onOpenEvent(item.sourceId)
                        },
                    )
                }
            }
        }
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun SectionTitle(text: String) {
    Text(
        text.uppercase(),
        modifier = Modifier.padding(start = 16.dp, top = 12.dp, bottom = 4.dp),
        style = MaterialTheme.typography.labelSmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun NotificationRow(
    item: NotificationFeedItem,
    caption: String,
    unread: Boolean,
    onClick: () -> Unit,
) {
    val colors = MaterialTheme.colorScheme
    DropdownMenuItem(
        onClick = onClick,
        leadingIcon = {
            Surface(
                modifier = Modifier.size(8.dp),
                shape = CircleShape,
                color = if (unread) colors.primary else colors.surface,
            ) {}
        },
        text = {
            Column {
                Text(
                    item.name,
                    style = MaterialTheme.typography.bodyLarge,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    "${if (item.kind == NotificationKind.Task) "Tarefa" else "Evento"} · " +
                        notificationOffsetLabel(item.offsetMinutes),
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.onSurfaceVariant,
                )
            }
        },
        trailingIcon = {
            Text(caption, style = MaterialTheme.typography.labelSmall, color = colors.onSurfaceVariant)
        },
    )
}
