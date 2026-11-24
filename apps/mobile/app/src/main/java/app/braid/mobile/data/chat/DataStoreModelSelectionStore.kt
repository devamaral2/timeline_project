package app.braid.mobile.data.chat

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.braid.mobile.core.network.BraidJson
import app.braid.mobile.data.preferences.safeData
import app.braid.mobile.data.requests.ModelSelectionDto
import app.braid.mobile.data.requests.toDto
import app.braid.mobile.domain.chat.ModelFavorite
import app.braid.mobile.domain.chat.ModelSelectionStore
import app.braid.mobile.domain.chat.StoredModelSelection
import app.braid.mobile.domain.chat.isFavorite
import app.braid.mobile.domain.request.ModelEffort
import app.braid.mobile.domain.request.ModelProvider
import app.braid.mobile.domain.request.ModelSelection
import kotlinx.coroutines.flow.first
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

private val MODEL_SELECTION = stringPreferencesKey("model_selection")
private val MODEL_FAVORITES = stringPreferencesKey("model_favorites")

/** A mesma forma do `braid.model-selection` do web: a escolha atual e o último modelo de cada provedor. */
@Serializable
private data class StoredModelSelectionDto(
    val current: ModelSelectionDto,
    val models: Map<String, String> = emptyMap(),
)

/** Um favorito como o `braid.model-favorites` do web o guarda: `{"provider":"anthropic","model":"claude-sonnet-5-5"}`. */
@Serializable
private data class ModelFavoriteDto(
    val provider: String,
    val model: String,
)

/**
 * Lê os favoritos guardados, com a tolerância do `readStoredFavorites` do web: texto ausente, quebrado ou que não é uma lista
 * vale lista vazia; entrada de provedor desconhecido ou de modelo vazio ou que não é texto é largada, e a repetida também.
 */
internal fun decodeFavorites(raw: String?): List<ModelFavorite> {
    if (raw.isNullOrEmpty()) return emptyList()
    val parsed = runCatching { BraidJson.parseToJsonElement(raw) }.getOrNull() as? JsonArray ?: return emptyList()
    val favorites = mutableListOf<ModelFavorite>()
    for (entry in parsed) {
        val json = entry as? JsonObject ?: continue
        val provider = ModelProvider.fromCodeOrNull(json.text("provider")) ?: continue
        val model = json.text("model")?.takeIf { it.isNotEmpty() } ?: continue
        if (!isFavorite(favorites, provider, model)) favorites += ModelFavorite(provider, model)
    }
    return favorites
}

private fun JsonObject.text(key: String): String? = (this[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

internal fun encodeFavorites(favorites: List<ModelFavorite>): String =
    BraidJson.encodeToString(ListSerializer(ModelFavoriteDto.serializer()), favorites.map { ModelFavoriteDto(it.provider.code, it.model) })

/**
 * A escolha do modo modelo no DataStore, como texto JSON. Texto ausente, quebrado ou de forma errada vale "nada guardado".
 * Ao lado dela, na chave `model_favorites`, ficam os favoritos da folha: uma lista JSON de `{provider, model}` na ordem em
 * que foram guardados, uma só para o app inteiro (o `braid.model-favorites` do web).
 */
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

        override suspend fun readFavorites(): List<ModelFavorite> = decodeFavorites(store.safeData().first()[MODEL_FAVORITES])

        override suspend fun writeFavorites(favorites: List<ModelFavorite>) {
            store.edit { it[MODEL_FAVORITES] = encodeFavorites(favorites) }
        }
    }
