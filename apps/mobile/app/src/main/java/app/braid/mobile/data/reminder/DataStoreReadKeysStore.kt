package app.braid.mobile.data.reminder

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import app.braid.mobile.domain.reminder.ReadKeysStore
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** As chaves lidas do feed no DataStore (`notifications_read`), o `braid:notifications:read` do web. */
@Singleton
class DataStoreReadKeysStore
    @Inject
    constructor(
        store: DataStore<Preferences>,
    ) : ReadKeysStore {
        private val keys = AnchoredKeys(store, "notifications_read")

        override suspend fun read(): Map<String, Instant> = keys.read()

        override suspend fun write(read: Map<String, Instant>) = keys.write(read)
    }
