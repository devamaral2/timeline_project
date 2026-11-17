package app.braid.mobile.data.settings

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.braid.mobile.data.preferences.safeData
import app.braid.mobile.domain.settings.ThemeChoice
import app.braid.mobile.domain.settings.ThemeRepository
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val THEME = stringPreferencesKey("theme")

/** A escolha de tema no DataStore (`braid_settings`). Valor ausente ou ilegível deixa o sistema decidir, como no web. */
@Singleton
class DataStoreThemeRepository
    @Inject
    constructor(
        private val store: DataStore<Preferences>,
    ) : ThemeRepository {
        override val choice: Flow<ThemeChoice?> =
            store
                .safeData()
                .map { ThemeChoice.fromCode(it[THEME]) }
                .distinctUntilChanged()

        override suspend fun select(choice: ThemeChoice) {
            store.edit { it[THEME] = choice.code }
        }
    }

@Module
@InstallIn(SingletonComponent::class)
abstract class ThemeModule {
    @Binds
    abstract fun bindThemeRepository(repository: DataStoreThemeRepository): ThemeRepository
}
