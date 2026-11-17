package app.braid.mobile.data.session

import app.braid.mobile.core.network.BraidJson
import com.google.crypto.tink.Aead
import java.util.Base64

private const val ASSOCIATED_DATA = "app.braid.mobile/session-v1"

/** Cifra e decifra a sessão; isolada do Keystore para ser testada na JVM. */
class SessionCipher(
    private val aead: Aead,
) {
    fun encrypt(session: StoredSession): String {
        val clear = BraidJson.encodeToString(StoredSession.serializer(), session).encodeToByteArray()
        return Base64.getEncoder().encodeToString(aead.encrypt(clear, ASSOCIATED_DATA.encodeToByteArray()))
    }

    fun decrypt(stored: String): StoredSession {
        val clear = aead.decrypt(Base64.getDecoder().decode(stored), ASSOCIATED_DATA.encodeToByteArray())
        return BraidJson.decodeFromString(StoredSession.serializer(), clear.decodeToString())
    }
}
