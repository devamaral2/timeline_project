package app.braid.mobile.data.executor

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.braid.mobile.domain.executor.ViewMode
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** O DataStore é o de verdade, num arquivo temporário: "fechar o app" é abrir outro DataStore no mesmo arquivo. */
class ViewModeStoreTest {
    @get:Rule
    val folder = TemporaryFolder()

    private val scopes = mutableListOf<CoroutineScope>()

    @Before
    fun setUp() = Unit

    @After
    fun tearDown() = scopes.forEach { it.cancel() }

    private fun open() =
        PreferenceDataStoreFactory
            .create(
                scope = CoroutineScope(SupervisorJob() + Dispatchers.IO).also(scopes::add),
            ) { folder.root.resolve("settings.preferences_pb") }

    @Test
    fun `with nothing stored the mode is everyone`() =
        runBlocking {
            assertEquals(ViewMode.All, DataStoreViewModeRepository(open()).mode.first())
        }

    @Test
    fun `the chosen mode survives closing the app`() =
        runBlocking {
            val firstRun = open()
            DataStoreViewModeRepository(firstRun).select(ViewMode.Agent)
            scopes.forEach { it.cancel() }

            assertEquals(ViewMode.Agent, DataStoreViewModeRepository(open()).mode.first())
        }

    @Test
    fun `an unknown stored value is the default`() =
        runBlocking {
            val store = open()
            store.edit { it[stringPreferencesKey("view_mode")] = "robots" }

            assertEquals(ViewMode.All, DataStoreViewModeRepository(store).mode.first())
        }
}
