package app.braid.mobile.data.execution

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.braid.mobile.domain.execution.ExecutionDrawerMode
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
class ExecutionDrawerModeStoreTest {
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
    fun `with nothing stored the height is three rows`() =
        runBlocking {
            assertEquals(ExecutionDrawerMode.Three, DataStoreExecutionDrawerModeRepository(open()).mode.first())
        }

    @Test
    fun `the chosen height survives closing the app`() =
        runBlocking {
            DataStoreExecutionDrawerModeRepository(open()).select(ExecutionDrawerMode.All)
            scopes.closeAndJoin()

            assertEquals(ExecutionDrawerMode.All, DataStoreExecutionDrawerModeRepository(open()).mode.first())
        }

    @Test
    fun `an unknown stored value is three rows`() =
        runBlocking {
            val store = open()
            store.edit { it[stringPreferencesKey("execution_drawer_mode")] = "robots" }

            assertEquals(ExecutionDrawerMode.Three, DataStoreExecutionDrawerModeRepository(store).mode.first())
        }
}
