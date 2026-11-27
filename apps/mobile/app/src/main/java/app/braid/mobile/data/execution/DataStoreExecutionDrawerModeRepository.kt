package app.braid.mobile.data.execution

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import app.braid.mobile.data.preferences.safeData
import app.braid.mobile.domain.execution.ExecutionDrawerMode
import app.braid.mobile.domain.execution.ExecutionDrawerModeRepository
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val EXECUTION_DRAWER_MODE = stringPreferencesKey("execution_drawer_mode")

/** A altura da gaveta de execução no DataStore. Valor ilegível ou ausente vale três linhas, como o armazenamento bloqueado no web. */
@Singleton
class DataStoreExecutionDrawerModeRepository
    @Inject
    constructor(
        private val store: DataStore<Preferences>,
    ) : ExecutionDrawerModeRepository {
        override val mode: Flow<ExecutionDrawerMode> =
            store
                .safeData()
                .map { ExecutionDrawerMode.fromCode(it[EXECUTION_DRAWER_MODE]) }
                .distinctUntilChanged()

        override suspend fun select(mode: ExecutionDrawerMode) {
            store.edit { it[EXECUTION_DRAWER_MODE] = mode.code }
        }
    }

@Module
@InstallIn(SingletonComponent::class)
object ExecutionDrawerProvider {
    @Provides
    @Singleton
    fun provideExecutionDrawerModeRepository(repository: DataStoreExecutionDrawerModeRepository): ExecutionDrawerModeRepository = repository
}
