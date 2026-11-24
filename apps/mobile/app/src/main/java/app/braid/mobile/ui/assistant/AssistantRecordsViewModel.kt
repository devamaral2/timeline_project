package app.braid.mobile.ui.assistant

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import app.braid.mobile.domain.request.EntityKind
import app.braid.mobile.domain.request.RequestEntity
import app.braid.mobile.domain.request.RequestOperation
import app.braid.mobile.domain.task.TaskCard
import app.braid.mobile.domain.task.TaskDetailRepository
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * As tarefas que a resposta do assistente criou ou alterou, lidas para o cartão do painel. O pedido devolve só o nome de
 * cada registro; o tipo e o horário vêm da própria tarefa. A que não dá para ler (rede, apagada no meio) fica de fora, e o
 * cartão mostra só o nome.
 */
class AssistantRecordsViewModel(
    private val tasks: TaskDetailRepository,
) : ViewModel() {
    private val mutableCards = MutableStateFlow<Map<String, TaskCard>>(emptyMap())

    /** Cada tarefa lida, pelo id. */
    val cards: StateFlow<Map<String, TaskCard>> = mutableCards.asStateFlow()

    /** Lê as tarefas de [entities]. Documentos e tarefas apagadas não têm o que ler. */
    fun show(entities: List<RequestEntity>) {
        for (entity in entities) {
            if (entity.kind != EntityKind.Task || entity.operation == RequestOperation.Delete) continue
            viewModelScope.launch {
                try {
                    val card = tasks.task(entity.id).card
                    mutableCards.update { it + (entity.id to card) }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // Sem a tarefa o cartão segue só com o nome.
                }
            }
        }
    }
}
