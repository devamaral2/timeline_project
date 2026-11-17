package app.braid.mobile.data.reminder

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringSetPreferencesKey
import app.braid.mobile.domain.reminder.FiredKeysStore
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import java.io.IOException
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

private val FIRED = stringSetPreferencesKey("reminders_fired")

/** As chaves disparadas no DataStore, uma entrada `<âncora em ms>|<chave>` por chave; entrada ilegível some. */
@Singleton
class DataStoreFiredKeysStore
    @Inject
    constructor(
        private val store: DataStore<Preferences>,
    ) : FiredKeysStore {
        override suspend fun read(): Map<String, Instant> {
            val entries =
                store.data
                    .catch { failure -> if (failure is IOException) emit(emptyPreferences()) else throw failure }
                    .first()[FIRED]
                    .orEmpty()
            return entries.mapNotNull(::decode).toMap()
        }

        override suspend fun write(fired: Map<String, Instant>) {
            store.edit { it[FIRED] = fired.map { (key, anchor) -> "${anchor.toEpochMilli()}|$key" }.toSet() }
        }

        private fun decode(entry: String): Pair<String, Instant>? {
            val separator = entry.indexOf('|')
            if (separator <= 0) return null
            val millis = entry.substring(0, separator).toLongOrNull() ?: return null
            return entry.substring(separator + 1) to Instant.ofEpochMilli(millis)
        }
    }
