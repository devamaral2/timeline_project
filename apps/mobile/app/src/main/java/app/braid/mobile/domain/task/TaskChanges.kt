package app.braid.mobile.domain.task

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * O aviso de que uma tarefa mudou (status, prioridade, exclusão…): o equivalente do evento de atualização da agenda
 * do web. Os lembretes releem a fonte quando ele chega.
 */
@Singleton
class TaskChanges
    @Inject
    constructor() {
        private val signal = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)

        val signals: SharedFlow<Unit> = signal

        fun notifyChanged() {
            signal.tryEmit(Unit)
        }
    }
