package app.braid.mobile.support

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import app.braid.mobile.data.reminder.DataStoreExactAlarmPromptRepository
import app.braid.mobile.data.reminder.DataStoreFiredKeysStore
import app.braid.mobile.data.reminder.DataStoreNotificationPermissionRepository
import app.braid.mobile.data.reminder.DataStoreReadKeysStore
import app.braid.mobile.data.reminder.DataStoreReminderScheduleStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.io.File

/**
 * Os armazenamentos dos lembretes sobre o DataStore de verdade, num arquivo temporário: abrir outro [TestReminderStores]
 * no mesmo arquivo (depois de [close]) é "fechar e reabrir o app".
 */
class TestReminderStores(
    file: File,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val store = PreferenceDataStoreFactory.create(scope = scope) { file }
    val fired = DataStoreFiredKeysStore(store)
    val readKeys = DataStoreReadKeysStore(store)
    val schedule = DataStoreReminderScheduleStore(store)
    val exactAlarmPrompt = DataStoreExactAlarmPromptRepository(store)
    val notificationPermission = DataStoreNotificationPermissionRepository(store)

    /** Solta o arquivo e espera o DataStore terminar de verdade, para o teste poder reabri-lo. */
    suspend fun close() = listOf(scope).closeAndJoin()
}
