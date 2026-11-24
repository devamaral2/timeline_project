package app.braid.mobile.support

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout

/**
 * Fecha os escopos dos DataStores e espera cada um terminar de verdade.
 *
 * `scope.cancel()` só pede o cancelamento: o DataStore solta o arquivo (o registro de "arquivo ativo")
 * quando o Job do escopo completa, e isso acontece depois, numa thread do Dispatchers.IO. Reabrir o
 * arquivo logo após o `cancel()` corria contra isso e falhava, uma vez a cada duas, com
 * "There are multiple DataStores active for the same file".
 */
suspend fun Iterable<CoroutineScope>.closeAndJoin() = forEach { it.coroutineContext[Job]?.cancelAndJoin() }

/**
 * Espera, em tempo real, um valor que o app grava no DataStore fora da tela, relendo até [wanted] valer.
 *
 * Não é `first { wanted(it) }` de propósito. Uma coleta que começa no meio de uma gravação do DataStore pode ler o
 * arquivo antigo já com o número de versão novo; quando a gravação termina, o valor novo chega com essa mesma
 * versão e a coleta o descarta como repetido, ficando presa para sempre. Com poucos núcleos (o runner do CI) esse
 * encaixe acontece quase sempre, e aumentar o tempo de espera não resolve. Cada releitura é uma coleta nova, que
 * parte do que já está gravado.
 */
suspend fun <T> Flow<T>.awaitStored(
    timeoutMillis: Long = 30_000,
    wanted: (T) -> Boolean,
): T =
    withContext(Dispatchers.Default) {
        withTimeout(timeoutMillis) {
            var value = first()
            while (!wanted(value)) {
                delay(10)
                value = first()
            }
            value
        }
    }
