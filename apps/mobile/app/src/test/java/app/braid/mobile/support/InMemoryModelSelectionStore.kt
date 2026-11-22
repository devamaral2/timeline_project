package app.braid.mobile.support

import app.braid.mobile.domain.chat.ModelSelectionStore
import app.braid.mobile.domain.chat.StoredModelSelection

/** Guarda a escolha do modo modelo na memória; o DataStore de verdade tem o teste dele (`ModelSelectionStoreTest`). */
class InMemoryModelSelectionStore(
    var stored: StoredModelSelection? = null,
) : ModelSelectionStore {
    override suspend fun read(): StoredModelSelection? = stored

    override suspend fun write(state: StoredModelSelection) {
        stored = state
    }
}
