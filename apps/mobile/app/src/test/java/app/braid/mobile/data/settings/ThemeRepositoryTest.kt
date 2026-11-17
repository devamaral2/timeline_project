package app.braid.mobile.data.settings

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.braid.mobile.domain.settings.ThemeChoice
import app.braid.mobile.domain.settings.isDark
import app.braid.mobile.support.closeAndJoin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/** A escolha de tema no DataStore de verdade, num arquivo temporário: "fechar o app" é abrir outro DataStore no mesmo arquivo. */
class ThemeRepositoryTest {
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
    fun `with nothing stored the system decides`() =
        runBlocking {
            assertNull(DataStoreThemeRepository(open()).choice.first())
        }

    @Test
    fun `the manual choice survives closing the app`() =
        runBlocking {
            DataStoreThemeRepository(open()).select(ThemeChoice.Dark)
            scopes.closeAndJoin()

            assertEquals(ThemeChoice.Dark, DataStoreThemeRepository(open()).choice.first())
        }

    @Test
    fun `the last choice wins`() =
        runBlocking {
            val themes = DataStoreThemeRepository(open())
            themes.select(ThemeChoice.Dark)
            themes.select(ThemeChoice.Light)

            assertEquals(ThemeChoice.Light, themes.choice.first())
        }

    @Test
    fun `the stored value is the one the web writes`() =
        runBlocking {
            val store = open()
            DataStoreThemeRepository(store).select(ThemeChoice.Dark)

            assertEquals("dark", store.data.first()[stringPreferencesKey("theme")])
        }

    @Test
    fun `an unknown stored value falls back to the system`() =
        runBlocking {
            val store = open()
            store.edit { it[stringPreferencesKey("theme")] = "sepia" }

            assertNull(DataStoreThemeRepository(store).choice.first())
        }

    @Test
    fun `the system decides only until the first choice`() {
        assertEquals(true, null.isDark(systemDark = true))
        assertEquals(false, null.isDark(systemDark = false))
        assertEquals(true, ThemeChoice.Dark.isDark(systemDark = false))
        assertEquals(false, ThemeChoice.Light.isDark(systemDark = true))
    }
}
