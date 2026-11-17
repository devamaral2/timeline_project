package app.braid.mobile.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.emptyPreferences
import androidx.datastore.preferences.preferencesDataStore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import java.io.IOException
import javax.inject.Singleton

/** O que o DataStore tem agora; um arquivo ilegível (IO) vale vazio, e qualquer outro erro sobe. */
internal fun DataStore<Preferences>.safeData(): Flow<Preferences> =
    data.catch { failure -> if (failure is IOException) emit(emptyPreferences()) else throw failure }

private val Context.settingsDataStore: DataStore<Preferences> by preferencesDataStore(name = "braid_settings")

/** O DataStore de preferências do app (configurações, lembretes), um só para todos os repositórios. */
@Module
@InstallIn(SingletonComponent::class)
object PreferencesModule {
    @Provides
    @Singleton
    fun providePreferencesDataStore(
        @ApplicationContext context: Context,
    ): DataStore<Preferences> = context.settingsDataStore
}
