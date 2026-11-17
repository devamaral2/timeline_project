package app.braid.mobile.data.agenda

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import app.braid.mobile.data.preferences.safeData
import app.braid.mobile.domain.agenda.FreeTimeRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val FREE_TIME = booleanPreferencesKey("agenda_free_time")

/**
 * A escolha "Tempo livre" no DataStore. O web só guarda esta preferência da Agenda (`braid-agenda-free-time`); a
 * visualização "Por dia" ou "Em sequência" volta a "Por dia" a cada abertura, aqui também.
 */
@Singleton
class DataStoreFreeTimeRepository
    @Inject
    constructor(
        private val store: DataStore<Preferences>,
    ) : FreeTimeRepository {
        override val enabled: Flow<Boolean> =
            store
                .safeData()
                .map { it[FREE_TIME] ?: true }
                .distinctUntilChanged()

        override suspend fun select(enabled: Boolean) {
            store.edit { it[FREE_TIME] = enabled }
        }
    }

@Module
@InstallIn(SingletonComponent::class)
object FreeTimeModule {
    @Provides
    @Singleton
    fun provideFreeTimeRepository(repository: DataStoreFreeTimeRepository): FreeTimeRepository = repository
}
