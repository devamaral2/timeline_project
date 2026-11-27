package app.braid.mobile.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactFilters
import app.braid.mobile.domain.artifact.ArtifactRepository
import app.braid.mobile.domain.artifact.artifactTypeLabel
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskPickerRepository
import app.braid.mobile.ui.picker.EntityPickerController
import app.braid.mobile.ui.picker.EntityPickerState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.StateFlow
import javax.inject.Inject

/** Um resultado da pesquisa: uma tarefa ou um artefato, que abre o próprio detalhe. */
sealed interface SearchResult {
    val id: String

    data class Task(
        val card: TaskCard,
    ) : SearchResult {
        override val id: String get() = card.id
    }

    data class Document(
        val artifact: Artifact,
    ) : SearchResult {
        override val id: String get() = artifact.id
    }
}

/** A legenda da linha do resultado: "Tarefa" ou "Artefato · Notícias", com o rótulo do tipo do artefato. */
fun searchKindLabel(result: SearchResult): String =
    when (result) {
        is SearchResult.Task -> "Tarefa"
        is SearchResult.Document -> "Artefato · ${artifactTypeLabel(result.artifact.type)}"
    }

/** Quantos itens de cada lista a pesquisa pede: o limite dos seletores. */
private const val SEARCH_LIMIT = 50

/**
 * A pesquisa do chat (`/buscar`, "Pesquisar"): as tarefas acompanhadas e os artefatos cujo nome combina com o texto,
 * as tarefas primeiro, como no web. Sem texto, os primeiros de cada lista ("No seu espaço"). A busca espera 250 ms depois
 * da última tecla e descarta a resposta de uma busca já trocada. O web filtra uma lista de exemplo; aqui a busca é na API.
 */
@HiltViewModel
class SearchViewModel
    @Inject
    constructor(
        private val tasks: TaskPickerRepository,
        private val artifacts: ArtifactRepository,
    ) : ViewModel() {
        private val controller =
            EntityPickerController(viewModelScope, search = { query -> searchBoth(query) })

        val state: StateFlow<EntityPickerState<SearchResult>> = controller.state

        /** Abrir a pesquisa recomeça com o texto que veio depois do comando, como o web. */
        fun start(argument: String) = controller.reset(argument)

        fun type(text: String) = controller.type(text)

        private suspend fun searchBoth(query: String): List<SearchResult> =
            coroutineScope {
                val foundTasks = async { tasks.search(query) }
                val foundDocuments = async { artifacts.list(ArtifactFilters(query = query.ifEmpty { null }, limit = SEARCH_LIMIT)) }
                foundTasks.await().map(SearchResult::Task) + foundDocuments.await().map(SearchResult::Document)
            }

        override fun onCleared() {
            controller.close()
        }
    }
