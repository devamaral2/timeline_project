package app.braid.mobile.data.agenda

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import app.braid.mobile.support.closeAndJoin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** O DataStore é o de verdade, num arquivo temporário: "fechar o app" é abrir outro DataStore no mesmo arquivo. */
class FreeTimeStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val scopes = mutableListOf<CoroutineScope>()

    @After
    fun tearDown() = runBlocking { scopes.closeAndJoin() }

    private fun open() =
        PreferenceDataStoreFactory
            .create(scope = CoroutineScope(SupervisorJob() + Dispatchers.IO).also(scopes::add)) {
                folder.root.resolve("settings.preferences_pb")
            }

    @Test
    fun `with nothing stored free time is on, as in the web`() =
        runBlocking {
            assertEquals(true, DataStoreFreeTimeRepository(open()).enabled.first())
        }

    @Test
    fun `turning free time off survives closing the app, and on again too`() =
        runBlocking {
            DataStoreFreeTimeRepository(open()).select(false)
            scopes.closeAndJoin()
            assertEquals(false, DataStoreFreeTimeRepository(open()).enabled.first())
            scopes.closeAndJoin()

            DataStoreFreeTimeRepository(open()).select(true)
            scopes.closeAndJoin()
            assertEquals(true, DataStoreFreeTimeRepository(open()).enabled.first())
        }

    @Test
    fun `an unreadable stored value is the default`() =
        runBlocking {
            val store = open()
            store.edit { it[booleanPreferencesKey("agenda_free_time")] = false }
            store.edit { it.remove(booleanPreferencesKey("agenda_free_time")) }

            assertEquals(true, DataStoreFreeTimeRepository(store).enabled.first())
        }
}
