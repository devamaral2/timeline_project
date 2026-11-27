package app.braid.mobile.support

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Segura as respostas de uma rota do [TestBackend] enquanto está fechada: um puxar para recarregar fica "em voo"
 * até o teste abri-la. Aberta (o estado inicial), deixa tudo passar. A rota chama [pass] antes de responder.
 */
class RequestGate {
    @Volatile
    private var latch: CountDownLatch? = null

    fun close() {
        latch = CountDownLatch(1)
    }

    fun open() {
        latch?.countDown()
    }

    /** Chamado na thread do servidor: espera a abertura, no máximo 5 s, para um teste esquecido não travar. */
    fun pass() {
        latch?.await(5, TimeUnit.SECONDS)
    }
}
