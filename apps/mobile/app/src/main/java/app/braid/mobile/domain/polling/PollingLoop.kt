package app.braid.mobile.domain.polling

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** De quanto em quanto tempo se relê o pedido do agente aberto: no detalhe da tarefa, nas listas e nas barras de edição. */
const val AGENT_POLL_MS = 3_000L

/** O chat acompanha o pedido a cada 1 s, como o web (os 3 s valem para o detalhe e as listas). */
const val CHAT_POLL_MS = 1_000L

/** O alimento em cálculo é relido a cada 1,5 s. */
const val MEAL_POLL_MS = 1_500L

/** Quanto se espera um pedido terminar (a caixa de processo, a barra de edição, o "Pedir ao Hermes") antes de desistir. */
const val PROCESS_TIMEOUT_MS = 180_000L

/** Leituras seguidas que falham antes de desistir de acompanhar um pedido. */
const val POLL_FAILURES_LIMIT = 5

/**
 * A releitura periódica de uma tela, ligada enquanto houver o que reler e a tela estiver à vista. Chame [sync] a cada
 * mudança do que decide isso; ele liga o laço se ainda não roda e o desliga quando [sync] vê que não há mais o que reler.
 * Com [readFirst] a primeira leitura vem logo ao ligar; sem ele, só depois de uma espera de [intervalMs].
 */
class PollingLoop(
    private val scope: CoroutineScope,
    private val intervalMs: Long = AGENT_POLL_MS,
    private val readFirst: Boolean = false,
) {
    private var job: Job? = null

    /** Liga o laço de [tick] enquanto [active] for verdadeiro, ou o desliga se já não for. */
    fun sync(
        active: () -> Boolean,
        tick: suspend () -> Unit,
    ) {
        if (!active()) {
            stop()
            return
        }
        if (job?.isActive == true) return
        job =
            scope.launch {
                while (active()) {
                    if (!readFirst) delay(intervalMs)
                    tick()
                    if (readFirst) {
                        if (!active()) break
                        delay(intervalMs)
                    }
                }
            }
    }

    fun stop() {
        job?.cancel()
        job = null
    }
}
