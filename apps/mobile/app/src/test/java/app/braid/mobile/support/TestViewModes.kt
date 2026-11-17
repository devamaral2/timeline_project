package app.braid.mobile.support

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import app.braid.mobile.data.executor.DataStoreViewModeRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import java.io.File

/** O DataStore de verdade, num arquivo temporário: abrir outro no mesmo arquivo é "fechar e reabrir o app". */
class TestViewModes(
    private val file: File,
) : AutoCloseable {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    val repository = DataStoreViewModeRepository(PreferenceDataStoreFactory.create(scope = scope) { file })

    override fun close() = scope.cancel()
}
