package app.braid.mobile.ui.documents

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.artifact.Artifact
import app.braid.mobile.domain.artifact.ArtifactDrawer
import app.braid.mobile.domain.artifact.ArtifactFilters
import app.braid.mobile.domain.artifact.ArtifactRepository
import app.braid.mobile.domain.artifact.ArtifactType
import app.braid.mobile.domain.artifact.artifactActor
import app.braid.mobile.domain.artifact.artifactCountLabel
import app.braid.mobile.domain.artifact.artifactDrawerStartsOpen
import app.braid.mobile.domain.artifact.artifactDrawersOf
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

const val FAILED_DOCUMENTS_PULL_NOTICE = "Não foi possível atualizar os artefatos. Tente novamente."

/** Por que a lista está vazia: ainda não há artefato ou os filtros escondem todos. */
enum class EmptyKind { NoneYet, NothingFound }

/**
 * [artifacts] são os artefatos como a API os devolveu para a [search]; a escolha de executor separa aqui, na
 * tela, porque a API não filtra por dono. [query] é o que está digitado e [search] o texto já lido (aparado e depois da espera).
 */
data class DocumentsUiState(
    val artifacts: List<Artifact>? = null,
    val failed: Boolean = false,
    val query: String = "",
    val search: String = "",
    val viewMode: ViewMode = ViewMode.Default,
    /** Há artefato na lista sem filtro: só então a busca do menu aparece. */
    val hasArtifacts: Boolean = false,
    /** Um puxar para recarregar está em curso: o indicador gira; as leituras automáticas não acendem isto. */
    val refreshing: Boolean = false,
    /** O aviso do puxar que falhou, com a lista mantida; some na próxima leitura que dá certo. */
    val notice: String? = null,
    /** O que a pessoa abriu ou fechou na lista inteira. */
    val browsedDrawers: Map<ArtifactType, Boolean> = emptyMap(),
    /** O que ela abriu ou fechou com a busca [narrowedSearch]; outra busca começa do zero. */
    val narrowedDrawers: Map<ArtifactType, Boolean> = emptyMap(),
    val narrowedSearch: String = "",
) {
    val shown: List<Artifact>? =
        artifacts?.let { all -> viewMode.actor?.let { actor -> all.filter { artifactActor(it.type) == actor } } ?: all }

    /** Uma gaveta por tipo do que está à vista. */
    val drawers: List<ArtifactDrawer> = artifactDrawersOf(shown.orEmpty())

    private val drawerChoices: Map<ArtifactType, Boolean>
        get() =
            when (search) {
                "" -> browsedDrawers
                narrowedSearch -> narrowedDrawers
                else -> emptyMap()
            }

    fun isExpanded(drawer: ArtifactDrawer): Boolean =
        drawerChoices[drawer.type] ?: artifactDrawerStartsOpen(drawer.type, drawers.size, filtered)

    /** Abre a gaveta fechada e fecha a aberta. */
    fun toggled(drawer: ArtifactDrawer): DocumentsUiState {
        val choices = drawerChoices + (drawer.type to !isExpanded(drawer))
        return if (search.isEmpty()) copy(browsedDrawers = choices) else copy(narrowedDrawers = choices, narrowedSearch = search)
    }

    /** A legenda no topo: "Artefatos" até a lista chegar, depois a contagem. */
    val caption: String get() = shown?.let { artifactCountLabel(it.size) } ?: "Artefatos"

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

        fun toggleDrawer(drawer: ArtifactDrawer) = mutableState.update { it.toggled(drawer) }

        fun retry() = load(silent = false)

        /**
         * O puxar para recarregar: relê a lista com a busca de agora sem o esqueleto, e o indicador gira até a leitura
         * acabar. Falha mantém a lista e avisa. Não faz nada na primeira leitura nem com outro puxar em curso; no erro
         * da primeira leitura serve de "Tentar de novo".
         */
        fun pull() {
            val current = mutableState.value
            if (current.refreshing || (current.artifacts == null && !current.failed)) return
            mutableState.update { it.copy(refreshing = true) }
            load(silent = true)
        }

        /** Ao voltar à tela os artefatos podem ter mudado (o chat, o agente): relê sem trocar a lista pelo esqueleto. */
        fun onResume() = load(silent = true)

        private fun load(silent: Boolean) {
            loadJob?.cancel()
            mutableState.update {
                when {
                    // Uma leitura com esqueleto assume o lugar de um puxar em curso e o encerra.
                    !silent -> it.copy(artifacts = null, failed = false, refreshing = false)
                    // Um puxar mantém o erro na tela até a leitura voltar.
                    it.refreshing -> it
                    else -> it.copy(failed = false)
                }
            }
            val search = mutableState.value.search
            loadJob =
                viewModelScope.launch {
                    try {
                        val read = artifacts.list(ArtifactFilters(query = search.ifEmpty { null }))
                        mutableState.update {
                            // As opções (a legenda do menu) vêm da lista sem filtro, para não sumirem quando a busca estreita o resultado.
                            it.copy(
                                artifacts = read,
                                hasArtifacts = if (search.isEmpty()) read.isNotEmpty() else it.hasArtifacts,
                                failed = false,
                                refreshing = false,
                                notice = null,
                            )
                        }
                    } catch (cancelled: CancellationException) {
                        throw cancelled
                    } catch (failure: Exception) {
                        // Um puxar que falha deixa a lista e avisa; no erro da primeira leitura o erro já está na tela.
                        mutableState.update {
                            if (it.refreshing && !it.failed) {
                                it.copy(refreshing = false, notice = FAILED_DOCUMENTS_PULL_NOTICE)
                            } else {
                                it.copy(failed = true, refreshing = false)
                            }
                        }
                    }
                }
        }
    }
