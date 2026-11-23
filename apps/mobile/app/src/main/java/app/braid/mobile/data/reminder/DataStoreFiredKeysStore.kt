package app.braid.mobile.data.reminder

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import app.braid.mobile.domain.reminder.FiredKeysStore
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

/** As chaves disparadas no DataStore (`reminders_fired`). */
@Singleton
class DataStoreFiredKeysStore
    @Inject
    constructor(
        store: DataStore<Preferences>,
    ) : FiredKeysStore {
        private val keys = AnchoredKeys(store, "reminders_fired")

        override suspend fun read(): Map<String, Instant> = keys.read()

        override suspend fun write(fired: Map<String, Instant>) = keys.write(fired)
    }
