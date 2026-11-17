package app.braid.mobile.data.session

import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.aead.AeadKeyTemplates
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertThrows
import org.junit.Before
import org.junit.Test
import java.security.GeneralSecurityException

class SessionCipherTest {
    private lateinit var aead: Aead
    private val session =
        StoredSession(
            accessToken = "access-secreto",
            refreshToken = "refresh-secreto",
            userId = "user-1",
            email = "admin@admin.com",
            name = "Admin",
        )

    @Before
    fun setUp() {
        AeadConfig.register()
        aead = KeysetHandle.generateNew(AeadKeyTemplates.AES256_GCM).getPrimitive(Aead::class.java)
    }

    @Test
    fun `a session survives a round trip`() {
        val cipher = SessionCipher(aead)

        assertEquals(session, cipher.decrypt(cipher.encrypt(session)))
    }

    @Test
    fun `the stored text never contains a token in the clear`() {
        val stored = SessionCipher(aead).encrypt(session)

        assertFalse(stored.contains("access-secreto"))
        assertFalse(stored.contains("refresh-secreto"))
    }

    @Test
    fun `a tampered envelope is rejected`() {
        val cipher = SessionCipher(aead)
        val stored = cipher.encrypt(session)
        val tampered = stored.dropLast(4) + if (stored.endsWith("AAAA")) "BBBB" else "AAAA"

        assertThrows(GeneralSecurityException::class.java) { cipher.decrypt(tampered) }
    }
}
