package app.braid.mobile.ui.agenda

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Logout
import androidx.compose.material.icons.outlined.Menu
import androidx.compose.material.icons.outlined.Note
import androidx.compose.material.icons.outlined.TaskAlt
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationDrawerItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.core.designsystem.BraidWordmark
import app.braid.mobile.data.reminders.ReminderScheduler
import app.braid.mobile.data.session.SessionUser
import app.braid.mobile.domain.timeline.TIMELINE_TIME_ZONE
import app.braid.mobile.ui.chat.AgentChatScreen
import app.braid.mobile.ui.chat.AgentChatViewModel
import app.braid.mobile.ui.voice.VoiceEventButton
import app.braid.mobile.ui.voice.VoiceEventQueueViewModel
import app.braid.mobile.ui.voice.VoiceJobStatus
import app.braid.mobile.ui.voice.VoiceQueueEvent
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId

private enum class AgendaDestination(
    val label: String,
    val icon: ImageVector,
) {
    Tasks("Tarefas", Icons.Outlined.TaskAlt),
    Agenda("Agenda", Icons.Outlined.CalendarMonth),
    Notes("Notas", Icons.Outlined.Note),
    Search("Buscar e criar", Icons.Outlined.AutoAwesome),
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
@Suppress("ktlint:standard:function-naming")
fun AgendaShell(
    user: SessionUser,
    onSignOut: () -> Unit,
    onNewEvent: () -> Unit = {},
    onGoToToday: () -> Unit = {},
    onOpenEvent: (String) -> Unit = {},
    onVoiceTranscript: (String) -> Unit = {},
    onVoiceQueueDrained: () -> Unit = {},
    onChatEntitiesChanged: () -> Unit = {},
    voiceQueueViewModel: VoiceEventQueueViewModel? = null,
    agentChatViewModel: AgentChatViewModel? = null,
    reminderScheduler: ReminderScheduler? = null,
    refreshSignal: Int = 0,
) {
    val drawerState = rememberDrawerState(initialValue = DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    val todayKey = remember { LocalDate.now(ZoneId.of(TIMELINE_TIME_ZONE)).toString() }
    var selectedDayKey by remember(todayKey) { mutableStateOf(todayKey) }
    var destination by remember { mutableStateOf(AgendaDestination.Agenda) }
    val voiceJobs =
        if (voiceQueueViewModel == null) {
            emptyList()
        } else {
            voiceQueueViewModel.jobs.collectAsStateWithLifecycle().value
        }

    voiceQueueViewModel?.let { queueViewModel ->
        androidx.compose.runtime.LaunchedEffect(queueViewModel) {
            queueViewModel.events.collect { event ->
                if (event is VoiceQueueEvent.Drained) onVoiceQueueDrained()
            }
        }
    }

    fun closeDrawer(action: () -> Unit = {}) {
        scope.launch {
            drawerState.close()
            action()
        }
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = {
            ModalDrawerSheet {
                Column(
                    modifier = Modifier.fillMaxSize().padding(horizontal = 12.dp, vertical = 24.dp),
                ) {
                    BraidWordmark(
                        modifier = Modifier.padding(horizontal = 16.dp),
                        style = MaterialTheme.typography.headlineMedium,
                    )
                    Text(
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp),
                        text = user.email,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    HorizontalDivider(modifier = Modifier.padding(vertical = 16.dp))
                    NavigationDrawerItem(
                        icon = { Icon(Icons.Outlined.Add, contentDescription = null) },
                        label = { Text("Novo evento") },
                        selected = false,
                        onClick = { closeDrawer(onNewEvent) },
                    )
                    NavigationDrawerItem(
                        icon = { Icon(Icons.Outlined.Today, contentDescription = null) },
                        label = { Text("Ir para hoje") },
                        selected = false,
                        onClick = {
                            closeDrawer {
                                selectedDayKey = todayKey
                                onGoToToday()
                            }
                        },
                    )
                    Spacer(modifier = Modifier.weight(1f))
                    NavigationDrawerItem(
                        icon = { Icon(Icons.Outlined.Logout, contentDescription = null) },
                        label = { Text("Sair da conta") },
                        selected = false,
                        onClick = { closeDrawer(onSignOut) },
                    )
                }
            }
        },
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Scaffold(
                topBar = {
                    Column {
                        CenterAlignedTopAppBar(
                            title = {
                                DateNavigator(
                                    selectedDayKey = selectedDayKey,
                                    todayKey = todayKey,
                                    onSelect = { selectedDayKey = it },
                                )
                            },
                            navigationIcon = {
                                IconButton(onClick = { scope.launch { drawerState.open() } }) {
                                    Icon(Icons.Outlined.Menu, contentDescription = "Abrir menu")
                                }
                            },
                            actions = {
                                VoiceEventButton(
                                    onFinalTranscript = { transcript ->
                                        voiceQueueViewModel?.enqueue(transcript)
                                        onVoiceTranscript(transcript)
                                    },
                                )
                            },
                            colors = TopAppBarDefaults.topAppBarColors(),
                        )
                        WeekStrip(
                            selectedDayKey = selectedDayKey,
                            todayKey = todayKey,
                            onSelect = { selectedDayKey = it },
                        )
                    }
                },
                bottomBar = {
                    NavigationBar {
                        AgendaDestination.entries.forEach { item ->
                            NavigationBarItem(
                                selected = destination == item,
                                onClick = { destination = item },
                                icon = { Icon(item.icon, contentDescription = null) },
                                label = { Text(item.label) },
                            )
                        }
                    }
                },
            ) { paddingValues ->
                if (destination == AgendaDestination.Agenda) {
                    AgendaDayScreen(
                        dayKey = selectedDayKey,
                        modifier = Modifier.padding(paddingValues),
                        onOpenEvent = onOpenEvent,
                        reminderScheduler = reminderScheduler,
                        refreshSignal = refreshSignal,
                    )
                } else {
                    if (destination == AgendaDestination.Search && agentChatViewModel != null) {
                        AgentChatScreen(
                            modifier = Modifier.padding(paddingValues),
                            onEntitiesChanged = onChatEntitiesChanged,
                            viewModel = agentChatViewModel,
                        )
                    } else {
                        AgendaSectionPlaceholder(
                            modifier = Modifier.padding(paddingValues),
                            destination = destination,
                            user = user,
                            selectedDayKey = selectedDayKey,
                            onSelectDay = { selectedDayKey = it },
                        )
                    }
                }
            }
            VoiceJobStatus(
                modifier = Modifier.align(Alignment.BottomCenter),
                jobs = voiceJobs,
                onRetry = { jobId -> voiceQueueViewModel?.retry(jobId) },
                onDismiss = { jobId -> voiceQueueViewModel?.dismiss(jobId) },
            )
        }
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun AgendaSectionPlaceholder(
    modifier: Modifier,
    destination: AgendaDestination,
    user: SessionUser,
    selectedDayKey: String,
    onSelectDay: (String) -> Unit,
) {
    Column(
        modifier =
            modifier
                .fillMaxSize()
                .daySwipe(selectedDayKey, onSelectDay)
                .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(text = destination.label, style = MaterialTheme.typography.headlineSmall)
        Text(
            modifier = Modifier.padding(top = 8.dp),
            text = "$selectedDayKey · ${user.name}",
            style = MaterialTheme.typography.bodyLarge,
        )
    }
}
