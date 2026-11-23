package app.braid.mobile.ui.documents

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactFilters
import app.braid.mobile.domain.artifact.ArtifactRepository
import app.braid.mobile.domain.artifact.artifactActor
import app.braid.mobile.domain.artifact.artifactCountLabel
import app.braid.mobile.domain.executor.ViewMode
import app.braid.mobile.domain.executor.ViewModeRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Espera depois da última tecla antes de consultar a API pelo texto. */
const val SEARCH_DEBOUNCE_MS = 250L

/** Por que a lista está vazia: ainda não há documento ou os filtros escondem todos. */
enum class EmptyKind { NoneYet, NothingFound }

/**
 * [artifacts] são os documentos como a API os devolveu para a [search]; a escolha de executor separa aqui, na
 * tela, porque a API não filtra por dono. [query] é o que está digitado e [search] o texto já lido (aparado e depois da espera).
 */
data class DocumentsUiState(
    val artifacts: List<Artifact>? = null,
    val failed: Boolean = false,
    val query: String = "",
    val search: String = "",
    val viewMode: ViewMode = ViewMode.Default,
    /** Há documento na lista sem filtro: só então a busca do menu aparece. */
    val hasArtifacts: Boolean = false,
) {
    val shown: List<Artifact>? =
        artifacts?.let { all -> viewMode.actor?.let { actor -> all.filter { artifactActor(it.type) == actor } } ?: all }

    /** A legenda no topo: "Documentos" até a lista chegar, depois a contagem. */
    val caption: String get() = shown?.let { artifactCountLabel(it.size) } ?: "Documentos"

    /** Há busca ativa: a aba ganha o ponto (a escolha de executor não conta, como no web). */
    val filtered: Boolean get() = search.isNotEmpty()

    val empty: EmptyKind? =
        if (shown?.isEmpty() !=
            true
        ) {
            null
        } else if (filtered || artifacts.orEmpty().isNotEmpty()) {
            EmptyKind.NothingFound
        } else {
            EmptyKind.NoneYet
        }
}

@HiltViewModel
class DocumentsViewModel
    @Inject
    constructor(
        private val artifacts: ArtifactRepository,
        private val modes: ViewModeRepository,
    ) : ViewModel() {
        private val mutableState = MutableStateFlow(DocumentsUiState())
        val state: StateFlow<DocumentsUiState> = mutableState.asStateFlow()

        private var loadJob: Job? = null
        private var debounceJob: Job? = null

        init {
            viewModelScope.launch { modes.mode.collect { mode -> mutableState.update { it.copy(viewMode = mode) } } }
            load(silent = false)
        }

        /** O texto da busca do menu: a leitura espera 250 ms depois da última tecla. */
        fun search(text: String) {
            mutableState.update { it.copy(query = text) }
            debounceJob?.cancel()
            debounceJob =
                viewModelScope.launch {
                    delay(SEARCH_DEBOUNCE_MS)
                    val trimmed = text.trim()
                    if (trimmed != mutableState.value.search) {
                        mutableState.update { it.copy(search = trimmed) }
                        load(silent = true)
                    }
                }
        }

        /** "Limpar filtros": apaga a busca; a escolha de executor continua, como no web. */
        fun clearFilters() {
            debounceJob?.cancel()
            val hadSearch = mutableState.value.search.isNotEmpty()
            mutableState.update { it.copy(query = "", search = "") }
            if (hadSearch) load(silent = true)
        }

        fun retry() = load(silent = false)

        /** Ao voltar à tela os documentos podem ter mudado (o chat, o agente): relê sem trocar a lista pelo esqueleto. */
        fun onResume() = load(silent = true)

        private fun load(silent: Boolean) {
            loadJob?.cancel()
            mutableState.update { if (silent) it.copy(failed = false) else it.copy(artifacts = null, failed = false) }
            val search = mutableState.value.search
            loadJob =
                viewModelScope.launch {
                    try {
                        val read = artifacts.list(ArtifactFilters(query = search.ifEmpty { null }))
                        mutableState.update {
                            // As opções (a legenda do menu) vêm da lista sem filtro, para não sumirem quando a busca estreita o resultado.
                            it.copy(artifacts = read, hasArtifacts = if (search.isEmpty()) read.isNotEmpty() else it.hasArtifacts)
                        }
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (failure: Exception) {
                        mutableState.update { it.copy(failed = true) }
                    }
                }
        }
    }
