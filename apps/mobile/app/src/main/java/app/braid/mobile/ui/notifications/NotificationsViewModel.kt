package app.braid.mobile.ui.notifications

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.reminder.NotificationFeed
import app.braid.mobile.domain.reminder.ReadKeysStore
import app.braid.mobile.domain.reminder.Reminder
import app.braid.mobile.domain.reminder.loadReminderSources
import app.braid.mobile.domain.reminder.notificationFeedOf
import app.braid.mobile.domain.reminder.offsetLabel
import app.braid.mobile.domain.reminder.pruneRead
import app.braid.mobile.domain.reminder.relativeAgo
import app.braid.mobile.domain.reminder.upcomingAt
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskRepository
import app.braid.mobile.domain.time.AppClock
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import javax.inject.Inject

/** Uma linha do feed: [detail] é "Tarefa · 30 minutos antes" e [caption] o "há 3 h" ou "hoje às 14:00" à direita. */
data class NotificationRow(
    val key: String,
    val taskId: String,
    val name: String,
    val detail: String,
    val caption: String,
    val unread: Boolean,
)

data class NotificationsUiState(
    /** Falso até a primeira leitura terminar (certa ou errada). */
    val loaded: Boolean = false,
    val recent: List<NotificationRow> = emptyList(),
    val upcoming: List<NotificationRow> = emptyList(),
) {
    /** Os recentes ainda não vistos: o contador do web (o sino). */
    val unreadCount: Int = recent.count { it.unread }
    val isEmpty: Boolean = loaded && recent.isEmpty() && upcoming.isEmpty()
}

/**
 * O feed "Notificações" do chat: os mesmos lembretes dos alarmes (`loadReminderSources`, `remindersOf`) vistos como lista,
 * com lido e não lido por tarefa e instante de referência. A tela chama [refresh] a cada 5 min e quando um pedido do chat
 * mexe em registros, e [retime] a cada minuto para os textos de tempo andarem.
 */
@HiltViewModel
class NotificationsViewModel
    @Inject
    constructor(
        private val tasks: TaskRepository,
        private val readStore: ReadKeysStore,
        private val clock: AppClock,
        private val zone: ZoneId,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(NotificationsUiState())
        val state: StateFlow<NotificationsUiState> = mutableState.asStateFlow()

        private var cards: List<TaskCard> = emptyList()
        private var read: Map<String, Instant> = emptyMap()
        private var loadJob: Job? = null

        init {
            refresh()
        }

        /** Relê a fonte dos lembretes e as chaves lidas; uma falha total deixa o feed como estava. */
        fun refresh() {
            loadJob?.cancel()
            loadJob =
                viewModelScope.launch {
                    read = readStore.read()
                    loadReminderSources(tasks, clock.now())?.let { cards = it.cards }
                    render()
                }
        }

        /** Recalcula o feed e os textos no relógio de agora, sem ler a rede. */
        fun retime() = render()

        /** Tocar num aviso recente o marca como lido. */
        fun markRead(key: String) = markRead(setOf(key))

        /** "Marcar como lidas": todos os recentes ainda não vistos. */
        fun markAllRead() = markRead(feed().recent.map { it.key }.toSet())

        private fun markRead(keys: Set<String>) {
            val anchors = feed().recent.filter { it.key in keys }.associate { it.key to it.anchor }
            if (anchors.isEmpty()) return
            read = pruneRead(read + anchors, clock.now())
            render()
            val saved = read
            viewModelScope.launch { readStore.write(saved) }
        }

        /** O web entrega o feed no minuto cheio. */
        private fun now(): Instant = clock.now().truncatedTo(ChronoUnit.MINUTES)

        private fun feed(): NotificationFeed = notificationFeedOf(cards, now())

        private fun render() {
            val now = now()
            val feed = notificationFeedOf(cards, now)
            mutableState.value =
                NotificationsUiState(
                    loaded = true,
                    recent = feed.recent.map { it.toRow(relativeAgo(now, it.triggerAt), unread = it.key !in read) },
                    upcoming = feed.upcoming.map { it.toRow(upcomingAt(now, it.triggerAt, zone), unread = false) },
                )
        }
    }

private fun Reminder.toRow(
    caption: String,
    unread: Boolean,
) = NotificationRow(key, taskId, name, "Tarefa · ${offsetLabel(offsetMinutes)}", caption, unread)
