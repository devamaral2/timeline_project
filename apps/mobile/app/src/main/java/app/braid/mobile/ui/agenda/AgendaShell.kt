package app.braid.mobile.ui.agenda

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.isImeVisible
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.braid.mobile.data.reminders.ReminderScheduler
import app.braid.mobile.data.reminders.enqueueReminderSync
import app.braid.mobile.data.session.SessionUser
import app.braid.mobile.domain.timeline.TIMELINE_TIME_ZONE
import app.braid.mobile.ui.chat.AgentChatViewModel
import app.braid.mobile.ui.hub.HubPanel
import app.braid.mobile.ui.notes.NotesScreen
import app.braid.mobile.ui.voice.VoiceEventQueueViewModel
import app.braid.mobile.ui.voice.VoiceJobStatus
import app.braid.mobile.ui.voice.VoiceQueueEvent
import kotlinx.coroutines.flow.collect
import java.time.LocalDate
import java.time.ZoneId

/** A altura da barra inferior do web (`.bottomNav`), sem a margem do sistema: onde o painel do hub termina. */
private val BOTTOM_BAR_HEIGHT = 76.dp

/** O painel do hub não ocupa a tela toda: passa disso só quando o teclado ou a tela baixa pedem menos. */
private val HUB_PANEL_MAX_HEIGHT = 520.dp

