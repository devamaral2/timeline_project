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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidDisplayFont
import app.braid.mobile.data.reminders.ReminderEventSource
import app.braid.mobile.data.reminders.ReminderScheduler
import app.braid.mobile.domain.timeline.AgendaEntry
import app.braid.mobile.domain.timeline.TIMELINE_TIME_ZONE
import app.braid.mobile.domain.timeline.agendaEntriesOf
import app.braid.mobile.domain.timeline.mediumDate
import app.braid.mobile.domain.timeline.relativeDayLabel
import java.time.LocalDate
import java.time.ZoneId

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
                    EmptyAgendaState(
                        title = "Um dia livre, do seu jeito.",
                        description = "Sua agenda está aberta para o que faz bem a você.",
                    )
                }
            is AgendaUiState.Content -> {
                val entries = remember(current.events, current.dayKey) { agendaEntriesOf(current.events, current.dayKey) }
                RefreshableAgenda(
                    modifier = Modifier.fillMaxSize(),
                    isRefreshing = current.isRefreshing,
                    onRefresh = { viewModel.refreshDay(dayKey) },
                ) {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(18.dp),
                        verticalArrangement = Arrangement.spacedBy(10.dp),
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
                        items(entries, key = { it.key }) { entry ->
                            when (entry) {
                                is AgendaEntry.Event ->
                                    EventCard(
                                        event = entry.event,
                                        now = now,
                                        onClick = { onOpenEvent(entry.event.id) },
                                    )
                                is AgendaEntry.FreeTime -> FreeTimeCard(slot = entry.slot, now = now)
                            }
                        }
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
internal fun DayHeading(
    dayKey: String,
    eventCount: Int,
) {
    val todayKey = remember { LocalDate.now(ZoneId.of(TIMELINE_TIME_ZONE)).toString() }
    Row(
        modifier = Modifier.fillMaxWidth().padding(bottom = 2.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalAlignment = Alignment.Bottom) {
            Text(
                text = relativeDayLabel(dayKey, todayKey),
                style = MaterialTheme.typography.headlineSmall.copy(fontFamily = BraidDisplayFont, fontWeight = FontWeight.Normal),
            )
            Text(
                modifier = Modifier.padding(bottom = 2.dp),
                text = mediumDate(dayKey),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Text(
            modifier = Modifier.padding(bottom = 3.dp),
            text = "$eventCount ${if (eventCount == 1) "evento" else "eventos"}".uppercase(),
            style = MaterialTheme.typography.labelSmall.copy(fontSize = 10.sp, letterSpacing = 1.2.sp, fontWeight = FontWeight.Medium),
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
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
    description: String? = null,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(
            text = title,
            style = if (description != null) MaterialTheme.typography.headlineSmall else MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        if (description != null) {
            Text(
                text = description,
                modifier = Modifier.padding(top = 10.dp),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                textAlign = TextAlign.Center,
            )
        }
        if (actionLabel != null && onAction != null) {
            Button(modifier = Modifier.padding(top = 16.dp), onClick = onAction) {
                Text(actionLabel)
            }
        }
    }
}
