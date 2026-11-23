package app.braid.mobile.data.reminder

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import app.braid.mobile.data.preferences.safeData
import app.braid.mobile.domain.reminder.ExactAlarmPromptRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val DISMISSED = booleanPreferencesKey("exact_alarm_prompt_dismissed")

/** Se o aviso do alarme exato foi dispensado, no DataStore. */
@Singleton
class DataStoreExactAlarmPromptRepository
    @Inject
    constructor(
        private val store: DataStore<Preferences>,
    ) : ExactAlarmPromptRepository {
        override val dismissed: Flow<Boolean> = store.safeData().map { it[DISMISSED] ?: false }.distinctUntilChanged()

        override suspend fun markDismissed() {
            store.edit { it[DISMISSED] = true }
        }
    }
