package app.braid.mobile.data.session

import kotlinx.serialization.Serializable

@Serializable
data class StoredSession(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val email: String,
    val name: String,
)

/** Onde a sessão fica entre uma abertura e outra do app; em produção é cifrado pelo Keystore. */
interface SessionStorage {
    suspend fun read(): StoredSession?

    suspend fun write(session: StoredSession)

    suspend fun clear()
}
