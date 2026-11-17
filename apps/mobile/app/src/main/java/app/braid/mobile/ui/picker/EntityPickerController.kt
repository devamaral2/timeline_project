package app.braid.mobile.ui.picker

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/** Espera depois da última tecla antes de consultar; a mesma pausa da lista de tarefas e do web. */
const val PICKER_DEBOUNCE_MILLIS = 250L

enum class PickerSearchStatus { Loading, Ready, Failed }

/**
 * O que a folha de seleção mostra: o texto digitado, os resultados que a pessoa pode escolher (já sem os excluídos) e o
 * estado da busca. [query] é o texto sem espaços nas pontas que a última busca usou; vazio, os primeiros itens.
 */
data class EntityPickerState<T>(
    val typed: String = "",
    val query: String = "",
    val results: List<T> = emptyList(),
    val status: PickerSearchStatus = PickerSearchStatus.Loading,
)

/**
 * O motor da folha de seleção de entidade (tarefas da hierarquia hoje, documentos da tarefa depois): abre buscando os
 * primeiros itens, refaz a busca 250 ms depois da última tecla e descarta a resposta de uma busca que já foi trocada.
 * Não sabe de que é a lista: quem o usa passa a fonte ([search]) e quem fica de fora ([keep]).
 */
class EntityPickerController<T>(
    private val scope: CoroutineScope,
    private val search: suspend (String) -> List<T>,
    private val keep: (T) -> Boolean = { true },
    private val debounceMillis: Long = PICKER_DEBOUNCE_MILLIS,
) {
    private val mutableState = MutableStateFlow(EntityPickerState<T>())
    val state: StateFlow<EntityPickerState<T>> = mutableState.asStateFlow()

    private var typingJob: Job? = null
    private var searchJob: Job? = null

    init {
        run("")
    }

    /** O campo de busca mudou: o texto aparece na hora e a busca espera a pausa. */
    fun type(text: String) {
        mutableState.update { it.copy(typed = text) }
        typingJob?.cancel()
        val next = text.trim()
        if (next == mutableState.value.query) return
        typingJob =
            scope.launch {
                delay(debounceMillis)
                run(next)
            }
    }

    fun close() {
        typingJob?.cancel()
        searchJob?.cancel()
    }

    private fun run(query: String) {
        searchJob?.cancel()
        mutableState.update { it.copy(query = query, status = PickerSearchStatus.Loading) }
        searchJob =
            scope.launch {
                try {
                    val found = search(query).filter(keep)
                    mutableState.update { it.copy(results = found, status = PickerSearchStatus.Ready) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (failure: Exception) {
                    mutableState.update { it.copy(status = PickerSearchStatus.Failed) }
                }
            }
    }
}
