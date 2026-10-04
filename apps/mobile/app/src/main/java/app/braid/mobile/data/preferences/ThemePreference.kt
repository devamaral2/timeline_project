package app.braid.mobile.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.appPreferences: DataStore<Preferences> by preferencesDataStore(name = "braid_preferences")
private val THEME_KEY = stringPreferencesKey("theme")

/** A escolha fixada na conta, como o `braid-theme` do web; ausente, vale o tema do sistema. */
enum class ThemeChoice(
    val stored: String,
) {
    Light("light"),
    Dark("dark"),
    ;

    companion object {
        fun fromStored(value: String?): ThemeChoice? = entries.firstOrNull { it.stored == value }
    }
}

interface ThemePreference {
    /** `null` enquanto a pessoa não escolheu: o app segue o sistema. */
    val choice: Flow<ThemeChoice?>

    suspend fun set(choice: ThemeChoice)
}

@Singleton
class DataStoreThemePreference
    @Inject
    constructor(
        @param:ApplicationContext private val context: Context,
    ) : ThemePreference {
        override val choice: Flow<ThemeChoice?> =
            context.appPreferences.data.map { ThemeChoice.fromStored(it[THEME_KEY]) }

        override suspend fun set(choice: ThemeChoice) {
            context.appPreferences.edit { it[THEME_KEY] = choice.stored }
        }
    }
