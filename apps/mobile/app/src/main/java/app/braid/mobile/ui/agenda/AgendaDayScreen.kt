package app.braid.mobile.ui.agenda

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.pulltorefresh.rememberPullToRefreshState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.data.reminders.ReminderEventSource
import app.braid.mobile.data.reminders.ReminderScheduler
import app.braid.mobile.domain.timeline.mediumDate

@Composable
@Suppress("ktlint:standard:function-naming")
fun AgendaDayScreen(
    dayKey: String,
    modifier: Modifier = Modifier,
    onOpenEvent: (String) -> Unit = {},
    reminderScheduler: ReminderScheduler? = null,
    refreshSignal: Int = 0,
    viewModel: AgendaViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val now = rememberCurrentInstant()
    var usesInexactReminders by remember { mutableStateOf(false) }
    var requestedNotificationPermission by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    val notificationPermissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    LaunchedEffect(dayKey, refreshSignal) { viewModel.loadDay(dayKey) }
    LaunchedEffect(state, reminderScheduler) {
        val content = state as? AgendaUiState.Content
        if (content != null && reminderScheduler != null) {
            usesInexactReminders =
                reminderScheduler
                    .schedule(
                        content.events.map { event ->
                            ReminderEventSource(
                                id = event.id,
                                name = event.name,
                                startedAt = java.time.Instant.parse(event.startedAt),
                                notifyOffsetsMinutes = event.notifyOffsetsMinutes,
                            )
                        },
                    ).usedInexactFallback
        }
    }
    LaunchedEffect(state) {
        val content = state as? AgendaUiState.Content
        val hasReminders = content?.events?.any { it.notifyOffsetsMinutes.isNotEmpty() } == true
        if (
            hasReminders &&
            !requestedNotificationPermission &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
            PackageManager.PERMISSION_GRANTED
        ) {
            requestedNotificationPermission = true
            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
        }
    }

    Box(modifier = modifier.fillMaxSize()) {
        when (val current = state) {
            AgendaUiState.Loading -> AgendaDaySkeleton(modifier = Modifier.fillMaxSize())
            is AgendaUiState.Error ->
                RefreshableAgenda(
                    modifier = Modifier.fillMaxSize(),
                    isRefreshing = false,
                    onRefresh = { viewModel.loadDay(dayKey) },
                ) {
                    EmptyAgendaState(
                        title = "Não foi possível carregar a agenda",
                        actionLabel = "Tentar novamente",
                        onAction = { viewModel.loadDay(dayKey) },
                    )
                }
            is AgendaUiState.Empty ->
                RefreshableAgenda(
                    modifier = Modifier.fillMaxSize(),
                    isRefreshing = false,
                    onRefresh = { viewModel.refreshDay(dayKey) },
                ) {
                    EmptyAgendaState(title = "Nenhum evento em ${mediumDate(current.dayKey)}")
                }
            is AgendaUiState.Content ->
                RefreshableAgenda(
                    modifier = Modifier.fillMaxSize(),
                    isRefreshing = current.isRefreshing,
                    onRefresh = { viewModel.refreshDay(dayKey) },
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(20.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                    ) {
                        if (current.refreshFailed) {
                            item {
                                Text(
                                    text = "Não foi possível atualizar este dia.",
                                    color = MaterialTheme.colorScheme.error,
                                    style = MaterialTheme.typography.bodySmall,
                                )
                            }
                        }
                        item {
                            Text(
                                text =
                                    "${current.events.size} ${if (current.events.size == 1) "evento" else "eventos"} " +
                                        "· ${current.trackedMinutes / 60}h registradas",
                                style = MaterialTheme.typography.labelLarge,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        items(current.events, key = { it.id }) { event ->
                            EventCard(
                                event = event,
                                longestMinutes = current.longestMinutes,
                                now = now,
                                onClick = { onOpenEvent(event.id) },
                            )
                        }
                    }
                }
        }
        if (usesInexactReminders) {
            Surface(
                modifier = Modifier.align(Alignment.BottomCenter).padding(12.dp),
                color = MaterialTheme.colorScheme.tertiaryContainer,
                shape = MaterialTheme.shapes.large,
            ) {
                Text(
                    modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp),
                    text = "Os lembretes podem atrasar porque os alarmes exatos estão desativados.",
                    color = MaterialTheme.colorScheme.onTertiaryContainer,
                    style = MaterialTheme.typography.bodySmall,
                )
            }
        }
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun RefreshableAgenda(
    modifier: Modifier,
    isRefreshing: Boolean,
    onRefresh: () -> Unit,
    content: @Composable BoxScope.() -> Unit,
) {
    val refreshState = rememberPullToRefreshState()
    PullToRefreshBox(
        isRefreshing = isRefreshing,
        onRefresh = onRefresh,
        modifier = modifier.fillMaxSize(),
        state = refreshState,
        content = content,
    )
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun EmptyAgendaState(
    title: String,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = title, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (actionLabel != null && onAction != null) {
            Button(modifier = Modifier.padding(top = 16.dp), onClick = onAction) {
                Text(actionLabel)
            }
        }
    }
}
