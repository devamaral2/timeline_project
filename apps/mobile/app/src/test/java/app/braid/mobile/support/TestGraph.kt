package app.braid.mobile.support

import app.braid.mobile.core.network.ApiClientFactory
import app.braid.mobile.core.network.createAuthApi
import app.braid.mobile.data.session.DefaultSessionRepository
import app.braid.mobile.data.session.SessionStorage
import app.braid.mobile.data.session.StoredSession

/** Guarda a sessão na memória: o armazenamento cifrado é uma das trocas da fronteira de teste. */
class InMemorySessionStorage(
    var session: StoredSession? = null,
) : SessionStorage {
    override suspend fun read(): StoredSession? = session

    override suspend fun write(session: StoredSession) {
        this.session = session
    }

    override suspend fun clear() {
        session = null
    }
}

/** A mesma ligação de produção, apontada para o [TestBackend]. */
class TestGraph(
    val backend: TestBackend,
    val storage: InMemorySessionStorage = InMemorySessionStorage(),
) {
    val sessionRepository = DefaultSessionRepository(storage, createAuthApi(backend.url))
    val apis = ApiClientFactory(backend.url, sessionRepository)
}
