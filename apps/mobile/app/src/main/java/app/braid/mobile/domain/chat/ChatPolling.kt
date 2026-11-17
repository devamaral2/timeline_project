package app.braid.mobile.domain.chat

/**
 * Os tempos do acompanhamento do pedido. O web consulta a cada 1 s (os 3 s valem para o detalhe e as listas), desiste
 * depois de [timeoutMs] e de [failuresLimit] falhas seguidas.
 */
data class ChatPolling(
    val intervalMs: Long = POLL_MS,
    val timeoutMs: Long = PROCESS_TIMEOUT_MS,
    val failuresLimit: Int = POLL_FAILURES,
) {
    companion object {
        const val POLL_MS = 1_000L
        const val PROCESS_TIMEOUT_MS = 180_000L
        const val POLL_FAILURES = 5
    }
}
