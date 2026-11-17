package app.braid.mobile.data.reminder

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringSetPreferencesKey
import app.braid.mobile.support.closeAndJoin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.time.Instant

/** As chaves já disparadas no DataStore de verdade, num arquivo temporário: "fechar o app" é abrir outro DataStore no mesmo arquivo. */
class FiredKeysStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val scopes = mutableListOf<CoroutineScope>()

    @After
    fun tearDown() = runBlocking { scopes.closeAndJoin() }

    private fun open() =
        PreferenceDataStoreFactory
            .create(
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO).also(scopes::add),
            ) { folder.root.resolve("settings.preferences_pb") }

    @Test
    fun `with nothing stored no key was fired`() =
        runBlocking {
            assertEquals(emptyMap<String, Instant>(), DataStoreFiredKeysStore(open()).read())
        }

    @Test
    fun `the fired keys and their anchors survive closing the app`() =
        runBlocking {
            val fired =
                mapOf(
                    "meeting:2026-09-14T18:00:00.000Z:30" to Instant.parse("2026-09-14T18:00:00.000Z"),
                    "task|with|bars:2026-09-14T18:00:00.000Z:5" to Instant.parse("2026-09-15T09:30:00.123Z"),
                )
            DataStoreFiredKeysStore(open()).write(fired)
            scopes.closeAndJoin()

            assertEquals(fired, DataStoreFiredKeysStore(open()).read())
        }

    @Test
    fun `writing replaces what was there`() =
        runBlocking {
            val store = DataStoreFiredKeysStore(open())
            store.write(mapOf("a:x:1" to Instant.parse("2026-09-14T18:00:00Z")))
            store.write(emptyMap())

            assertEquals(emptyMap<String, Instant>(), store.read())
        }

    @Test
    fun `an unreadable entry is ignored`() =
        runBlocking {
            val dataStore = open()
            dataStore.edit { it[stringSetPreferencesKey("reminders_fired")] = setOf("garbage", "abc|x", "1789408800000|ok:1") }

            assertEquals(mapOf("ok:1" to Instant.ofEpochMilli(1789408800000)), DataStoreFiredKeysStore(dataStore).read())
        }
}
