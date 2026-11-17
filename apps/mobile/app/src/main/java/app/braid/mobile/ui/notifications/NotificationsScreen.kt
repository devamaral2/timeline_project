package app.braid.mobile.ui.notifications

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidIcons
import app.braid.mobile.core.designsystem.SvgIcon
import app.braid.mobile.core.designsystem.braidBrand
import app.braid.mobile.domain.reminder.REFRESH_INTERVAL
import app.braid.mobile.ui.chat.OnEntitiesChanged
import kotlinx.coroutines.delay

/** De quanto em quanto tempo os textos de tempo ("há 3 h", "hoje às 14:00") são recalculados. */
private const val RETIME_MS = 60_000L

/**
 * A tela "Notificações" do chat (`/notificacoes`): os avisos vencidos nas últimas 24 h e os próximos, a mesma lista do
 * sino do web. [onBack] volta ao chat; [onOpenTask] abre a tarefa do aviso.
 */
@Composable
fun NotificationsScreen(
    onBack: () -> Unit,
    onOpenTask: (String) -> Unit,
    viewModel: NotificationsViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // O voltar do sistema faz o mesmo que a seta: volta ao chat.
    BackHandler(onBack = onBack)
    // O relógio do feed anda a cada minuto; a fonte é relida a cada 5 min (e quando um pedido do chat mexe em registros).
    LaunchedEffect(viewModel) {
        val retimesPerRefresh = (REFRESH_INTERVAL.toMillis() / RETIME_MS).toInt()
        var ticks = 0
        while (true) {
            delay(RETIME_MS)
            ticks++
            if (ticks % retimesPerRefresh == 0) viewModel.refresh() else viewModel.retime()
        }
    }
    OnEntitiesChanged(viewModel::refresh)
    NotificationsContent(
        state = state,
        onBack = onBack,
        onMarkAllRead = viewModel::markAllRead,
        onOpen = { row ->
            if (row.unread) viewModel.markRead(row.key)
            onOpenTask(row.taskId)
        },
    )
}

@Composable
fun NotificationsContent(
    state: NotificationsUiState,
    onBack: () -> Unit,
    onMarkAllRead: () -> Unit,
    onOpen: (NotificationRow) -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    val bottomInset = WindowInsets.navigationBars.asPaddingValues()
    Column(
        Modifier
            .fillMaxSize()
            .background(scheme.background)
            .windowInsetsPadding(WindowInsets.statusBars),
    ) {
        Header(state.unreadCount, onBack, onMarkAllRead)
        LazyColumn(
            Modifier.fillMaxSize().semantics { contentDescription = "Notificações" },
            contentPadding = PaddingValues(start = 12.dp, end = 12.dp, bottom = 24.dp + bottomInset.calculateBottomPadding()),
        ) {
            if (state.isEmpty) {
                item {
                    Text(
                        text = "Nenhum aviso por enquanto. Defina um aviso ao criar uma tarefa.",
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 14.dp),
                        color = scheme.onSurfaceVariant,
                        fontSize = 13.sp,
                        lineHeight = 20.sp,
                    )
                }
            }
            section("Recentes", state.recent, onOpen)
            section("Próximos", state.upcoming, onOpen)
        }
    }
}

private fun LazyListScope.section(
    title: String,
    rows: List<NotificationRow>,
    onOpen: (NotificationRow) -> Unit,
) {
    if (rows.isEmpty()) return
    item(key = "title-$title") {
        Text(
            text = title,
            modifier = Modifier.padding(start = 8.dp, end = 8.dp, top = 10.dp, bottom = 4.dp).semantics { heading() },
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontSize = 12.sp,
            lineHeight = 16.sp,
            fontWeight = FontWeight.SemiBold,
        )
    }
    items(rows, key = { "$title-${it.key}" }) { row -> NotificationRowItem(row) { onOpen(row) } }
}

@Composable
private fun Header(
    unread: Int,
    onBack: () -> Unit,
    onMarkAllRead: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Column {
        Row(Modifier.fillMaxWidth().heightIn(min = 56.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(
                Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .clickable(role = Role.Button, onClick = onBack)
                    .semantics { contentDescription = "Voltar para o chat" },
                contentAlignment = Alignment.Center,
            ) {
                SvgIcon(BraidIcons.chevronLeft, size = 22.dp, color = scheme.onBackground, modifier = Modifier.clearAndSetSemantics {})
            }
            Row(
                Modifier.weight(1f).padding(start = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = "Notificações",
                    modifier =
                        Modifier.semantics {
                            heading()
                            if (unread > 0) contentDescription = "Notificações, $unread não lidas"
                        },
                    color = scheme.onBackground,
                    fontSize = 15.sp,
                    lineHeight = 20.sp,
                    fontWeight = FontWeight.SemiBold,
                )
                if (unread > 0) {
                    Text(
                        text = if (unread > 9) "9+" else unread.toString(),
                        modifier =
                            Modifier
                                .clip(CircleShape)
                                .background(braidBrand())
                                .padding(horizontal = 6.dp)
                                .clearAndSetSemantics {},
                        color = scheme.background,
                        fontSize = 11.sp,
                        lineHeight = 18.sp,
                        fontWeight = FontWeight.SemiBold,
                    )
                }
            }
            if (unread > 0) {
                Box(
                    Modifier.heightIn(min = 44.dp).clickable(role = Role.Button, onClick = onMarkAllRead).padding(horizontal = 8.dp),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(text = "Marcar como lidas", color = scheme.onSurfaceVariant, fontSize = 12.sp)
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(scheme.outline))
    }
}

@Composable
private fun NotificationRowItem(
    row: NotificationRow,
    onClick: () -> Unit,
) {
    val scheme = MaterialTheme.colorScheme
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clip(RoundedCornerShape(5.dp))
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = 8.dp, vertical = 8.dp)
            .semantics(mergeDescendants = true) {},
        horizontalArrangement = Arrangement.spacedBy(10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            Modifier
                .padding(top = 6.dp)
                .size(8.dp)
                .clip(CircleShape)
                .background(if (row.unread) braidBrand() else scheme.outline)
                .semantics { contentDescription = if (row.unread) "Não lida" else "" },
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(
                text = row.name,
                color = scheme.onBackground,
                fontSize = 14.sp,
                lineHeight = 20.sp,
                fontWeight = if (row.unread) FontWeight.SemiBold else FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(text = row.detail, color = scheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp)
        }
        Text(text = row.caption, color = scheme.onSurfaceVariant, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 1)
    }
}
