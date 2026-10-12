package app.braid.mobile.ui.agenda

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.reminders.NotificationFeed
import app.braid.mobile.data.reminders.NotificationFeedItem
import app.braid.mobile.data.reminders.NotificationFeedSource
import app.braid.mobile.data.reminders.NotificationReadStore
import app.braid.mobile.data.reminders.NotificationSourceLoader
import app.braid.mobile.data.reminders.notificationFeedOf
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.Instant
import javax.inject.Inject

data class NotificationsUiState(
    val feed: NotificationFeed = NotificationFeed(),
    val readKeys: Set<String> = emptySet(),
    val now: Instant = Instant.now(),
) {
    val unreadCount: Int get() = feed.recent.count { it.key !in readKeys }
}

/** O sino do cabeçalho: o mesmo feed do web, calculado de `notify_offsets_minutes`. */
@HiltViewModel
class NotificationsViewModel
    @Inject
    constructor(
        private val loader: NotificationSourceLoader,
        private val readStore: NotificationReadStore,
    ) : ViewModel() {
        private var sources: List<NotificationFeedSource> = emptyList()
        private val _state = MutableStateFlow(NotificationsUiState(readKeys = readStore.keys()))
        val state: StateFlow<NotificationsUiState> = _state.asStateFlow()

        init {
            viewModelScope.launch {
                var ticks = 0
                while (true) {
                    if (ticks % REFRESH_EVERY_TICKS == 0) loadSources()
                    publish()
                    delay(TICK_MILLIS)
                    ticks += 1
                }
            }
        }

        fun refresh() {
            viewModelScope.launch {
                loadSources()
                publish()
            }
        }

        fun markRead(items: List<NotificationFeedItem>) {
            if (items.isEmpty()) return
            readStore.markRead(items)
            _state.update { it.copy(readKeys = readStore.keys()) }
        }

        private suspend fun loadSources() {
            val loaded = loader.load()
            if (loaded.complete || loaded.sources.isNotEmpty()) sources = loaded.sources
        }

        private fun publish() {
            val now = Instant.now()
            _state.update { it.copy(feed = notificationFeedOf(sources, now), now = now, readKeys = readStore.keys(now)) }
        }

        private companion object {
            const val TICK_MILLIS = 60_000L
            const val REFRESH_EVERY_TICKS = 5
        }
    }
