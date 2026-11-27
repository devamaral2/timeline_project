package app.braid.mobile.domain.request

import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * O aviso de que o próprio app acabou de abrir um pedido (o chat, a edição por IA, o pedido de uma tarefa): o
 * equivalente de `REQUEST_STARTED_SIGNAL` do web. A gaveta de execução relê a lista logo depois, em vez de esperar a
 * próxima batida.
 */
@Singleton
class RequestStarted
    @Inject
    constructor() {
        private val signal = MutableSharedFlow<Unit>(extraBufferCapacity = 1, onBufferOverflow = BufferOverflow.DROP_OLDEST)

        val signals: SharedFlow<Unit> = signal

        fun notifyStarted() {
            signal.tryEmit(Unit)
        }
    }
