package app.braid.mobile.data.reminder

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import app.braid.mobile.data.preferences.safeData
import app.braid.mobile.domain.reminder.NotificationPermissionRepository
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val ASKED = booleanPreferencesKey("notification_permission_asked")

/** Se a permissão de notificação já foi pedida, no DataStore. */
@Singleton
class DataStoreNotificationPermissionRepository
    @Inject
    constructor(
        private val store: DataStore<Preferences>,
    ) : NotificationPermissionRepository {
        override val asked: Flow<Boolean> = store.safeData().map { it[ASKED] ?: false }.distinctUntilChanged()

        override suspend fun markAsked() {
            store.edit { it[ASKED] = true }
        }
    }
