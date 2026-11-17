package app.braid.mobile.support

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin

/**
 * Fecha os escopos dos DataStores e espera cada um terminar de verdade.
 *
 * `scope.cancel()` só pede o cancelamento: o DataStore solta o arquivo (o registro de "arquivo ativo")
 * quando o Job do escopo completa, e isso acontece depois, numa thread do Dispatchers.IO. Reabrir o
 * arquivo logo após o `cancel()` corria contra isso e falhava, uma vez a cada duas, com
 * "There are multiple DataStores active for the same file".
 */
suspend fun Iterable<CoroutineScope>.closeAndJoin() = forEach { it.coroutineContext[Job]?.cancelAndJoin() }
