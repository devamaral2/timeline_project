package app.braid.mobile.ui.hub

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.data.dto.NoteDto
import app.braid.mobile.data.dto.TaskSummaryDto
import app.braid.mobile.data.dto.TimelineEventCardDto
import app.braid.mobile.data.events.EventGateway
import app.braid.mobile.data.events.EventResult
import app.braid.mobile.data.notes.NoteGateway
import app.braid.mobile.data.notes.NoteResult
import app.braid.mobile.data.tasks.TaskGateway
import app.braid.mobile.data.tasks.TaskResult
import app.braid.mobile.domain.notes.normalize
import app.braid.mobile.domain.notes.noteSnippet
import app.braid.mobile.domain.timeline.TIMELINE_TIME_ZONE
import app.braid.mobile.domain.timeline.dayKeyOf
import app.braid.mobile.domain.timeline.mediumDate
import app.braid.mobile.domain.timeline.shiftDayKey
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId
import javax.inject.Inject

enum class SearchKind { Event, Task, Note }

data class SearchResult(
    val kind: SearchKind,
    val id: String,
    val title: String,
    val subtitle: String,
)

data class HubSearchState(
    val query: String = "",
    val loading: Boolean = true,
    val failed: Boolean = false,
    val results: List<SearchResult> = emptyList(),
)

private const val DAYS_BEFORE = 60L
private const val DAYS_AFTER = 60L
private const val UNFILTERED_LIMIT = 40

/**
 * A aba “Pesquisar” do hub: eventos de dois meses para cada lado de hoje, as
 * tarefas e as notas, filtrados pelo nome e pelas tags, sem acento.
 */
@HiltViewModel
class HubSearchViewModel
    @Inject
    constructor(
        private val events: EventGateway,
        private val tasks: TaskGateway,
        private val notes: NoteGateway,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(HubSearchState())
        private var all: List<SearchResult> = emptyList()
        private var tagsById: Map<String, List<String>> = emptyMap()

        val state: StateFlow<HubSearchState> = mutableState.asStateFlow()

        init {
            load()
        }

        fun load() {
            mutableState.update { it.copy(loading = true, failed = false) }
            viewModelScope.launch {
                val today = LocalDate.now(ZoneId.of(TIMELINE_TIME_ZONE)).toString()
                val eventsCall = async { events.range(shiftDayKey(today, -DAYS_BEFORE), shiftDayKey(today, DAYS_AFTER)) }
                val tasksCall = async { tasks.list() }
                val notesCall = async { notes.list() }
                val eventResult = eventsCall.await()
                val taskResult = tasksCall.await()
                val noteResult = notesCall.await()

                val eventItems = (eventResult as? EventResult.Success)?.value.orEmpty().sortedByDescending { it.startedAt }
                val taskItems = (taskResult as? TaskResult.Success)?.value.orEmpty()
                val noteItems = (noteResult as? NoteResult.Success)?.value.orEmpty().sortedByDescending { it.updatedAt }

                tagsById =
                    eventItems.associate { it.id to it.tags } +
                    taskItems.associate { it.id to it.tags } +
                    noteItems.associate { it.id to it.tags }
                all = eventItems.map(::eventResultOf) + taskItems.map(::taskResultOf) + noteItems.map(::noteResultOf)
                val failed =
                    eventResult is EventResult.Failure && taskResult is TaskResult.Failure && noteResult is NoteResult.Failure
                mutableState.update { it.copy(loading = false, failed = failed) }
                publish()
            }
        }

        fun setQuery(query: String) {
            mutableState.update { it.copy(query = query) }
            publish()
        }

        private fun publish() {
            val query = normalize(mutableState.value.query.trim())
            val matches =
                if (query.isEmpty()) {
                    all.take(UNFILTERED_LIMIT)
                } else {
                    all.filter { result ->
                        normalize(result.title).contains(query) ||
                            tagsById[result.id].orEmpty().any { normalize(it).contains(query) }
                    }
                }
            mutableState.update { it.copy(results = matches) }
        }

        private fun eventResultOf(event: TimelineEventCardDto) =
            SearchResult(SearchKind.Event, event.id, event.name, "Evento · ${mediumDate(dayKeyOf(event.startedAt))}")

        private fun taskResultOf(task: TaskSummaryDto) = SearchResult(SearchKind.Task, task.id, task.name, "Tarefa")

        private fun noteResultOf(note: NoteDto) =
            SearchResult(
                SearchKind.Note,
                note.id,
                note.name.ifBlank { noteSnippet(note) },
                "Nota",
            )
    }
