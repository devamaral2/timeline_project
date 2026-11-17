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
import javax.inject.Inject
import javax.inject.Singleton

private val Context.sessionDataStore: DataStore<Preferences> by preferencesDataStore(name = "braid_session")
private val ENCRYPTED_SESSION = stringPreferencesKey("encrypted_session")

private const val KEYSET_NAME = "braid_session_keyset"
private const val KEYSET_PREFERENCES = "braid_session_tink_prefs"
private const val MASTER_KEY_URI = "android-keystore://braid_session_master"

/** Só o envelope cifrado vai para o DataStore; token nenhum é gravado em claro. */
@Singleton
class DataStoreSessionStorage
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
    ) : SessionStorage {
        private val cipher by lazy { SessionCipher(keystoreAead(context)) }

        override suspend fun read(): StoredSession? {
            val stored = context.sessionDataStore.data.first()[ENCRYPTED_SESSION] ?: return null
            // Envelope ilegível (chave perdida, dado corrompido) vale como sem sessão.
            return runCatching { cipher.decrypt(stored) }.getOrNull()
        }

        override suspend fun write(session: StoredSession) {
            val encrypted = cipher.encrypt(session)
            context.sessionDataStore.edit { it[ENCRYPTED_SESSION] = encrypted }
        }

        override suspend fun clear() {
            context.sessionDataStore.edit { it.remove(ENCRYPTED_SESSION) }
        }
    }

private fun keystoreAead(context: Context): Aead {
    AeadConfig.register()
    return AndroidKeysetManager
        .Builder()
        .withSharedPref(context, KEYSET_NAME, KEYSET_PREFERENCES)
        .withKeyTemplate(AeadKeyTemplates.AES256_GCM)
        .withMasterKeyUri(MASTER_KEY_URI)
        .build()
        .keysetHandle
        .getPrimitive(Aead::class.java)
}
