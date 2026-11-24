package app.braid.mobile.support

import app.braid.mobile.domain.chat.ModelFavorite
import app.braid.mobile.domain.chat.ModelSelectionStore
import app.braid.mobile.domain.chat.StoredModelSelection

/** Guarda a escolha do modo modelo e os favoritos na memória; o DataStore de verdade tem o teste dele (`ModelSelectionStoreTest`). */
class InMemoryModelSelectionStore(
    var stored: StoredModelSelection? = null,
    var favorites: List<ModelFavorite> = emptyList(),
) : ModelSelectionStore {
    override suspend fun read(): StoredModelSelection? = stored

    override suspend fun write(state: StoredModelSelection) {
        stored = state
    }

    override suspend fun readFavorites(): List<ModelFavorite> = favorites

    override suspend fun writeFavorites(favorites: List<ModelFavorite>) {
        this.favorites = favorites
    }
}
