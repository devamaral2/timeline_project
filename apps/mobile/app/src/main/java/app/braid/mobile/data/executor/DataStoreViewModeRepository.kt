package app.braid.mobile.data.executor

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import app.braid.mobile.domain.executor.ViewMode
import app.braid.mobile.domain.executor.ViewModeRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

private val VIEW_MODE = stringPreferencesKey("view_mode")

/** A escolha de executor no DataStore. Valor ilegível ou ausente vale "Todos", como o armazenamento bloqueado no web. */
@Singleton
class DataStoreViewModeRepository
    @Inject
    constructor(
        private val store: DataStore<Preferences>,
    ) : ViewModeRepository {
        override val mode: Flow<ViewMode> =
            store.data
                .catch { failure -> if (failure is IOException) emit(emptyPreferences()) else throw failure }
                .map { ViewMode.fromCode(it[VIEW_MODE]) }
                .distinctUntilChanged()

        override suspend fun select(mode: ViewMode) {
            store.edit { it[VIEW_MODE] = mode.code }
        }
    }

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(name = "braid_settings")

@Module
@InstallIn(SingletonComponent::class)
object SettingsProvider {
    @Provides
    @Singleton
    fun provideSettingsDataStore(
        @ApplicationContext context: Context,
    ): DataStore<Preferences> = context.settingsDataStore

    @Provides
    @Singleton
    fun provideViewModeRepository(repository: DataStoreViewModeRepository): ViewModeRepository = repository
}
