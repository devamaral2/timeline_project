package app.braid.mobile.data.session

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.google.crypto.tink.Aead
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.aead.AeadKeyTemplates
import com.google.crypto.tink.integration.android.AndroidKeysetManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.util.Base64
import javax.inject.Inject

private val Context.sessionDataStore: DataStore<Preferences> by preferencesDataStore(name = "braid_session")

private const val KEYSET_NAME = "braid_session_keyset"
private const val KEYSET_PREFS = "braid_session_tink_prefs"
private const val MASTER_KEY_URI = "android-keystore://braid_session_master"
private const val AAD = "app.braid.mobile/session-v1"
private val ENCRYPTED_SESSION_KEY = stringPreferencesKey("encrypted_session")

@Serializable
data class SessionUser(
    val userId: String,
    val email: String,
    val name: String,
    val sessionId: String,
    val roles: List<String> = emptyList(),
    val permissions: List<String> = emptyList(),
    val denies: List<String> = emptyList(),
)

@Serializable
data class SessionSnapshot(
    val accessToken: String,
    val refreshToken: String,
    val user: SessionUser,
)

interface TokenStore {
    suspend fun read(): SessionSnapshot?

    suspend fun write(snapshot: SessionSnapshot)

    suspend fun clear()
}

/** Persiste somente o envelope cifrado; tokens nunca são gravados em claro. */
class DataStoreTokenStore
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
    ) : TokenStore {
        private val json = Json { explicitNulls = false }
        private val cipher: Aead by lazy { createKeystoreAead(context) }

        override suspend fun read(): SessionSnapshot? {
            val encoded = context.sessionDataStore.data.first()[ENCRYPTED_SESSION_KEY] ?: return null
            return runCatching {
                val encrypted = Base64.getDecoder().decode(encoded)
                val clear = cipher.decrypt(encrypted, AAD.toByteArray(Charsets.UTF_8))
                json.decodeFromString<SessionSnapshot>(clear.decodeToString())
            }.getOrNull()
        }

        override suspend fun write(snapshot: SessionSnapshot) {
            val clear = json.encodeToString(snapshot).encodeToByteArray()
            val encrypted = cipher.encrypt(clear, AAD.toByteArray(Charsets.UTF_8))
            val encoded = Base64.getEncoder().encodeToString(encrypted)
            context.sessionDataStore.edit { preferences -> preferences[ENCRYPTED_SESSION_KEY] = encoded }
        }

        override suspend fun clear() {
            context.sessionDataStore.edit { preferences -> preferences.remove(ENCRYPTED_SESSION_KEY) }
        }
    }

/** Codec isolado para que a cifra seja testável sem depender de Activity/Keystore. */
internal class SessionCipher(
    private val aead: Aead,
) {
    private val json = Json { explicitNulls = false }

    fun encrypt(snapshot: SessionSnapshot): String {
        val clear = json.encodeToString(snapshot).encodeToByteArray()
        return Base64.getEncoder().encodeToString(aead.encrypt(clear, AAD.toByteArray(Charsets.UTF_8)))
    }

    fun decrypt(encoded: String): SessionSnapshot {
        val clear = aead.decrypt(Base64.getDecoder().decode(encoded), AAD.toByteArray(Charsets.UTF_8))
        return json.decodeFromString(clear.decodeToString())
    }
}

private fun createKeystoreAead(context: Context): Aead {
    AeadConfig.register()
    return AndroidKeysetManager
        .Builder()
        .withSharedPref(context, KEYSET_NAME, KEYSET_PREFS)
        .withKeyTemplate(AeadKeyTemplates.AES256_GCM)
        .withMasterKeyUri(MASTER_KEY_URI)
        .build()
        .keysetHandle
        .getPrimitive(Aead::class.java)
}
