package app.braid.mobile.data.session

import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.aead.AeadKeyTemplates
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.BeforeClass
import org.junit.Test

class SessionCipherTest {
    private val snapshot =
        SessionSnapshot(
            accessToken = "access-token",
            refreshToken = "refresh-token",
            user = SessionUser("user-1", "user@example.com", "User", "session-1"),
        )

    @Test
    fun encryptsAndDecryptsTheWholeSessionSnapshot() =
        runTest {
            val cipher = SessionCipher(newAead())
            val encoded = cipher.encrypt(snapshot)

            assertNotEquals(snapshot.accessToken, encoded)
            assertEquals(snapshot, cipher.decrypt(encoded))
        }

    @Test(expected = Exception::class)
    fun ciphertextCannotBeDecryptedWithAnotherKey() =
        runTest {
            val encoded = SessionCipher(newAead()).encrypt(snapshot)
            SessionCipher(newAead()).decrypt(encoded)
        }

    private fun newAead(): Aead = KeysetHandle.generateNew(AeadKeyTemplates.AES256_GCM).getPrimitive(Aead::class.java)

    companion object {
        @JvmStatic
        @BeforeClass
        fun registerTink() {
            AeadConfig.register()
        }
    }
}
