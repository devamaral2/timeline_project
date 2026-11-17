package app.braid.mobile.domain.chat

import app.braid.mobile.domain.polling.CHAT_POLL_MS
import app.braid.mobile.domain.polling.POLL_FAILURES_LIMIT
import app.braid.mobile.domain.polling.PROCESS_TIMEOUT_MS

/**
 * Os tempos do acompanhamento do pedido. O web consulta a cada 1 s (os 3 s valem para o detalhe e as listas), desiste
 * depois de [timeoutMs] e de [failuresLimit] falhas seguidas.
 */
data class ChatPolling(
    val intervalMs: Long = CHAT_POLL_MS,
    val timeoutMs: Long = PROCESS_TIMEOUT_MS,
    val failuresLimit: Int = POLL_FAILURES_LIMIT,
)
