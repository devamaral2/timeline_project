package app.braid.mobile.support

import okhttp3.mockwebserver.Dispatcher
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import okhttp3.mockwebserver.RecordedRequest
import java.util.concurrent.CopyOnWriteArrayList

/**
 * A fronteira de rede dos testes: um servidor que responde no lugar do Auth e
 * da API, com fixtures geradas dos contratos. Tudo acima dele é código real do
 * app (Retrofit, OkHttp, `Authenticator`, repositório, ViewModel).
 *
 * As rotas são por método e caminho; uma rota com várias respostas as serve em
 * ordem e repete a última. Rota sem resposta devolve 404 e fica registrada.
 */
class TestBackend : AutoCloseable {
    private val server = MockWebServer()
    private val handlers = mutableMapOf<String, (RecordedRequest) -> MockResponse>()
    private val recorded = CopyOnWriteArrayList<RecordedRequest>()

    val url: String get() = server.url("/").toString()

    /** Todas as requisições recebidas, na ordem de chegada. */
    val requests: List<RecordedRequest> get() = recorded.toList()

    init {
        server.dispatcher =
            object : Dispatcher() {
                override fun dispatch(request: RecordedRequest): MockResponse {
                    recorded += request
                    val key = "${request.method} ${request.requestUrl?.encodedPath}"
                    return handlers[key]?.invoke(request) ?: MockResponse().setResponseCode(404)
                }
            }
        server.start()
    }

    fun route(
        method: String,
        path: String,
        vararg responses: MockResponse,
    ) {
        val queue = ArrayDeque(responses.toList())
        route(method, path) {
            synchronized(queue) { if (queue.size > 1) queue.removeFirst() else queue.first() }
        }
    }

    fun route(
        method: String,
        path: String,
        handler: (RecordedRequest) -> MockResponse,
    ) {
        handlers["$method $path"] = handler
    }

    fun requestsTo(
        method: String,
        path: String,
    ): List<RecordedRequest> = requests.filter { it.method == method && it.requestUrl?.encodedPath == path }

    override fun close() = server.shutdown()

    companion object {
        fun fixture(
            name: String,
            code: Int = 200,
        ): MockResponse =
            MockResponse()
                .setResponseCode(code)
                .setHeader("Content-Type", "application/json")
                .setBody(Fixtures.text(name))

        fun status(code: Int): MockResponse = MockResponse().setResponseCode(code).setBody("{}")
    }
}
