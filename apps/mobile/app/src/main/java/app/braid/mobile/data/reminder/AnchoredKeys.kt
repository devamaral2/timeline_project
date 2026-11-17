package app.braid.mobile.data.reminder

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringSetPreferencesKey
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.first
import java.io.IOException
import java.time.Instant

/**
 * Chaves de lembrete com o instante de referência da tarefa no DataStore, uma entrada `<âncora em ms>|<chave>` por
 * chave; entrada ilegível some. É o formato das chaves disparadas e das lidas.
 */
internal class AnchoredKeys(
    private val store: DataStore<Preferences>,
    name: String,
) {
    private val key = stringSetPreferencesKey(name)

    suspend fun read(): Map<String, Instant> {
        val entries =
            store.data
                .catch { failure -> if (failure is IOException) emit(emptyPreferences()) else throw failure }
                .first()[key]
                .orEmpty()
        return entries.mapNotNull(::decode).toMap()
    }

    suspend fun write(keys: Map<String, Instant>) {
        store.edit { it[key] = keys.map { (id, anchor) -> "${anchor.toEpochMilli()}|$id" }.toSet() }
    }

    private fun decode(entry: String): Pair<String, Instant>? {
        val separator = entry.indexOf('|')
        if (separator <= 0) return null
        val millis = entry.substring(0, separator).toLongOrNull() ?: return null
        return entry.substring(separator + 1) to Instant.ofEpochMilli(millis)
    }
}
