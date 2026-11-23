package app.braid.mobile.data.chat

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.preferences.safeData
import app.braid.mobile.data.requests.ModelSelectionDto
import app.braid.mobile.data.requests.toDto
import app.braid.mobile.domain.chat.ModelSelectionStore
import app.braid.mobile.domain.chat.StoredModelSelection
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import javax.inject.Inject
import javax.inject.Singleton

private val MODEL_SELECTION = stringPreferencesKey("model_selection")

/** A mesma forma do `braid.model-selection` do web: a escolha atual e o último modelo de cada provedor. */
@Serializable
private data class StoredModelSelectionDto(
    val current: ModelSelectionDto,
    val models: Map<String, String> = emptyMap(),
)

/** A escolha do modo modelo no DataStore, como texto JSON. Texto ausente, quebrado ou de forma errada vale "nada guardado". */
@Singleton
class DataStoreModelSelectionStore
    @Inject
    constructor(
        private val store: DataStore<Preferences>,
    ) : ModelSelectionStore {
        override suspend fun read(): StoredModelSelection? {
            val raw = store.safeData().first()[MODEL_SELECTION] ?: return null
            val stored = runCatching { BraidJson.decodeFromString<StoredModelSelectionDto>(raw) }.getOrNull() ?: return null
            val provider = ModelProvider.fromCodeOrNull(stored.current.provider) ?: return null
            val effort = ModelEffort.fromCodeOrNull(stored.current.effort) ?: return null
            val models = stored.models.mapNotNull { (code, model) -> ModelProvider.fromCodeOrNull(code)?.let { it to model } }.toMap()
            return StoredModelSelection(ModelSelection(provider, stored.current.model, effort), models)
        }

        override suspend fun write(state: StoredModelSelection) {
            val dto = StoredModelSelectionDto(state.current.toDto(), state.models.mapKeys { it.key.code })
            store.edit { it[MODEL_SELECTION] = BraidJson.encodeToString(StoredModelSelectionDto.serializer(), dto) }
        }
    }