/**
 * A casca das telas principais, montada como o shell do web no celular: o
 * cabeçalho (marca, sino, conta), a agenda com opções de visualização, mês e tira da semana, e a barra
 * inferior. “Buscar e criar” abre o painel do hub sobre a tela, com a barra à vista.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
@Suppress("ktlint:standard:function-naming")
fun AgendaShell(
    user: SessionUser,
    onSignOut: () -> Unit,
    onToggleTheme: () -> Unit = {},
    onOpenEvent: (String) -> Unit = {},
    onOpenNote: (String) -> Unit = {},
    onVoiceQueueDrained: () -> Unit = {},
    onChatEntitiesChanged: () -> Unit = {},
    voiceQueueViewModel: VoiceEventQueueViewModel? = null,
    agentChatViewModel: AgentChatViewModel? = null,
    reminderScheduler: ReminderScheduler? = null,
    refreshSignal: Int = 0,
) {
    val todayKey = remember { LocalDate.now(ZoneId.of(TIMELINE_TIME_ZONE)).toString() }
    var selectedDayKey by remember(todayKey) { mutableStateOf(todayKey) }
    // Só uma escolha explícita de dia reposiciona a lista contínua; a rolagem apenas atualiza `selectedDayKey`.
    var anchorDayKey by remember(todayKey) { mutableStateOf(todayKey) }
    var anchorVersion by remember { mutableIntStateOf(0) }
    // Salvável: ao voltar do detalhe de uma nota, a pessoa continua na aba Notas.
    var destination by rememberSaveable { mutableStateOf(BottomBarItem.Agenda) }
    var infinite by rememberSaveable { mutableStateOf(false) }
    var hubOpen by rememberSaveable { mutableStateOf(false) }
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

    fun selectDay(dayKey: String) {
        selectedDayKey = dayKey
        anchorDayKey = dayKey
        anchorVersion += 1
    }

    BackHandler(enabled = hubOpen) { hubOpen = false }

    // Alarmes dos próximos 30 dias, não só dos dias que a pessoa abrir na agenda.
    val context = LocalContext.current
    androidx.compose.runtime.LaunchedEffect(user.userId) { enqueueReminderSync(context) }

    Box(modifier = Modifier.fillMaxSize()) {
        Scaffold(
            topBar = {
                AgendaHeader(
                    onToggleTheme = onToggleTheme,
                    onSignOut = onSignOut,
                    notifications = { NotificationBell(onOpenEvent = onOpenEvent) },
                    below = {
                        if (destination == BottomBarItem.Agenda) {
                            AgendaViewOptions(
                                infinite = infinite,
                                onSelectMode = {
                                    infinite = it
                                    selectDay(selectedDayKey)
                                },
                            )
                            AgendaToolbar(
                                selectedDayKey = selectedDayKey,
                                todayKey = todayKey,
                                onSelectDay = ::selectDay,
                            )
                            if (!infinite) {
                                WeekStrip(
                                    selectedDayKey = selectedDayKey,
                                    todayKey = todayKey,
                                    onSelect = ::selectDay,
                                )
                            }
                        }
                    },
                )
            },
            bottomBar = {
                AgendaBottomBar(
                    selected = if (hubOpen) BottomBarItem.Search else destination,
                    onSelect = { item ->
                        if (item == BottomBarItem.Search) {
                            hubOpen = !hubOpen
                        } else {
                            hubOpen = false
                            destination = item
                        }
                    },
                )
            },
        ) { paddingValues ->
            when (destination) {
                BottomBarItem.Agenda ->
                    if (infinite) {
                        AgendaListScreen(
                            anchorDay = anchorDayKey,
                            anchorVersion = anchorVersion,
                            refreshSignal = refreshSignal,
                            onVisibleDayChange = { selectedDayKey = it },
                            modifier = Modifier.padding(paddingValues),
                            onOpenEvent = onOpenEvent,
                            reminderScheduler = reminderScheduler,
                        )
                    } else {
                        AgendaDayScreen(
                            dayKey = selectedDayKey,
                            modifier = Modifier.padding(paddingValues).daySwipe(selectedDayKey, ::selectDay),
                            onOpenEvent = onOpenEvent,
                            reminderScheduler = reminderScheduler,
                            refreshSignal = refreshSignal,
                        )
                    }
                BottomBarItem.Notes -> NotesScreen(onOpenNote = onOpenNote, modifier = Modifier.padding(paddingValues))
                // “Tarefas” ainda não tem tela, nem no web; e a busca vive no painel do hub.
                BottomBarItem.Tasks, BottomBarItem.Search ->
                    AgendaSectionPlaceholder(
                        modifier = Modifier.padding(paddingValues),
                        destination = destination,
                        user = user,
                        selectedDayKey = selectedDayKey,
                    )
            }
        }

        // O painel do hub: fundo escurecido até a barra inferior, que continua à vista e tocável.
        val keyboardUp = WindowInsets.isImeVisible
        val bottomBarHeight = BOTTOM_BAR_HEIGHT + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        Box(
            modifier =
                Modifier
                    .fillMaxSize()
                    .imePadding()
                    .padding(bottom = if (keyboardUp) 0.dp else bottomBarHeight),
        ) {
            AnimatedVisibility(visible = hubOpen, enter = fadeIn(), exit = fadeOut()) {
                Box(
                    modifier =
                        Modifier
                            .fillMaxSize()
                            .background(Color(0x24252B2D))
                            .clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null,
                            ) { hubOpen = false },
                )
            }
            AnimatedVisibility(
                modifier = Modifier.align(Alignment.BottomCenter),
                visible = hubOpen,
                enter = slideInVertically { it },
                exit = slideOutVertically { it },
            ) {
                BoxWithConstraints(modifier = Modifier.statusBarsPadding()) {
                    Surface(
                        modifier = Modifier.fillMaxWidth().height(minOf(maxHeight - 24.dp, HUB_PANEL_MAX_HEIGHT)),
                        shape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp),
                        color = MaterialTheme.colorScheme.surface,
                    ) {
                        HubPanel(
                            chatViewModel = agentChatViewModel,
                            onClose = { hubOpen = false },
                            onEntitiesChanged = onChatEntitiesChanged,
                            onOpenEvent = onOpenEvent,
                            onOpenNote = onOpenNote,
                        )
                    }
                }
            }
        }
        VoiceJobStatus(
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = bottomBarHeight),
            jobs = voiceJobs,
            onRetry = { jobId -> voiceQueueViewModel?.retry(jobId) },
            onDismiss = { jobId -> voiceQueueViewModel?.dismiss(jobId) },
        )
    }
}

@Composable
@Suppress("ktlint:standard:function-naming")
private fun AgendaSectionPlaceholder(
    modifier: Modifier,
    destination: BottomBarItem,
    user: SessionUser,
    selectedDayKey: String,
) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
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
