package app.braid.mobile.data.chat

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.braid.mobile.domain.chat.StoredModelSelection
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
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

/** O DataStore é o de verdade, num arquivo temporário: "fechar o app" é abrir outro DataStore no mesmo arquivo. */
class ModelSelectionStoreTest {
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

    private val saved =
        StoredModelSelection(
            ModelSelection(ModelProvider.OpenRouter, "meta/llama-5", ModelEffort.Max),
            mapOf(ModelProvider.OpenRouter to "meta/llama-5", ModelProvider.Anthropic to "claude-opus-5-5"),
        )

    @Test
    fun `with nothing stored there is no choice`() =
        runBlocking {
            assertNull(DataStoreModelSelectionStore(open()).read())
        }

    @Test
    fun `the choice survives closing the app`() =
        runBlocking {
            DataStoreModelSelectionStore(open()).write(saved)
            scopes.closeAndJoin()

            assertEquals(saved, DataStoreModelSelectionStore(open()).read())
        }

    @Test
    fun `the stored text has the shape of the web, the current choice and the last model of each provider`() =
        runBlocking {
            val store = open()
            DataStoreModelSelectionStore(store).write(saved)

            val raw = store.data.first()[stringPreferencesKey("model_selection")]
            assertEquals(
                """{"current":{"provider":"openrouter","model":"meta/llama-5","effort":"max"},""" +
                    """"models":{"openrouter":"meta/llama-5","anthropic":"claude-opus-5-5"}}""",
                raw,
            )
        }

    @Test
    fun `broken or unknown text is nothing stored`() =
        runBlocking {
            val store = open()
            val key = stringPreferencesKey("model_selection")
            for (raw in listOf(
                "{",
                "[]",
                """{"current":{"provider":"x","model":"m","effort":"low"}}""",
                """{"current":{"provider":"openai","model":"m","effort":"huge"}}""",
            )) {
                store.edit { it[key] = raw }
                assertNull(raw, DataStoreModelSelectionStore(store).read())
            }
        }
}
