package app.braid.mobile.domain.request

import app.braid.mobile.domain.polling.AGENT_POLL_MS
import app.braid.mobile.domain.polling.POLL_FAILURES_LIMIT
import app.braid.mobile.domain.polling.PROCESS_TIMEOUT_MS
import app.braid.mobile.domain.time.AppClock
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import java.time.Duration

/** Como o acompanhamento de um pedido terminou. */
sealed interface RequestFollow {
    /** O pedido saiu da fila: terminou, falhou ou foi cancelado. */
    data class Closed(
        val request: AgentRequest,
    ) : RequestFollow

    /** [POLL_FAILURES_LIMIT] leituras seguidas falharam. */
    data object Lost : RequestFollow

    /** O pedido seguia aberto passados [PROCESS_TIMEOUT_MS]. */
    data object TimedOut : RequestFollow
}

/**
 * Acompanha um pedido até ele fechar: lê a cada [intervalMs], a primeira leitura só depois da primeira espera (ou logo,
 * com [readFirst]), chama [onRead] com cada leitura que deu certo e desiste depois de [POLL_FAILURES_LIMIT] falhas
 * seguidas ou de [PROCESS_TIMEOUT_MS] contados pelo [clock]. Uma falha isolada só adia para a próxima leitura. [beforeRead]
 * espera a tela estar à vista; o prazo conta pelo relógio, então o tempo com a tela parada também o gasta, como no web.
 */
suspend fun followRequest(
    clock: AppClock,
    read: suspend () -> AgentRequest,
    onRead: (AgentRequest) -> Unit = {},
    beforeRead: suspend () -> Unit = {},
    intervalMs: Long = AGENT_POLL_MS,
    readFirst: Boolean = false,
): RequestFollow {
    val startedAt = clock.now()
    var failures = 0
    var first = true
    while (true) {
        if (!(readFirst && first)) {
            delay(intervalMs)
            beforeRead()
        }
        first = false
        try {
            val view = read()
            failures = 0
            onRead(view)
            if (!isOpenRequest(view.status)) return RequestFollow.Closed(view)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            failures += 1
            if (failures >= POLL_FAILURES_LIMIT) return RequestFollow.Lost
        }
        if (Duration.between(startedAt, clock.now()).toMillis() > PROCESS_TIMEOUT_MS) return RequestFollow.TimedOut
    }
}
